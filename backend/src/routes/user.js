const express = require('express');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { predictScore } = require('../services/prediction');

const router = express.Router();

// GET /api/user/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        subscriptionEnd: true,
        createdAt: true,
      },
    });
    res.json({ user });
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

module.exports = router;
