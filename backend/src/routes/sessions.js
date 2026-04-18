const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { gradeAnswer } = require('../services/grader');

const router = express.Router();

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

// POST /api/sessions/:id/submit  { answers: [{questionId, answer, timeSpent}] }
router.post('/:id/submit', requireAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      answers: z.array(
        z.object({
          questionId: z.string(),
          answer: z.any(), // string or array
          timeSpent: z.number().optional(),
        })
      ),
    });
    const { answers } = schema.parse(req.body);

    const session = await prisma.examSession.findUnique({
      where: { id: req.params.id },
    });
    if (!session || session.userId !== req.userId) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Fetch all questions with options (with isCorrect)
    const questionIds = answers.map((a) => a.questionId);
    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      include: { options: true },
    });
    const qMap = new Map(questions.map((q) => [q.id, q]));

    let totalScore = 0;
    let maxScore = 0;

    const attempts = [];
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
    }

    await prisma.$transaction([
      prisma.userAttempt.createMany({ data: attempts }),
      prisma.examSession.update({
        where: { id: session.id },
        data: {
          completedAt: new Date(),
          totalScore,
          maxScore,
        },
      }),
    ]);

    // Build response with correctness and explanations
    const details = answers.map((a) => {
      const q = qMap.get(a.questionId);
      if (!q) return null;
      const { isCorrect, score } = gradeAnswer(q, a.answer);
      const correctOptions = q.options.filter((o) => o.isCorrect).map((o) => o.label);
      return {
        questionId: q.id,
        userAnswer: a.answer,
        correctAnswer: correctOptions.length ? correctOptions : null,
        isCorrect,
        score,
        maxScore: q.points,
        explanation: q.explanation,
      };
    }).filter(Boolean);

    res.json({
      sessionId: session.id,
      totalScore,
      maxScore,
      details,
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
