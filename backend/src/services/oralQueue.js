// Process-local worker that drives Oral rows through:
//   queued → transcribing → grading → done / error
//
// Mirrors essayQueue.js but with the extra transcribing phase so the UI can
// show "正在转写录音…" before "正在评分". Both phases live inside processOne;
// we don't claim rows separately for each — keeps the state machine simpler
// and avoids needing two pollers.
//
// Concurrency is lower than essay (2 vs 3): each oral spends 5-15s in STT
// followed by 4-8s of LLM grading, and STT calls can be RAM-heavy when the
// audio file is read off disk into a stream.

const path = require('path');
const prisma = require('../prisma');
const { logger } = require('../utils/logger');
const { transcribeFile } = require('./stt');
const { gradeOral } = require('./oralGrader');
const { MODEL_KEYS } = require('../constants/planMatrix');

const RECORDINGS_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'content',
  'recordings'
);

const CONCURRENCY = 2;
const POLL_MS = 1000;
const STUCK_MS = 5 * 60 * 1000;
const RETRY_DELAY_MS = 30 * 1000;

let running = false;
let stopping = false;
let inFlight = 0;
let tickTimer = null;

// Transient: keep the row queued for another pass.
// Terminal: mark error, surface to user.
const TRANSIENT_AI_CODES = new Set(['AI_RATE_LIMITED', 'AI_PROVIDER_DOWN', 'AI_CALL_FAILED']);
const TRANSIENT_STT_CODES = new Set(['STT_RATE_LIMITED', 'STT_PROVIDER_DOWN', 'STT_CALL_FAILED']);

async function claimOne() {
  const candidate = await prisma.oral.findFirst({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
  });
  if (!candidate) return null;

  const claim = await prisma.oral.updateMany({
    where: { id: candidate.id, status: 'queued' },
    data: { status: 'transcribing', updatedAt: new Date() },
  });
  if (claim.count === 0) return null;
  return { ...candidate, status: 'transcribing' };
}

// Build the marker-segmented transcript. Order matters — the LLM relies on
// these markers to attribute the `interaction` dimension to the débat phase.
function buildCombinedTranscript({ recordingsByRole, followUps }) {
  const parts = [];
  if (recordingsByRole.monologue?.transcript) {
    parts.push('[MONOLOGUE]');
    parts.push(recordingsByRole.monologue.transcript.trim());
  }
  for (const f of followUps) {
    const r = recordingsByRole.followUps.get(f.id);
    parts.push('');
    parts.push(`[DEBAT Q${f.order + 1}] ${f.text}`);
    parts.push(`[REPONSE ${f.order + 1}]`);
    parts.push(r?.transcript ? r.transcript.trim() : '(pas de réponse enregistrée)');
  }
  return parts.join('\n').trim();
}

async function transcribePending(oralRow) {
  const recordingIds = (() => {
    try { return JSON.parse(oralRow.recordingIds || '[]'); }
    catch { return []; }
  })();
  if (!Array.isArray(recordingIds) || recordingIds.length === 0) {
    const e = new Error('Oral has no recordingIds');
    e.code = 'STT_BAD_AUDIO';
    throw e;
  }

  const recordings = await prisma.recording.findMany({
    where: { id: { in: recordingIds }, userId: oralRow.userId },
  });
  if (recordings.length === 0) {
    const e = new Error('Recordings not found');
    e.code = 'STT_BAD_AUDIO';
    throw e;
  }

  // Validate all paths before starting any transcription.
  for (const rec of recordings) {
    if (rec.transcript) continue;
    const abs = path.resolve(RECORDINGS_DIR, rec.audioPath);
    if (!abs.startsWith(RECORDINGS_DIR)) {
      const e = new Error(`Audio path outside recordings dir: ${rec.audioPath}`);
      e.code = 'STT_BAD_AUDIO';
      throw e;
    }
  }

  // Transcribe all recordings in parallel — reduces wall time from N×STT to
  // ~1×STT (the longest single recording). Errors on any recording propagate
  // immediately via Promise.all.
  await Promise.all(
    recordings
      .filter((rec) => !rec.transcript)
      .map(async (rec) => {
        const abs = path.resolve(RECORDINGS_DIR, rec.audioPath);
        const { text, model } = await transcribeFile(abs, { language: 'fr' });
        await prisma.recording.update({
          where: { id: rec.id },
          data: { transcript: text, transcriptModel: model, transcribedAt: new Date() },
        });
        rec.transcript = text;
      })
  );

  return recordings;
}

