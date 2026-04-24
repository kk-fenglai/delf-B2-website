const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { predictScore } = require('../services/prediction');
const { gradeAnswer } = require('../services/grader');

const router = express.Router();

// GET /api/user/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const [user, activeContract] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          id: true,
          email: true,
          name: true,
          plan: true,
          subscriptionEnd: true,
          createdAt: true,
        },
      }),
      prisma.payContract.findFirst({
        where: { userId: req.userId, status: 'ACTIVE' },
        select: { id: true, provider: true, nextChargeAt: true },
      }),
    ]);
    const now = Date.now();
    const effective = user?.subscriptionEnd && new Date(user.subscriptionEnd).getTime() > now
      ? user.plan
      : 'FREE';
    res.json({
      user: {
        ...user,
        effectivePlan: effective,
        autoRenewActive: !!activeContract,
        autoRenew: activeContract
          ? { provider: activeContract.provider, nextChargeAt: activeContract.nextChargeAt }
          : null,
      },
    });
  } catch (e) { next(e); }
});

// GET /api/user/progress - dashboard stats
router.get('/progress', requireAuth, async (req, res, next) => {
  try {
    const [sessions, attempts] = await Promise.all([
      prisma.examSession.findMany({
        where: { userId: req.userId, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        take: 20,
        include: { examSet: { select: { title: true, year: true } } },
      }),
      prisma.userAttempt.findMany({
        where: { userId: req.userId },
        include: {
          question: { select: { skill: true } },
        },
      }),
    ]);

    // Accuracy by skill
    const bySkill = {};
    for (const a of attempts) {
      const k = a.question.skill;
      bySkill[k] = bySkill[k] || { total: 0, correct: 0 };
      bySkill[k].total++;
      if (a.isCorrect) bySkill[k].correct++;
    }

    const skillStats = Object.entries(bySkill).map(([skill, v]) => ({
      skill,
      total: v.total,
      correct: v.correct,
      accuracy: v.total ? Math.round((v.correct / v.total) * 100) : 0,
    }));

    res.json({
      recentSessions: sessions.map((s) => ({
        id: s.id,
        title: s.examSet.title,
        year: s.examSet.year,
        totalScore: s.totalScore,
        maxScore: s.maxScore,
        completedAt: s.completedAt,
      })),
      skillStats,
      totalAttempts: attempts.length,
    });
  } catch (e) { next(e); }
});

// GET /api/user/prediction - exam score & pass-probability forecast
router.get('/prediction', requireAuth, async (req, res, next) => {
  try {
    // Pull all attempts with question skill/type/points. We de-dup to the most
    // recent attempt per question so re-practising doesn't double-count.
    const raw = await prisma.userAttempt.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        question: { select: { skill: true, type: true, points: true } },
      },
    });

    const seen = new Set();
    const latest = [];
    for (const a of raw) {
      if (seen.has(a.questionId)) continue;
      seen.add(a.questionId);
      latest.push(a);
    }

    const prediction = predictScore(latest);

    const lastPracticeAt = raw.length > 0 ? raw[0].createdAt : null;

    res.json({
      ...prediction,
      totalAttempts: raw.length,
      uniqueQuestions: latest.length,
      lastPracticeAt,
    });
  } catch (e) { next(e); }
});

// --- Mistake notebook (错题本) ---
// Derived from UserAttempt: we take the latest attempt per question and keep
// only those where the user answered incorrectly. Re-practising correctly
// auto-clears the question from the notebook (no separate mastered table).
// ESSAY questions are excluded — they have partial AI scores, not binary
// right/wrong, and already live in the Essay grading UI.

