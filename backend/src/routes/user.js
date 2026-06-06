const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../prisma');
const { requireAuth, requireVerifiedEmail } = require('../middleware/auth');
const passwordPolicy = require('../utils/passwordPolicy');
const { revokeAllForUser } = require('../services/refreshTokens');
const { predictScore } = require('../services/prediction');
const { gradeAnswer } = require('../services/grader');
const { signAudioUrl } = require('../utils/audioToken');
const { PLAN_CAPS } = require('../constants/planMatrix');
const { getTrialStatusForUser, startTrial, trialConfig } = require('../services/trial');
const { effectivePlan } = require('../middleware/requirePlan');
const { sanitizeExamTitle } = require('../utils/examTitle');

const router = express.Router();

// GET /api/user/sessions/quota
// FREE-plan monthly session usage by bucket (CE / CO / MOCK). Paid plans
// return freeSessions: null. The frontend uses this to render remaining
// counts on practice cards and to drive the upgrade modal.
router.get('/sessions/quota', requireAuth, async (req, res, next) => {
  try {
    const plan = req.userPlan || 'FREE';
    const caps = PLAN_CAPS[plan] || PLAN_CAPS.FREE;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const nextMonth = new Date(monthStart);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);

    if (!caps.freeMonthlySessions) {
      return res.json({ plan, freeSessions: null, resetAt: nextMonth });
    }

    const [ceUsed, coUsed, mockUsed] = await Promise.all([
      prisma.examSession.count({
        where: { userId: req.userId, startedAt: { gte: monthStart }, mode: 'PRACTICE', skill: 'CE' },
      }),
      prisma.examSession.count({
        where: { userId: req.userId, startedAt: { gte: monthStart }, mode: 'PRACTICE', skill: 'CO' },
      }),
      prisma.examSession.count({
        where: { userId: req.userId, startedAt: { gte: monthStart }, mode: 'EXAM' },
      }),
    ]);

    res.json({
      plan,
      freeSessions: {
        CE: { used: ceUsed, cap: caps.freeMonthlySessions.CE },
        CO: { used: coUsed, cap: caps.freeMonthlySessions.CO },
        MOCK: { used: mockUsed, cap: caps.freeMonthlySessions.MOCK },
      },
      resetAt: nextMonth,
    });
  } catch (e) { next(e); }
});

// GET /api/user/trial/status — trial eligibility + remaining days for logged-in user.
router.get('/trial/status', requireAuth, async (req, res, next) => {
  try {
    const trial = await getTrialStatusForUser(req.userId);
    res.json({ trial });
  } catch (e) { next(e); }
});

// POST /api/user/trial/start — manual trial activation (pricing page fallback).
router.post('/trial/start', requireAuth, requireVerifiedEmail, async (req, res, next) => {
  try {
    const result = await startTrial(req.userId, { source: 'manual' });
    res.status(201).json(result);
  } catch (e) {
    if (e.code) {
      return res.status(e.status || 400).json({ error: e.message, code: e.code });
    }
    next(e);
  }
});

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
          trialUsedAt: true,
          createdAt: true,
        },
      }),
      prisma.payContract.findFirst({
        where: { userId: req.userId, status: 'ACTIVE' },
        select: { id: true, provider: true, nextChargeAt: true },
      }),
    ]);
    const now = Date.now();
    const effective = effectivePlan(user);
    const trial = await getTrialStatusForUser(req.userId);
    res.json({
      user: {
        ...user,
        effectivePlan: effective,
        autoRenewActive: !!activeContract,
        autoRenew: activeContract
          ? { provider: activeContract.provider, nextChargeAt: activeContract.nextChargeAt }
          : null,
        trial,
      },
    });
  } catch (e) { next(e); }
});

