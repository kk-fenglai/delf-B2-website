// Process-local worker that drives Essay rows from "queued" → "done"/"error".
//
// Why DB-as-queue (no Redis/BullMQ):
//  - Zero new infra; fits the current single-instance deploy target
//  - Crash-safe: on boot we requeue anything still in 'grading' from last run
//  - Essay table already carries the full state; no second source of truth
//
// Throughput: CONCURRENCY essays in flight at once, polling every POLL_MS.
// Good for ~100 DAU. Past that, swap this module for a BullMQ consumer —
// the Essay row schema stays the same.

const prisma = require('../prisma');
const { logger } = require('../utils/logger');
const { gradeEssay } = require('./aiGrader');
const { MODEL_KEYS } = require('../constants/planMatrix');

const CONCURRENCY = 3;
const POLL_MS = 1500;
const STUCK_MS = 5 * 60 * 1000;    // rows in 'grading' older than this are orphaned
const RETRY_DELAY_MS = 30 * 1000;  // after AI_RATE_LIMITED, re-queue with a short cooldown

let running = false;
let stopping = false;
let inFlight = 0;
let tickTimer = null;

// Transient errors → row stays 'queued' for another pass.
// Terminal errors → row becomes 'error' with errorMessage.
const TRANSIENT_CODES = new Set(['AI_RATE_LIMITED', 'AI_PROVIDER_DOWN', 'AI_CALL_FAILED']);

async function claimOne() {
  // Claim the oldest queued essay. On SQLite the updateMany + take-1 pattern
  // isn't atomic, so if we ever migrate to Postgres we'd use FOR UPDATE SKIP
  // LOCKED; for now concurrency is low enough that racing on the same row is
  // extremely unlikely, and the idempotent status guard below rejects it.
  const candidate = await prisma.essay.findFirst({
    where: { status: 'queued' },
    orderBy: { createdAt: 'asc' },
  });
  if (!candidate) return null;

  const claim = await prisma.essay.updateMany({
    where: { id: candidate.id, status: 'queued' }, // guard: still queued
    data: { status: 'grading', updatedAt: new Date() },
  });
  if (claim.count === 0) return null; // someone else grabbed it
  return candidate;
}

async function processOne(essayRow) {
  let question;
  try {
    question = await prisma.question.findUnique({
      where: { id: essayRow.questionId },
      select: { prompt: true },
    });
  } catch (err) {
    logger.error({ err, essayId: essayRow.id }, 'essayQueue.loadQuestion.fail');
  }
  if (!question) {
    await prisma.essay.update({
      where: { id: essayRow.id },
      data: {
        status: 'error',
        errorMessage: 'Question not found',
      },
    });
    return;
  }

  // The model + locale were recorded on the Essay row at enqueue time
  // (or by regrade). Fall back to sensible defaults to avoid dead rows.
  const modelKey = MODEL_KEYS.includes(essayRow.model) ? essayRow.model : 'haiku-4-5';
  const locale = essayRow.locale || 'fr';

  try {
    const result = await gradeEssay({
      essay: { id: essayRow.id, content: essayRow.content, wordCount: essayRow.wordCount },
      question,
      modelKey,
      locale,
    });

    await prisma.essay.update({
      where: { id: essayRow.id },
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
    const transient = TRANSIENT_CODES.has(code);
    logger.warn(
      { essayId: essayRow.id, code, message: err?.message, transient },
      'essayQueue.grade.fail'
    );

    if (transient) {
      // Push back into the queue with a brief cooldown so we don't hot-loop.
      setTimeout(() => {
        prisma.essay
          .updateMany({
            where: { id: essayRow.id, status: 'grading' },
            data: { status: 'queued' },
          })
          .catch(() => {});
      }, RETRY_DELAY_MS).unref();
    } else {
      await prisma.essay.update({
        where: { id: essayRow.id },
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
      logger.error({ err }, 'essayQueue.claim.fail');
      return null;
    });
    if (!row) break;
    inFlight += 1;
    processOne(row)
      .catch((err) => logger.error({ err, essayId: row.id }, 'essayQueue.process.unhandled'))
      .finally(() => {
        inFlight -= 1;
        // On completion, immediately attempt to pull the next one rather than
        // wait a full poll interval.
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

// On boot: any rows stuck in 'grading' from a previous process belong back in
// the queue. Anything older than STUCK_MS is safe to reclaim.
async function recoverStuck() {
  const cutoff = new Date(Date.now() - STUCK_MS);
  const res = await prisma.essay.updateMany({
    where: {
      status: 'grading',
      updatedAt: { lt: cutoff },
    },
    data: { status: 'queued' },
  });
  if (res.count > 0) {
    logger.warn({ recovered: res.count }, 'essayQueue.recoverStuck');
  }
  // Also requeue anything in 'grading' from before this process started — if
  // we're the only worker, all such rows are orphans regardless of age.
  const fresh = await prisma.essay.updateMany({
    where: { status: 'grading', updatedAt: { gte: cutoff } },
    data: { status: 'queued' },
  });
  if (fresh.count > 0) {
    logger.info({ recovered: fresh.count }, 'essayQueue.recoverRecent');
  }
}

async function startWorker() {
  if (running) return;
  running = true;
  stopping = false;
  try {
    await recoverStuck();
  } catch (err) {
    logger.error({ err }, 'essayQueue.recoverStuck.fail');
  }
  scheduleNext();
  logger.info({ concurrency: CONCURRENCY, pollMs: POLL_MS }, 'essayQueue.started');
}

// Called from index.js shutdown hook. Waits up to timeoutMs for in-flight
// essays to finish writing. Incoming submits past this point simply land as
// 'queued' in DB and will be picked up by the next process.
async function drain({ timeoutMs = 12000 } = {}) {
  stopping = true;
  if (tickTimer) clearTimeout(tickTimer);
  const deadline = Date.now() + timeoutMs;
  while (inFlight > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
  }
  logger.info({ remaining: inFlight }, 'essayQueue.drained');
}

// Fast-path: kick the scheduler immediately so a freshly-submitted essay
// doesn't have to wait POLL_MS for the next tick. Safe to call from any
// request handler; no-op if we're already at concurrency cap.
function enqueue(_essayId) {
  if (!running || stopping) return;
  if (inFlight < CONCURRENCY) {
    // Defer to next tick of the event loop to avoid interleaving with the
    // caller's transaction.
    setImmediate(() => tick().catch(() => {}));
  }
}

module.exports = { startWorker, drain, enqueue };