const OBJECTIVE_TYPES = ['SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'FILL'];
const VALID_SKILLS = ['CO', 'CE', 'PE', 'PO'];

// Collect the latest wrong attempt per question for the current user.
// Returns a Map<questionId, attempt> plus the ordered list (newest first).
async function collectLatestWrong(userId, skill) {
  const attempts = await prisma.userAttempt.findMany({
    where: {
      userId,
      question: {
        type: { in: OBJECTIVE_TYPES },
        ...(skill ? { skill } : {}),
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      question: {
        include: {
          options: true,
          examSet: { select: { id: true, title: true, year: true } },
        },
      },
    },
  });

  const seen = new Set();
  const latestWrong = [];
  for (const a of attempts) {
    if (seen.has(a.questionId)) continue;
    seen.add(a.questionId);
    if (a.isCorrect === false) latestWrong.push(a);
  }
  return latestWrong;
}

function parseUserAnswer(raw) {
  // Attempts store the answer as a string. MULTIPLE answers are JSON-serialised
  // arrays; everything else is a plain string. Try JSON first, fall back to raw.
  if (raw == null) return '';
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return parsed;
  } catch {
    return raw;
  }
}

// GET /api/user/mistakes?skill=CO&page=1&pageSize=20
router.get('/mistakes', requireAuth, async (req, res, next) => {
  try {
    const skill = VALID_SKILLS.includes(req.query.skill) ? req.query.skill : null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize, 10) || 20));

    const wrong = await collectLatestWrong(req.userId, skill);
    const total = wrong.length;
    const slice = wrong.slice((page - 1) * pageSize, page * pageSize);

    const items = slice.map((a) => {
      const q = a.question;
      const correctLabels = q.options
        .filter((o) => o.isCorrect)
        .map((o) => o.label);
      return {
        attemptId: a.id,
        questionId: q.id,
        skill: q.skill,
        type: q.type,
        prompt: q.prompt,
        passage: q.passage,
        audioUrl: q.audioUrl,
        explanation: q.explanation,
        points: q.points,
        options: q.options
          .sort((x, y) => x.order - y.order)
          .map((o) => ({ id: o.id, label: o.label, text: o.text, isCorrect: o.isCorrect })),
        correctAnswer: correctLabels,
        userAnswer: parseUserAnswer(a.answer),
        examSet: a.question.examSet,
        attemptedAt: a.createdAt,
      };
    });

    res.json({ items, total, page, pageSize });
  } catch (e) { next(e); }
});

// POST /api/user/mistakes/:questionId/retry  { answer }
// Re-grade a single mistake without creating an ExamSession. On a correct
// retry the new UserAttempt row becomes the latest for that question, so
// collectLatestWrong will drop it on next fetch — this is the mechanism
// by which mastered mistakes auto-clear from the notebook.
router.post('/mistakes/:questionId/retry', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({ answer: z.any() });
    const { answer } = schema.parse(req.body);

    const question = await prisma.question.findUnique({
      where: { id: req.params.questionId },
      include: { options: true },
    });
    if (!question) return res.status(404).json({ error: 'Question not found' });
    // Essays/speaking don't flow through the mistake notebook — guard
    // the endpoint so we never mint a bogus objective attempt for them.
    if (!OBJECTIVE_TYPES.includes(question.type)) {
      return res.status(400).json({ error: 'Question not eligible for retry' });
    }

    // Require the user to have a prior wrong attempt on this question before
    // letting them retry — otherwise the endpoint becomes a generic "grade
    // one question" surface that bypasses exam-session accounting.
    const prior = await prisma.userAttempt.findFirst({
      where: { userId: req.userId, questionId: question.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!prior || prior.isCorrect !== false) {
      return res.status(403).json({ error: 'No mistake to retry for this question' });
    }

    const { isCorrect, score } = gradeAnswer(question, answer);
    await prisma.userAttempt.create({
      data: {
        userId: req.userId,
        sessionId: null,
        questionId: question.id,
        answer: typeof answer === 'string' ? answer : JSON.stringify(answer),
        isCorrect,
        score,
      },
    });

    const correctLabels = question.options
      .filter((o) => o.isCorrect)
      .map((o) => o.label);

    res.json({
      isCorrect,
      score,
      maxScore: question.points,
      correctAnswer: correctLabels,
      explanation: question.explanation || null,
      cleared: isCorrect === true,
    });
  } catch (e) { next(e); }
});

// GET /api/user/mistakes/stats -> { total, bySkill: { CO, CE, PE, PO } }
router.get('/mistakes/stats', requireAuth, async (req, res, next) => {
  try {
    const wrong = await collectLatestWrong(req.userId, null);
    const bySkill = { CO: 0, CE: 0, PE: 0, PO: 0 };
    for (const a of wrong) {
      const s = a.question.skill;
      if (bySkill[s] !== undefined) bySkill[s]++;
    }
    res.json({ total: wrong.length, bySkill });
  } catch (e) { next(e); }
});

module.exports = router;