async function processOne(oralRow) {
  let question;
  try {
    question = await prisma.question.findUnique({
      where: { id: oralRow.questionId },
      select: { id: true, prompt: true, passage: true },
    });
  } catch (err) {
    logger.error({ err, oralId: oralRow.id }, 'oralQueue.loadQuestion.fail');
  }
  if (!question) {
    await prisma.oral.update({
      where: { id: oralRow.id },
      data: { status: 'error', errorMessage: 'Question not found' },
    });
    return;
  }

  const followUps = await prisma.oralFollowUp.findMany({
    where: { questionId: oralRow.questionId },
    orderBy: { order: 'asc' },
  });

  const modelKey = MODEL_KEYS.includes(oralRow.model) ? oralRow.model : MODEL_KEYS[0];
  const locale = oralRow.locale || 'fr';

  // ---- Phase 1: transcribe any recordings that don't yet have a transcript.
  let recordings;
  try {
    recordings = await transcribePending(oralRow);
  } catch (err) {
    const code = err?.code || 'STT_CALL_FAILED';
    const transient = TRANSIENT_STT_CODES.has(code);
    logger.warn({ oralId: oralRow.id, code, message: err?.message, transient }, 'oralQueue.transcribe.fail');
    if (transient) {
      // Roll back to queued; another pass will re-attempt.
      setTimeout(() => {
        prisma.oral
          .updateMany({
            where: { id: oralRow.id, status: 'transcribing' },
            data: { status: 'queued' },
          })
          .catch(() => {});
      }, RETRY_DELAY_MS).unref();
    } else {
      await prisma.oral.update({
        where: { id: oralRow.id },
        data: {
          status: 'error',
          errorMessage: `${code}: ${String(err?.message || err).slice(0, 500)}`,
        },
      });
    }
    return;
  }

  // ---- Phase 2: combine transcripts and grade.
  const recordingsByRole = {
    monologue: recordings.find((r) => !r.followUpId) || null,
    followUps: new Map(recordings.filter((r) => r.followUpId).map((r) => [r.followUpId, r])),
  };
  const transcriptCombined = buildCombinedTranscript({ recordingsByRole, followUps });

  await prisma.oral.update({
    where: { id: oralRow.id },
    data: {
      status: 'grading',
      transcriptCombined,
      updatedAt: new Date(),
    },
  });

  try {
    const result = await gradeOral({
      oral: { id: oralRow.id, transcriptCombined },
      question,
      followUps: followUps.map((f) => ({ text: f.text, expectedAngle: f.expectedAngle || null })),
      modelKey,
      locale,
    });

    await prisma.oral.update({
      where: { id: oralRow.id },
      data: {
        status: 'done',
        model: result.model,
        aiScore: result.aiScore,
        aiFeedback: result.aiFeedback,
        rubric: JSON.stringify(result.rubric),
        corrections: JSON.stringify(result.corrections),
        strengths: JSON.stringify(result.strengths),
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        tokensCached: result.tokensCached,
        costUsd: result.costUsd,
        errorMessage: null,
        gradedAt: new Date(),
      },
    });
  } catch (err) {
    const code = err?.code || 'AI_CALL_FAILED';
    const transient = TRANSIENT_AI_CODES.has(code);
    logger.warn({ oralId: oralRow.id, code, message: err?.message, transient }, 'oralQueue.grade.fail');

    if (transient) {
      setTimeout(() => {
        prisma.oral
          .updateMany({
            where: { id: oralRow.id, status: 'grading' },
            data: { status: 'queued' },
          })
          .catch(() => {});
      }, RETRY_DELAY_MS).unref();
    } else {
      await prisma.oral.update({
        where: { id: oralRow.id },
        data: {
          status: 'error',
          errorMessage: `${code}: ${String(err?.message || err).slice(0, 500)}`,
        },
      });
    }
  }
}

async function tick() {
  if (stopping) return scheduleNext();
  while (inFlight < CONCURRENCY) {
    const row = await claimOne().catch((err) => {
      logger.error({ err }, 'oralQueue.claim.fail');
      return null;
    });
    if (!row) break;
    inFlight += 1;
    processOne(row)
      .catch((err) => logger.error({ err, oralId: row.id }, 'oralQueue.process.unhandled'))
      .finally(() => {
        inFlight -= 1;
        if (!stopping) tick();
      });
  }
  scheduleNext();
}

function scheduleNext() {
  if (tickTimer) clearTimeout(tickTimer);
  if (stopping && inFlight === 0) return;
  tickTimer = setTimeout(tick, POLL_MS).unref();
}

// On boot: any rows stuck in 'transcribing' or 'grading' from a previous
// process belong back in the queue. Both intermediate states are claimable.
async function recoverStuck() {
  const cutoff = new Date(Date.now() - STUCK_MS);
  const stuck = await prisma.oral.updateMany({
    where: {
      status: { in: ['transcribing', 'grading'] },
      updatedAt: { lt: cutoff },
    },
    data: { status: 'queued' },
  });
  if (stuck.count > 0) {
    logger.warn({ recovered: stuck.count }, 'oralQueue.recoverStuck');
  }
  const fresh = await prisma.oral.updateMany({
    where: {
      status: { in: ['transcribing', 'grading'] },
      updatedAt: { gte: cutoff },
    },
    data: { status: 'queued' },
  });
  if (fresh.count > 0) {
    logger.info({ recovered: fresh.count }, 'oralQueue.recoverRecent');
  }
}

async function startWorker() {
  if (running) return;
  running = true;
  stopping = false;
  try {
    await recoverStuck();
  } catch (err) {
    logger.error({ err }, 'oralQueue.recoverStuck.fail');
  }
  scheduleNext();
  logger.info({ concurrency: CONCURRENCY, pollMs: POLL_MS }, 'oralQueue.started');
}

async function drain({ timeoutMs = 15000 } = {}) {
  stopping = true;
  if (tickTimer) clearTimeout(tickTimer);
  const deadline = Date.now() + timeoutMs;
  while (inFlight > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
  logger.info({ remaining: inFlight }, 'oralQueue.drained');
}

function enqueue(_oralId) {
  if (!running || stopping) return;
  if (inFlight < CONCURRENCY) {
    setImmediate(() => tick().catch(() => {}));
  }
}

module.exports = {
  startWorker,
  drain,
  enqueue,
  RECORDINGS_DIR,
};
