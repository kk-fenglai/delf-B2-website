const express = require('express');
const prisma = require('../prisma');
const { optionalAuth, requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/exams  - list all exam sets (brief)
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const skill = req.query.skill; // optional filter: CO | CE | PE | PO
    const sets = await prisma.examSet.findMany({
      where: { isPublished: true },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
      include: {
        questions: {
          select: { id: true, skill: true },
        },
      },
    });

    const result = sets.map((s) => {
      const counts = s.questions.reduce((acc, q) => {
        acc[q.skill] = (acc[q.skill] || 0) + 1;
        return acc;
      }, {});
      return {
        id: s.id,
        title: s.title,
        year: s.year,
        description: s.description,
        isFreePreview: s.isFreePreview,
        totalQuestions: s.questions.length,
        countsBySkill: counts,
      };
    });

    const filtered = skill
      ? result.filter((s) => (s.countsBySkill[skill] || 0) > 0)
      : result;

    res.json({ sets: filtered });
  } catch (e) { next(e); }
});

// GET /api/exams/:id  - full exam set with questions (no answers leaked)
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const skill = req.query.skill;
    const set = await prisma.examSet.findUnique({
      where: { id: req.params.id },
      include: {
        questions: {
          where: skill ? { skill } : undefined,
          orderBy: { order: 'asc' },
          include: {
            options: {
              orderBy: { order: 'asc' },
              select: { id: true, label: true, text: true, order: true },
            },
          },
        },
      },
    });
    if (!set) return res.status(404).json({ error: 'Exam set not found' });

    // Access control: free users can only access free preview sets
    const isPaid = req.userPlan && req.userPlan !== 'FREE';
    if (!set.isFreePreview && !isPaid) {
      return res.status(403).json({
        error: '该套题需要订阅标准版或AI版后解锁',
        requiresUpgrade: true,
      });
    }

    // Strip answer fields from options/explanation on delivery
    const safeQuestions = set.questions.map((q) => ({
      id: q.id,
      skill: q.skill,
      type: q.type,
      order: q.order,
      prompt: q.prompt,
      passage: q.passage,
      audioUrl: q.audioUrl,
      points: q.points,
      options: q.options, // isCorrect already excluded
    }));

    res.json({
      id: set.id,
      title: set.title,
      year: set.year,
      description: set.description,
      questions: safeQuestions,
    });
  } catch (e) { next(e); }
});

module.exports = router;
