const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { gradeAnswer } = require('../services/grader');
const { enqueue: enqueueEssay } = require('../services/essayQueue');
const {
  MODEL_KEYS,
  PLAN_CAPS,
  defaultModelForPlan,
  modelAllowedForPlan,
} = require('../constants/planMatrix');
const { MIN_WORDS, MAX_WORDS } = require('../constants/delfRubric');

const router = express.Router();

function countWords(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
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

    const attempts = [];
    const essayJobs = []; // [{ questionId, content, wordCount, tooShort }]

    for (const a of answers) {
      const q = qMap.get(a.questionId);
      if (!q) continue;
      const { isCorrect, score } = gradeAnswer(q, a.answer);
      totalScore += score;
      maxScore += q.points;
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
      totalScore,
      maxScore,
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

module.exports = router;