// GET /api/user/progress - dashboard stats
router.get('/progress', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;
    const [sessions, totalAttempts, skillRows] = await Promise.all([
      prisma.examSession.findMany({
        where: { userId, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        take: 20,
        include: { examSet: { select: { title: true } } },
      }),
      prisma.userAttempt.count({ where: { userId } }),
      prisma.$queryRaw`
        SELECT q.skill AS skill,
               COUNT(*)::int AS total,
               SUM(CASE WHEN ua."isCorrect" = true THEN 1 ELSE 0 END)::int AS correct
        FROM "UserAttempt" ua
        INNER JOIN "Question" q ON ua."questionId" = q.id
        WHERE ua."userId" = ${userId}
        GROUP BY q.skill
      `,
    ]);

    const skillStats = skillRows.map((row) => ({
      skill: row.skill,
      total: row.total,
      correct: row.correct,
      accuracy: row.total ? Math.round((row.correct / row.total) * 100) : 0,
    }));

    res.json({
      recentSessions: sessions.map((s) => ({
        id: s.id,
        title: sanitizeExamTitle(s.examSet.title),
        totalScore: s.totalScore,
        maxScore: s.maxScore,
        completedAt: s.completedAt,
      })),
      skillStats,
      totalAttempts,
    });
  } catch (e) { next(e); }
});

// GET /api/user/prediction - exam score & pass-probability forecast
router.get('/prediction', requireAuth, async (req, res, next) => {
  try {
    const userId = req.userId;
    // One row per question (latest attempt) — avoids loading the full history.
    const [latestRows, totalAttempts, lastPractice] = await Promise.all([
      prisma.$queryRaw`
        SELECT DISTINCT ON (ua."questionId")
          ua."questionId",
          ua."isCorrect",
          ua."score",
          ua."createdAt",
          q.skill,
          q.type,
          q.points
        FROM "UserAttempt" ua
        INNER JOIN "Question" q ON ua."questionId" = q.id
        WHERE ua."userId" = ${userId}
        ORDER BY ua."questionId", ua."createdAt" DESC
      `,
      prisma.userAttempt.count({ where: { userId } }),
      prisma.userAttempt.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    const latest = latestRows.map((row) => ({
      questionId: row.questionId,
      isCorrect: row.isCorrect,
      score: row.score,
      createdAt: row.createdAt,
      question: {
        skill: row.skill,
        type: row.type,
        points: row.points,
      },
    }));

    const prediction = predictScore(latest);

    res.json({
      ...prediction,
      totalAttempts,
      uniqueQuestions: latest.length,
      lastPracticeAt: lastPractice?.createdAt ?? null,
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
          examSet: { select: { id: true, title: true } },
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
        audioUrl: signAudioUrl(q.audioUrl),
        explanation: q.explanation,
        points: q.points,
        options: q.options
          .sort((x, y) => x.order - y.order)
          .map((o) => ({ id: o.id, label: o.label, text: o.text, isCorrect: o.isCorrect })),
        correctAnswer: correctLabels,
        userAnswer: parseUserAnswer(a.answer),
        examSet: {
          id: a.question.examSet.id,
          title: sanitizeExamTitle(a.question.examSet.title),
        },
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

// POST /api/user/change-password  { oldPassword, newPassword }
const changePwdSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(10)
    .max(100)
    .refine((p) => passwordPolicy.validate(p).ok, (p) => ({
      message: passwordPolicy.validate(p).reasons.join('; ') || 'Weak password',
    })),
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = changePwdSchema.parse(req.body);

    const me = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        deletedAt: true,
        role: true,
      },
    });
    if (!me || me.status !== 'ACTIVE' || me.deletedAt) {
      return res.status(403).json({ error: '账户不可用' });
    }
    if (me.role === 'ADMIN' || me.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: '管理员账户请在管理后台修改密码' });
    }

    const ok = await bcrypt.compare(oldPassword, me.passwordHash);
    if (!ok) return res.status(401).json({ error: '旧密码错误' });

    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: me.id },
      data: { passwordHash: hash, failedLoginCount: 0, lockedUntil: null },
    });

    try { await revokeAllForUser(me.id, { reason: 'PASSWORD_CHANGE' }); } catch { /* ignore */ }

    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
