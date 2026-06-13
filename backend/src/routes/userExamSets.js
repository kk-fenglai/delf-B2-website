const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { z } = require('zod');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { userExamSetLimit } = require('../constants/planMatrix');
const {
  questionSchema,
  validateUserQuestion,
  USER_SKILLS,
} = require('../services/examImport');
const { sanitizeExamTitle, sanitizeExamDescription } = require('../utils/examTitle');
const { AUDIO_DIR } = require('./examAudio');

const router = express.Router();
router.use(requireAuth);

const ALLOWED_AUDIO_EXTS = new Set(['.mp3', '.m4a', '.mp4', '.ogg', '.oga', '.wav', '.webm', '.aac']);
const ALLOWED_AUDIO_MIME = /^audio\/(mpeg|mp3|mp4|x-m4a|m4a|aac|ogg|wav|x-wav|wave|webm)$/i;

if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AUDIO_DIR),
    filename: (req, file, cb) => {
      const rawExt = path.extname(file.originalname || '').toLowerCase();
      const ext = ALLOWED_AUDIO_EXTS.has(rawExt) ? rawExt : '.mp3';
      const id = crypto.randomBytes(8).toString('hex');
      cb(null, `user-${req.userId.slice(0, 8)}-${Date.now()}-${id}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!ALLOWED_AUDIO_EXTS.has(ext) || !ALLOWED_AUDIO_MIME.test(file.mimetype || '')) {
      return cb(new Error('Unsupported audio file'), false);
    }
    cb(null, true);
  },
});

async function assertOwnerSet(setId, userId) {
  return prisma.examSet.findFirst({
    where: { id: setId, ownerUserId: userId, source: 'USER' },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: {
          options: { orderBy: { order: 'asc' } },
          followUps: { orderBy: { order: 'asc' } },
        },
      },
      audioDocuments: { orderBy: { order: 'asc' } },
    },
  });
}

async function countUserSets(userId, primarySkill) {
  return prisma.examSet.count({
    where: { ownerUserId: userId, source: 'USER', primarySkill },
  });
}

async function limitsPayload(plan, userId) {
  const grouped = await prisma.examSet.groupBy({
    by: ['primarySkill'],
    where: { ownerUserId: userId, source: 'USER' },
    _count: { id: true },
  });
  const usedBySkill = Object.fromEntries(grouped.map((g) => [g.primarySkill, g._count.id]));
  return Object.fromEntries(
    USER_SKILLS.map((skill) => {
      const used = usedBySkill[skill] ?? 0;
      const cap = userExamSetLimit(plan, skill);
      return [skill, { used, cap, canCreate: cap > 0 && used < cap }];
    }),
  );
}

function mapUserSetBrief(s) {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    primarySkill: s.primarySkill,
    isPublished: s.isPublished,
    questionCount: s._count?.questions ?? 0,
    createdAt: s.createdAt,
  };
}

const userSetListSelect = {
  id: true,
  title: true,
  description: true,
  primarySkill: true,
  isPublished: true,
  createdAt: true,
  _count: { select: { questions: true } },
};

// GET /api/user/exam-sets/overview — list + limits in one round trip
router.get('/overview', async (req, res, next) => {
  try {
    const plan = req.userPlan || 'FREE';
    const [sets, limits] = await Promise.all([
      prisma.examSet.findMany({
        where: { ownerUserId: req.userId, source: 'USER' },
        orderBy: { createdAt: 'desc' },
        select: userSetListSelect,
      }),
      limitsPayload(plan, req.userId),
    ]);
    res.json({
      sets: sets.map(mapUserSetBrief),
      limits,
    });
  } catch (e) { next(e); }
});

function ceHasPassage(set, sharedPassage) {
  if ((sharedPassage || '').trim()) return true;
  return set.questions.some((q) => (q.passage || '').trim());
}

function publishBlockers(set, { sharedPassage, sharedTranscript } = {}) {
  if (!set.questions.length) return 'NO_QUESTIONS';
  if (set.primarySkill === 'CE' && !ceHasPassage(set, sharedPassage)) {
    return 'MISSING_PASSAGE';
  }
  if (set.primarySkill === 'CO') {
    const hasAudio = (set.audioDocuments || []).some((d) => d.audioUrl);
    if (!hasAudio) return 'MISSING_CO_AUDIO';
  }
  if (set.primarySkill === 'PO') {
    const speaking = set.questions.find((q) => q.type === 'SPEAKING');
    if (!speaking || !(speaking.followUps || []).length) return 'MISSING_PO_FOLLOWUPS';
  }
  return null;
}

// GET /api/user/exam-sets/limits
router.get('/limits', async (req, res, next) => {
  try {
    const limits = await limitsPayload(req.userPlan || 'FREE', req.userId);
    res.json({ limits });
  } catch (e) { next(e); }
});

// GET /api/user/exam-sets?skill=CE&published=true
router.get('/', async (req, res, next) => {
  try {
    const skill = USER_SKILLS.includes(req.query.skill) ? req.query.skill : undefined;
    const publishedOnly = req.query.published === 'true';
    const sets = await prisma.examSet.findMany({
      where: {
        ownerUserId: req.userId,
        source: 'USER',
        ...(skill ? { primarySkill: skill } : {}),
        ...(publishedOnly ? { isPublished: true } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: userSetListSelect,
    });
    res.json({ sets: sets.map(mapUserSetBrief) });
  } catch (e) { next(e); }
});

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional().nullable(),
  primarySkill: z.enum(['CE', 'PE', 'CO', 'PO']),
});

router.post('/', async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const plan = req.userPlan || 'FREE';
    const cap = userExamSetLimit(plan, data.primarySkill);
    if (cap <= 0) {
      return res.status(403).json({
        error: 'Your plan does not allow creating this type of custom set',
        code: 'USER_EXAM_SET_SKILL_LOCKED',
        skill: data.primarySkill,
        requiresUpgrade: true,
      });
    }
    const used = await countUserSets(req.userId, data.primarySkill);
    if (used >= cap) {
      return res.status(402).json({
        error: 'Custom set limit reached for this skill',
        code: 'USER_EXAM_SET_LIMIT',
        skill: data.primarySkill,
        used,
        cap,
        requiresUpgrade: true,
      });
    }

    const set = await prisma.examSet.create({
      data: {
        title: sanitizeExamTitle(data.title),
        description: data.description != null ? sanitizeExamDescription(data.description) : null,
        isPublished: false,
        isFreePreview: false,
        ownerUserId: req.userId,
        source: 'USER',
        primarySkill: data.primarySkill,
      },
    });

    // CO sets start with one empty audio document slot.
    if (data.primarySkill === 'CO') {
      await prisma.audioDocument.create({
        data: { examSetId: set.id, order: 0, title: 'Document 1', maxPlays: 2, prepSeconds: 60, gapSeconds: 180 },
      });
    }

    res.status(201).json({ set });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const set = await assertOwnerSet(req.params.id, req.userId);
    if (!set) return res.status(404).json({ error: 'Not found' });
    res.json({ set });
  } catch (e) { next(e); }
});

const updateSetSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  isPublished: z.boolean().optional(),
  sharedPassage: z.string().optional().nullable(),
  sharedTranscript: z.string().optional().nullable(),
});

router.put('/:id', async (req, res, next) => {
  try {
    const data = updateSetSchema.parse(req.body);
    const existing = await assertOwnerSet(req.params.id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    if (data.isPublished === true) {
      const block = publishBlockers(existing, {
        sharedPassage: data.sharedPassage,
        sharedTranscript: data.sharedTranscript,
      });
      if (block === 'NO_QUESTIONS') {
        return res.status(400).json({ error: 'Add at least one question before publishing', code: block });
      }
      if (block === 'MISSING_PASSAGE') {
        return res.status(400).json({ error: 'CE sets need a reading passage', code: block });
      }
      if (block === 'MISSING_CO_AUDIO') {
        return res.status(400).json({ error: 'Upload listening audio before publishing', code: block });
      }
      if (block === 'MISSING_PO_FOLLOWUPS') {
        return res.status(400).json({ error: 'Speaking sets need follow-up questions', code: block });
      }
    }

    const patch = {};
    if (data.title !== undefined) patch.title = sanitizeExamTitle(data.title);
    if (data.description !== undefined) {
      patch.description = data.description != null ? sanitizeExamDescription(data.description) : null;
    }
    if (data.isPublished !== undefined) patch.isPublished = data.isPublished;

    await prisma.$transaction(async (tx) => {
      await tx.examSet.update({ where: { id: req.params.id }, data: patch });
      if (data.sharedPassage != null && existing.primarySkill === 'CE') {
        await tx.question.updateMany({
          where: { examSetId: req.params.id },
          data: { passage: data.sharedPassage || null },
        });
      }
      if (data.sharedTranscript != null && existing.primarySkill === 'CO') {
        await tx.question.updateMany({
          where: { examSetId: req.params.id },
          data: { passage: data.sharedTranscript || null },
        });
      }
    });

    const full = await assertOwnerSet(req.params.id, req.userId);
    res.json({ set: full });
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await assertOwnerSet(req.params.id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    await prisma.$transaction([
      prisma.examSession.deleteMany({ where: { examSetId: req.params.id } }),
      prisma.examSet.delete({ where: { id: req.params.id } }),
    ]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/user/exam-sets/:id/audio-documents/:docId/audio
router.post(
  '/:id/audio-documents/:docId/audio',
  audioUpload.single('audio'),
  async (req, res, next) => {
    try {
      const existing = await assertOwnerSet(req.params.id, req.userId);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      if (existing.primarySkill !== 'CO') {
        return res.status(400).json({ error: 'Audio upload only for listening sets' });
      }
      const doc = (existing.audioDocuments || []).find((d) => d.id === req.params.docId);
      if (!doc) return res.status(404).json({ error: 'Audio document not found' });
      if (!req.file) return res.status(400).json({ error: 'No audio file' });

      const audioUrl = `/api/audio/fei/${req.file.filename}`;
      const updated = await prisma.audioDocument.update({
        where: { id: req.params.docId },
        data: { audioUrl },
      });
      // Link all CO questions in this set to this document.
      await prisma.question.updateMany({
        where: { examSetId: req.params.id, skill: 'CO' },
        data: { audioDocumentId: req.params.docId },
      });
      res.json({ document: updated, audioUrl });
    } catch (e) { next(e); }
  },
);

function questionCreateData(examSetId, data, nextOrder, audioDocumentId) {
  return {
    examSetId,
    skill: data.skill,
    type: data.type,
    order: nextOrder,
    prompt: data.prompt,
    passage: data.passage || null,
    explanation: data.explanation || null,
    modelEssay: data.modelEssay || null,
    points: data.points,
    audioDocumentId: data.skill === 'CO' ? (data.audioDocumentId || audioDocumentId || null) : null,
    options: {
      create: (data.options || []).map((o, i) => ({
        label: o.label,
        text: o.text,
        isCorrect: o.isCorrect,
        order: o.order ?? i,
      })),
    },
    followUps: {
      create: (data.followUps || []).map((f, i) => ({
        order: f.order ?? i,
        text: f.text,
        audioUrl: f.audioUrl || null,
        expectedAngle: f.expectedAngle || null,
      })),
    },
  };
}

router.post('/:id/questions', async (req, res, next) => {
  try {
    const existing = await assertOwnerSet(req.params.id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const data = questionSchema.parse(req.body);
    const shapeErr = validateUserQuestion(data, existing.primarySkill);
    if (shapeErr) return res.status(400).json({ error: shapeErr });

    const nextOrder = data.order || existing.questions.length + 1;
    const defaultDocId = existing.primarySkill === 'CO'
      ? existing.audioDocuments?.[0]?.id
      : null;

    const created = await prisma.question.create({
      data: questionCreateData(req.params.id, data, nextOrder, defaultDocId),
      include: { options: true, followUps: true },
    });
    res.status(201).json({ question: created });
  } catch (e) { next(e); }
});

router.put('/:id/questions/:qid', async (req, res, next) => {
  try {
    const existing = await assertOwnerSet(req.params.id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (!existing.questions.some((x) => x.id === req.params.qid)) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const data = questionSchema.parse(req.body);
    const shapeErr = validateUserQuestion(data, existing.primarySkill);
    if (shapeErr) return res.status(400).json({ error: shapeErr });

    const defaultDocId = existing.primarySkill === 'CO'
      ? existing.audioDocuments?.[0]?.id
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.questionOption.deleteMany({ where: { questionId: req.params.qid } });
      await tx.oralFollowUp.deleteMany({ where: { questionId: req.params.qid } });
      return tx.question.update({
        where: { id: req.params.qid },
        data: questionCreateData(req.params.id, data, data.order, defaultDocId),
        include: { options: { orderBy: { order: 'asc' } }, followUps: { orderBy: { order: 'asc' } } },
      });
    });
    res.json({ question: updated });
  } catch (e) { next(e); }
});

router.delete('/:id/questions/:qid', async (req, res, next) => {
  try {
    const existing = await assertOwnerSet(req.params.id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (!existing.questions.some((x) => x.id === req.params.qid)) {
      return res.status(404).json({ error: 'Question not found' });
    }
    await prisma.question.delete({ where: { id: req.params.qid } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
