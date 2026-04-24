const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { gradeAnswer } = require('../services/grader');
const { enqueue: enqueueEssay } = require('../services/essayQueue');
const PDFDocument = require('pdfkit');
const {
  MODEL_KEYS,
  PLAN_CAPS,
  defaultModelForPlan,
  modelAllowedForPlan,
} = require('../constants/planMatrix');
const { MIN_WORDS, MAX_WORDS } = require('../constants/delfRubric');

const router = express.Router();

function parseStoredAnswer(raw) {
  if (raw == null) return '';
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function countWords(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

async function buildSessionResult({ sessionId, userId }) {
  const session = await prisma.examSession.findUnique({
    where: { id: sessionId },
    include: {
      examSet: {
        include: {
          questions: {
            orderBy: { order: 'asc' },
            include: {
              options: { orderBy: { order: 'asc' } },
            },
          },
        },
      },
      attempts: true,
    },
  });

  if (!session || session.userId !== userId) return null;

  const exam = {
    id: session.examSet.id,
    title: session.examSet.title,
    year: session.examSet.year,
    description: session.examSet.description,
    questions: session.examSet.questions.map((q) => ({
      id: q.id,
      skill: q.skill,
      type: q.type,
      order: q.order,
      prompt: q.prompt,
      passage: q.passage,
      audioUrl: q.audioUrl,
      points: q.points,
      options: q.options.map((o) => ({
        id: o.id,
        label: o.label,
        text: o.text,
        order: o.order,
      })),
    })),
  };

  const questionsById = new Map(session.examSet.questions.map((q) => [q.id, q]));
  const latestAttemptByQ = new Map();
  for (const a of session.attempts.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt))) {
    if (!latestAttemptByQ.has(a.questionId)) latestAttemptByQ.set(a.questionId, a);
  }

  const attemptedQuestions = Array.from(latestAttemptByQ.keys())
    .map((id) => questionsById.get(id))
    .filter(Boolean);
  const attemptedSkillSet = new Set(attemptedQuestions.map((q) => q.skill));
  const practiceSingleSkill =
    session.mode === 'PRACTICE' && attemptedSkillSet.size === 1
      ? Array.from(attemptedSkillSet)[0]
      : null;

  const perSkill = {
    CO: { score: 0, maxScore: 0, pendingAI: false },
    CE: { score: 0, maxScore: 0, pendingAI: false },
    PE: { score: 0, maxScore: 0, pendingAI: false },
    PO: { score: 0, maxScore: 0, pendingAI: false },
  };

  let totalScore = 0;
  let maxScore = 0;
  const details = [];

  const sourceQuestions = practiceSingleSkill
    ? session.examSet.questions.filter((q) => q.skill === practiceSingleSkill)
    : session.examSet.questions;

  for (const q of sourceQuestions) {
    const a = latestAttemptByQ.get(q.id) || null;
    const correctOptions = q.options.filter((o) => o.isCorrect).map((o) => o.label);
    const score = a?.score ?? 0;
    const isCorrect = a?.isCorrect ?? null;
    totalScore += score;
    maxScore += q.points;
    if (perSkill[q.skill]) {
      perSkill[q.skill].score += score;
      perSkill[q.skill].maxScore += q.points;
      if (q.type === 'ESSAY' || q.type === 'SPEAKING') perSkill[q.skill].pendingAI = true;
    }
    details.push({
      questionId: q.id,
      userAnswer: a ? parseStoredAnswer(a.answer) : '',
      correctAnswer: correctOptions.length ? correctOptions : null,
      isCorrect,
      score,
      maxScore: q.points,
      explanation: q.explanation,
      essayId: null,
      essayStatus: null,
    });
  }

  const essays = await prisma.essay.findMany({
    where: { sessionId: session.id, userId },
    select: {
      id: true,
      questionId: true,
      status: true,
      model: true,
      errorMessage: true,
      aiScore: true,
      aiFeedback: true,
      rubric: true,
      gradedAt: true,
    },
  });

  const essayByQ = new Map(essays.map((e) => [e.questionId, e]));
  for (const d of details) {
    const e = essayByQ.get(d.questionId);
    if (e) {
      d.essayId = e.id;
      d.essayStatus = e.status;
    }
  }

  const safeExam = practiceSingleSkill
    ? { ...exam, questions: exam.questions.filter((q) => q.skill === practiceSingleSkill) }
    : exam;

  return {
    session,
    exam: safeExam,
    result: {
      sessionId: session.id,
      mode: session.mode,
      totalScore,
      maxScore,
      perSkill,
      thresholds: { passTotal: 50, passPerSkill: 5, skillMax: 25 },
      details,
      essays: essays.map((e) => ({
        essayId: e.id,
        questionId: e.questionId,
        status: e.status,
        model: e.model,
        errorMessage: e.errorMessage,
      })),
    },
  };
}

function scaleTo25(score, max) {
  if (!max) return 0;
  return Math.round((score / max) * 25 * 10) / 10;
}

