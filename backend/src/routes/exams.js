const express = require('express');
const prisma = require('../prisma');
const { optionalAuth, requireAuth } = require('../middleware/auth');
const { signAudioUrl } = require('../utils/audioToken');

const router = express.Router();

// Shape a Question row for the client. Drops `passage` on CO (recording
// transcript — must not leak to the candidate) and rewrites `audioUrl` to
// the signed short-lived form so the streaming handler will accept it.
// For CO questions, audio now lives on the shared AudioDocument; we still
// expose `audioDocumentId` so the runner knows which document a question
// belongs to.
function sanitizeQuestionForClient(q) {
  const passage = q.skill === 'CO' ? null : (q.readingPassage?.content || q.passage);
  return {
    id: q.id,
    skill: q.skill,
    type: q.type,
    order: q.order,
    prompt: q.prompt,
    passage,
    // CO audio is delivered via audioDocuments[] only — don't surface the
    // legacy per-question audioUrl for CO so the frontend can't accidentally
    // bypass the document-level play count.
    audioUrl: q.skill === 'CO' ? null : signAudioUrl(q.audioUrl),
    audioDocumentId: q.skill === 'CO' ? (q.audioDocumentId || null) : null,
    points: q.points,
    options: q.options,
    followUps: (q.followUps || []).map((f) => ({
      ...f,
      audioUrl: signAudioUrl(f.audioUrl),
    })),
  };
}

// AudioDocument → client-facing shape. URL is signed; transcript fields (if
// any) are deliberately omitted — none exist on the model today but if we
// add one later the default should remain "do not leak to runner".
function sanitizeAudioDocument(d) {
  return {
    id: d.id,
    order: d.order,
    title: d.title || null,
    audioUrl: signAudioUrl(d.audioUrl),
    maxPlays: d.maxPlays,
    prepSeconds: d.prepSeconds,
    gapSeconds: d.gapSeconds,
    answerSeconds: d.answerSeconds,
  };
}

// GET /api/exams  - list all exam sets (brief)
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const skill = req.query.skill; // optional: CO | CE | PE | PO — returns pure single-skill sets only
    const mock  = req.query.mock;  // optional: 'true' — returns sets that have all 4 skills
    const MOCK_SKILLS = ['CO', 'CE', 'PE', 'PO'];

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

    let filtered;
    if (skill) {
      // 严格单科：该套题只包含这一个 skill
      filtered = result.filter((s) => {
        const skills = Object.keys(s.countsBySkill).filter((k) => s.countsBySkill[k] > 0);
        return skills.length === 1 && skills[0] === skill;
      });
    } else if (mock === 'true') {
      // 全真模拟：必须包含全部四个 skill
      filtered = result.filter((s) =>
        MOCK_SKILLS.every((k) => (s.countsBySkill[k] || 0) > 0),
      );
    } else {
      filtered = result;
    }

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
            readingPassage: {
              select: { id: true, content: true },
            },
            options: {
              orderBy: { order: 'asc' },
              select: { id: true, label: true, text: true, order: true },
            },
            followUps: {
              orderBy: { order: 'asc' },
              // expectedAngle is examiner-only — never leaked to the client.
              select: { id: true, order: true, text: true, audioUrl: true },
            },
          },
        },
        audioDocuments: { orderBy: { order: 'asc' } },
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

    // Strip answer fields from options/explanation on delivery. CO transcripts
    // are scrubbed and audioUrls are rewritten to signed form — see
    // sanitizeQuestionForClient at the top of this file.
    const safeQuestions = set.questions.map(sanitizeQuestionForClient);
    // If the runner is in single-skill (CO) mode, only return the audio
    // documents whose questions are actually included. In mock-exam mode
    // (no skill filter) all docs come along.
    const includedDocIds = new Set(safeQuestions.map((q) => q.audioDocumentId).filter(Boolean));
    const audioDocuments = set.audioDocuments
      .filter((d) => !skill || skill !== 'CO' || includedDocIds.has(d.id))
      .map(sanitizeAudioDocument);

    res.json({
      id: set.id,
      title: set.title,
      year: set.year,
      description: set.description,
      questions: safeQuestions,
      audioDocuments,
    });
  } catch (e) { next(e); }
});

module.exports = router;