// POST /api/sessions  { examSetId, mode, skill? } -> create new session
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      examSetId: z.string(),
      mode: z.enum(['PRACTICE', 'EXAM']).default('PRACTICE'),
    });
    const data = schema.parse(req.body);

    const session = await prisma.examSession.create({
      data: {
        userId: req.userId,
        examSetId: data.examSetId,
        mode: data.mode,
      },
    });
    res.status(201).json({ session });
  } catch (e) { next(e); }
});

// POST /api/sessions/:id/submit  { answers, aiModel?, aiLocale? }
// ESSAY answers don't contribute to totalScore — they spawn async Essay rows
// graded by services/essayQueue. The submit response returns immediately with
// { essays: [{ questionId, essayId, status }] } so the client can poll.
router.post('/:id/submit', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      answers: z.array(
        z.object({
          questionId: z.string(),
          answer: z.any(),
          timeSpent: z.number().optional(),
        })
      ),
      aiModel: z.enum(MODEL_KEYS).optional(),
      aiLocale: z.enum(['fr', 'en', 'zh']).optional(),
    });
    const { answers, aiModel, aiLocale } = schema.parse(req.body);

    const session = await prisma.examSession.findUnique({
      where: { id: req.params.id },
    });
    if (!session || session.userId !== req.userId) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const questionIds = answers.map((a) => a.questionId);
    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      include: { options: true },
    });
    const qMap = new Map(questions.map((q) => [q.id, q]));

    // Decide AI model + plan gating once for this submission.
    const userPlan = req.userPlan || 'FREE';
    const caps = PLAN_CAPS[userPlan] || PLAN_CAPS.FREE;
    const canUseAI = caps.models.length > 0;
    const requestedModel = aiModel && modelAllowedForPlan(userPlan, aiModel)
      ? aiModel
      : defaultModelForPlan(userPlan);
    const locale = aiLocale || 'fr';

    let totalScore = 0;
    let maxScore = 0;
    // Per-skill breakdown — mock-exam review and DELF B2 pass-gate UI both
    // depend on this. Keys are always the four skills so the client can
    // iterate without null checks.
    const perSkill = {
      CO: { score: 0, maxScore: 0, pendingAI: false },
      CE: { score: 0, maxScore: 0, pendingAI: false },
      PE: { score: 0, maxScore: 0, pendingAI: false },
      PO: { score: 0, maxScore: 0, pendingAI: false },
    };

    const attempts = [];
    const essayJobs = []; // [{ questionId, content, wordCount, tooShort }]

    for (const a of answers) {
      const q = qMap.get(a.questionId);
      if (!q) continue;
      const { isCorrect, score } = gradeAnswer(q, a.answer);
      totalScore += score;
      maxScore += q.points;
      if (perSkill[q.skill]) {
        perSkill[q.skill].score += score;
        perSkill[q.skill].maxScore += q.points;
        // Essays/speaking are graded asynchronously — flag the section so the
        // UI can label the score as "provisional" until AI grading lands.
        if (q.type === 'ESSAY' || q.type === 'SPEAKING') {
          perSkill[q.skill].pendingAI = true;
        }
      }
      attempts.push({
        userId: req.userId,
        sessionId: session.id,
        questionId: q.id,
        answer: typeof a.answer === 'string' ? a.answer : JSON.stringify(a.answer),
        isCorrect,
        score,
        timeSpent: a.timeSpent || null,
      });

      if (q.type === 'ESSAY' && typeof a.answer === 'string' && a.answer.trim()) {
        const wordCount = countWords(a.answer);
        essayJobs.push({
          questionId: q.id,
          content: a.answer,
          wordCount,
          tooShort: wordCount < MIN_WORDS,
        });
      }
    }

    await prisma.$transaction([
      prisma.userAttempt.createMany({ data: attempts }),
      prisma.examSession.update({
        where: { id: session.id },
        data: { completedAt: new Date(), totalScore, maxScore },
      }),
    ]);

    // Create Essay rows outside the transaction so a DB hiccup on essays
    // doesn't rollback the scored attempts. Each row is independent.
    const createdEssays = [];
    for (const job of essayJobs) {
      // Quota check per essay (cheap — index on userId+createdAt).
      let quotaBlocked = false;
      if (canUseAI && !job.tooShort) {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthUsed = await prisma.essay.count({
          where: { userId: req.userId, createdAt: { gte: monthStart } },
        });
        if (monthUsed >= caps.monthlyEssays) quotaBlocked = true;
      }

      const skipAI = !canUseAI || job.tooShort || quotaBlocked;
      const row = await prisma.essay.create({
        data: {
          userId: req.userId,
          sessionId: session.id,
          questionId: job.questionId,
          content: job.content,
          wordCount: job.wordCount,
          status: skipAI ? 'error' : 'queued',
          model: skipAI ? null : requestedModel,
          locale: skipAI ? null : locale,
          errorMessage: job.tooShort
            ? 'ESSAY_TOO_SHORT'
            : !canUseAI
              ? 'PLAN_UPGRADE_REQUIRED'
              : quotaBlocked
                ? 'QUOTA_EXCEEDED'
                : null,
        },
      });
      createdEssays.push(row);
      if (!skipAI) enqueueEssay(row.id);
    }

    const details = answers.map((a) => {
      const q = qMap.get(a.questionId);
      if (!q) return null;
      const { isCorrect, score } = gradeAnswer(q, a.answer);
      const correctOptions = q.options.filter((o) => o.isCorrect).map((o) => o.label);
      const essay = createdEssays.find((e) => e.questionId === q.id);
      return {
        questionId: q.id,
        userAnswer: a.answer,
        correctAnswer: correctOptions.length ? correctOptions : null,
        isCorrect,
        score,
        maxScore: q.points,
        explanation: q.explanation,
        essayId: essay?.id || null,
        essayStatus: essay?.status || null,
      };
    }).filter(Boolean);

    res.json({
      sessionId: session.id,
      mode: session.mode,
      totalScore,
      maxScore,
      perSkill,
      thresholds: {
        passTotal: 50,
        passPerSkill: 5,
        skillMax: 25,
      },
      details,
      essays: createdEssays.map((e) => ({
        essayId: e.id,
        questionId: e.questionId,
        status: e.status,
        model: e.model,
        errorMessage: e.errorMessage,
      })),
    });
  } catch (e) { next(e); }
});

// GET /api/sessions/:id  - session summary (must be owner)
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const session = await prisma.examSession.findUnique({
      where: { id: req.params.id },
      include: {
        attempts: true,
        examSet: { select: { title: true, year: true } },
      },
    });
    if (!session || session.userId !== req.userId) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({ session });
  } catch (e) { next(e); }
});

// GET /api/sessions/:id/result  -> { exam, result, isMock }
router.get('/:id/result', requireAuth, async (req, res, next) => {
  try {
    const built = await buildSessionResult({ sessionId: req.params.id, userId: req.userId });
    if (!built) return res.status(404).json({ error: 'Session not found' });
    res.json({
      exam: built.exam,
      result: built.result,
      isMock: built.session.mode === 'EXAM',
    });
  } catch (e) { next(e); }
});

// GET /api/sessions/:id/report.pdf  -> PDF score report
router.get('/:id/report.pdf', requireAuth, async (req, res, next) => {
  try {
    const built = await buildSessionResult({ sessionId: req.params.id, userId: req.userId });
    if (!built) return res.status(404).json({ error: 'Session not found' });

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true, name: true },
    });

    const filename = `DELFluent-${built.exam.year}-${built.exam.title}`
      .replace(/[^a-zA-Z0-9-_]+/g, '_')
      .slice(0, 80);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);

    doc.fontSize(20).text('DELFluent · Score Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Exam: ${built.exam.title} (${built.exam.year})`);
    doc.text(`Candidate: ${(user?.name || user?.email || '').trim()}`);
    doc.text(`Session ID: ${built.result.sessionId}`);
    doc.text(`Completed: ${built.session.completedAt ? new Date(built.session.completedAt).toLocaleString() : '—'}`);
    doc.moveDown(1);

    doc.fontSize(14).text('Score', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Raw total: ${built.result.totalScore} / ${built.result.maxScore}`);

    const per = built.result.perSkill || {};
    const order = ['CO', 'CE', 'PE', 'PO'];
    const perScaled = order
      .map((k) => ({ skill: k, ...per[k] }))
      .filter((r) => r && r.maxScore > 0);
    if (perScaled.length) {
      doc.moveDown(0.5);
      doc.text('Per section (scaled to /25):');
      perScaled.forEach((r) => {
        const scaled = scaleTo25(r.score, r.maxScore);
        const pending = r.pendingAI ? ' (pending AI)' : '';
        doc.text(`- ${r.skill}: ${scaled} / 25  (raw ${r.score}/${r.maxScore})${pending}`);
      });
      const totalScaled = perScaled.reduce((s, r) => s + scaleTo25(r.score, r.maxScore), 0);
      doc.text(`DELF equivalent: ${totalScaled.toFixed(1)} / 100`);
    }

    const essays = await prisma.essay.findMany({
      where: { sessionId: built.session.id, userId: req.userId },
      select: { questionId: true, status: true, aiScore: true, aiFeedback: true },
    });
    const essayDone = essays.filter((e) => e.status === 'done');
    if (essayDone.length) {
      doc.addPage();
      doc.fontSize(14).text('Writing feedback (AI)', { underline: true });
      doc.moveDown(0.5);
      for (const e of essayDone) {
        const q = built.exam.questions.find((qq) => qq.id === e.questionId);
        doc.fontSize(12).text(`Question: ${q?.prompt || e.questionId}`);
        doc.text(`AI score: ${e.aiScore ?? '—'} / 25`);
        if (e.aiFeedback) doc.text(String(e.aiFeedback).slice(0, 1800));
        doc.moveDown(1);
      }
    }

    doc.end();
  } catch (e) { next(e); }
});

module.exports = router;
