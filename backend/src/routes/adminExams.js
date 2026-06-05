const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { z } = require('zod');
const prisma = require('../prisma');
const { requireAdmin, writeAdminLog, clientIp } = require('../middleware/admin');

const router = express.Router();
router.use(requireAdmin);

// Thin wrapper so route handlers can pass `req` instead of unpacking each time.
function logAction(req, { action, targetType, targetId, payload }) {
  return writeAdminLog({
    adminId: req.admin?.id,
    action,
    targetType,
    targetId: targetId || null,
    payload: payload || null,
    ip: clientIp(req),
    userAgent: req.headers['user-agent'] || null,
  });
}

// ---------------------------------------------------------------------
// Audio upload storage — MP3s land in backend/content/fei-samples/,
// which index.js already serves statically at /api/audio/fei.
// ---------------------------------------------------------------------
const AUDIO_DIR = path.join(__dirname, '..', '..', 'content', 'fei-samples');
if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });

// Defense in depth: both the file extension AND the mimetype must be in our
// allowlist. Browsers / curl can spoof either one, but requiring both
// narrows what an attacker can drop into the static dir.
const ALLOWED_AUDIO_EXTS = new Set(['.mp3', '.m4a', '.mp4', '.ogg', '.oga', '.wav', '.webm', '.aac']);
const ALLOWED_AUDIO_MIME = /^audio\/(mpeg|mp3|mp4|x-m4a|m4a|aac|ogg|wav|x-wav|wave|webm)$/i;

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AUDIO_DIR),
    filename: (_req, file, cb) => {
      const rawExt = path.extname(file.originalname || '').toLowerCase();
      const ext = ALLOWED_AUDIO_EXTS.has(rawExt) ? rawExt : '.mp3';
      const id = crypto.randomBytes(8).toString('hex');
      cb(null, `${Date.now()}-${id}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB — enough for 10-min DELF audio
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const okExt = ALLOWED_AUDIO_EXTS.has(ext);
    const okMime = ALLOWED_AUDIO_MIME.test(file.mimetype || '');
    if (!okExt || !okMime) {
      return cb(new Error(`Unsupported audio file (ext=${ext || 'none'}, mime=${file.mimetype || 'none'})`), false);
    }
    cb(null, true);
  },
});

// ---------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------
const VALID_SKILLS = ['CO', 'CE', 'PE', 'PO'];
const VALID_TYPES = ['SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'TRUE_FALSE_JUSTIFY', 'FILL', 'ESSAY', 'SPEAKING'];

const optionSchema = z.object({
  label: z.string().min(1).max(4),
  text: z.string().min(1),
  isCorrect: z.boolean().default(false),
  order: z.number().int().default(0),
});

const followUpSchema = z.object({
  order: z.number().int().min(0).default(0),
  text: z.string().min(1).max(500),
  audioUrl: z.string().optional().nullable(),
  expectedAngle: z.string().max(500).optional().nullable(),
});

const questionSchema = z.object({
  skill: z.enum(VALID_SKILLS),
  type: z.enum(VALID_TYPES),
  order: z.number().int().default(0),
  prompt: z.string().min(1),
  passage: z.string().optional().nullable(),
  audioUrl: z.string().optional().nullable(),
  // CO-only: link this question to a shared AudioDocument so the runner can
  // enforce play rules at document granularity. Optional during import; admin
  // UI sets it after creating the AudioDocument.
  audioDocumentId: z.string().optional().nullable(),
  explanation: z.string().optional().nullable(),
  modelEssay: z.string().optional().nullable(),
  points: z.number().int().min(1).max(25).default(1),
  options: z.array(optionSchema).default([]),
  // SPEAKING-only: follow-up débat questions read by SpeakingExam Partie 2.
  followUps: z.array(followUpSchema).default([]),
});

const examSetSchema = z.object({
  title: z.string().min(1).max(200),
  year: z.number().int().min(2000).max(2100),
  description: z.string().optional().nullable(),
  isPublished: z.boolean().default(false),
  isFreePreview: z.boolean().default(false),
});

const bulkImportSchema = examSetSchema.extend({
  questions: z.array(questionSchema).min(1),
});

// Business-rule validation beyond Zod: enforce exactly-one correct option for
// SINGLE/TRUE_FALSE, at-least-one for MULTIPLE, zero options for FILL/ESSAY/SPEAKING.
// Returns null on success, or a string error.
function validateQuestionShape(q) {
  const correctCount = q.options.filter((o) => o.isCorrect).length;
  if (q.type === 'SINGLE' || q.type === 'TRUE_FALSE' || q.type === 'TRUE_FALSE_JUSTIFY') {
    if (q.options.length < 2) return 'SINGLE/TRUE_FALSE/TRUE_FALSE_JUSTIFY needs ≥2 options';
    if (correctCount !== 1) return 'SINGLE/TRUE_FALSE/TRUE_FALSE_JUSTIFY needs exactly 1 correct option';
  }
  if (q.type === 'MULTIPLE') {
    if (q.options.length < 2) return 'MULTIPLE needs ≥2 options';
    if (correctCount < 1) return 'MULTIPLE needs ≥1 correct option';
  }
  if ((q.type === 'FILL' || q.type === 'ESSAY' || q.type === 'SPEAKING') && q.options.length > 0) {
    return `${q.type} must not have options`;
  }
  if (q.type === 'SPEAKING') {
    if (q.skill !== 'PO') return 'SPEAKING questions must have skill = PO';
    if (!q.followUps || q.followUps.length < 1) {
      return 'SPEAKING needs ≥1 follow-up question for the débat phase';
    }
    if (q.followUps.length > 6) return 'SPEAKING accepts at most 6 follow-ups';
  }
  if (q.type !== 'SPEAKING' && q.followUps && q.followUps.length > 0) {
    return 'follow-ups are only allowed on SPEAKING questions';
  }
  return null;
}

// ---------------------------------------------------------------------
// GET /api/admin/exams — list all exam sets (draft + published)
// ---------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const status = req.query.status; // 'published' | 'draft' | undefined
    const where = {};
    if (status === 'published') where.isPublished = true;
    else if (status === 'draft') where.isPublished = false;

    const sets = await prisma.examSet.findMany({
      where,
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
      include: { questions: { select: { id: true, skill: true } } },
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
        isPublished: s.isPublished,
        isFreePreview: s.isFreePreview,
        totalQuestions: s.questions.length,
        countsBySkill: counts,
        createdAt: s.createdAt,
      };
    });
    res.json({ sets: result });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// GET /api/admin/exams/:id — full detail including correct answers
// ---------------------------------------------------------------------
router.get('/:id', async (req, res, next) => {
  try {
    const set = await prisma.examSet.findUnique({
      where: { id: req.params.id },
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
    if (!set) return res.status(404).json({ error: 'Exam set not found' });
    res.json({ set });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// AudioDocument CRUD — listening uses these to group questions under a
// shared audio with DELF play rules (maxPlays, prepSeconds, gapSeconds).
// ---------------------------------------------------------------------
const audioDocumentSchema = z.object({
  order: z.number().int().min(0).default(0),
  title: z.string().max(200).optional().nullable(),
  audioUrl: z.string().optional().nullable(),
  maxPlays: z.number().int().min(1).max(3).default(2),
  prepSeconds: z.number().int().min(0).max(600).default(60),
  gapSeconds: z.number().int().min(0).max(600).default(180),
  answerSeconds: z.number().int().min(0).max(900).default(0),
});

// POST /api/admin/exams/:id/audio-documents
router.post('/:id/audio-documents', async (req, res, next) => {
  try {
    const data = audioDocumentSchema.parse(req.body);
    const doc = await prisma.audioDocument.create({
      data: { ...data, examSetId: req.params.id },
    });
    await logAction(req, {
      action: 'AUDIO_DOCUMENT_CREATE', targetType: 'EXAM', targetId: req.params.id,
      payload: { docId: doc.id },
    });
    res.status(201).json({ document: doc });
  } catch (e) { next(e); }
});

// PUT /api/admin/exams/audio-documents/:docId
router.put('/audio-documents/:docId', async (req, res, next) => {
  try {
    const data = audioDocumentSchema.partial().parse(req.body);
    const doc = await prisma.audioDocument.update({
      where: { id: req.params.docId },
      data,
    });
    await logAction(req, {
      action: 'AUDIO_DOCUMENT_UPDATE', targetType: 'EXAM', targetId: req.params.docId,
    });
    res.json({ document: doc });
  } catch (e) { next(e); }
});

// DELETE /api/admin/exams/audio-documents/:docId
router.delete('/audio-documents/:docId', async (req, res, next) => {
  try {
    await prisma.audioDocument.delete({ where: { id: req.params.docId } });
    await logAction(req, {
      action: 'AUDIO_DOCUMENT_DELETE', targetType: 'EXAM', targetId: req.params.docId,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/admin/exams/audio-documents/:docId/audio — upload MP3/WAV and
// wire its audioUrl onto the document.
router.post(
  '/audio-documents/:docId/audio',
  audioUpload.single('audio'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No audio file' });
      const audioUrl = `/api/audio/fei/${req.file.filename}`;
      const updated = await prisma.audioDocument.update({
        where: { id: req.params.docId },
        data: { audioUrl },
      });
      await logAction(req, {
        action: 'AUDIO_DOCUMENT_UPLOAD', targetType: 'EXAM', targetId: req.params.docId,
        payload: { filename: req.file.filename, size: req.file.size },
      });
      res.json({ document: updated, audioUrl });
    } catch (e) { next(e); }
  }
);

// ---------------------------------------------------------------------
// POST /api/admin/exams — create new exam set (draft by default)
// ---------------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const data = examSetSchema.parse(req.body);
    const created = await prisma.examSet.create({ data });
    await logAction(req, { action: 'EXAM_CREATE', targetType: 'EXAM', targetId: created.id });
    res.status(201).json({ set: created });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// PUT /api/admin/exams/:id — update exam set metadata
// ---------------------------------------------------------------------
router.put('/:id', async (req, res, next) => {
  try {
    const data = examSetSchema.partial().parse(req.body);
    const updated = await prisma.examSet.update({
      where: { id: req.params.id },
      data,
    });
    await logAction(req, {
      action: 'EXAM_UPDATE', targetType: 'EXAM', targetId: req.params.id,
      payload: data,
    });
    res.json({ set: updated });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// DELETE /api/admin/exams/:id — hard delete (cascades to questions/options)
// ---------------------------------------------------------------------
router.delete('/:id', async (req, res, next) => {
  try {
    // ExamSession.examSet has no DB-level cascade, so a set that has ever been
    // practised is blocked by a foreign-key restriction. Clear its sessions
    // first (UserAttempt.sessionId is SetNull, so attempts are preserved), then
    // delete the set — questions/options/follow-ups cascade automatically.
    await prisma.$transaction([
      prisma.examSession.deleteMany({ where: { examSetId: req.params.id } }),
      prisma.examSet.delete({ where: { id: req.params.id } }),
    ]);
    await logAction(req, { action: 'EXAM_DELETE', targetType: 'EXAM', targetId: req.params.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// POST /api/admin/exams/:id/questions — add a question to an exam set
// ---------------------------------------------------------------------
router.post('/:id/questions', async (req, res, next) => {
  try {
    const data = questionSchema.parse(req.body);
    const shapeErr = validateQuestionShape(data);
    if (shapeErr) return res.status(400).json({ error: shapeErr });

    const existing = await prisma.examSet.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Exam set not found' });

    const nextOrder = data.order || (await prisma.question.count({
      where: { examSetId: req.params.id },
    })) + 1;

    const created = await prisma.question.create({
      data: {
        examSetId: req.params.id,
        skill: data.skill,
        type: data.type,
        order: nextOrder,
        prompt: data.prompt,
        passage: data.passage || null,
        audioUrl: data.audioUrl || null,
        audioDocumentId: data.audioDocumentId || null,
        explanation: data.explanation || null,
        modelEssay: data.modelEssay || null,
        points: data.points,
        options: {
          create: data.options.map((o, i) => ({
            label: o.label,
            text: o.text,
            isCorrect: o.isCorrect,
            order: o.order || i,
          })),
        },
        followUps: {
          create: data.followUps.map((f, i) => ({
            order: f.order || i,
            text: f.text,
            audioUrl: f.audioUrl || null,
            expectedAngle: f.expectedAngle || null,
          })),
        },
      },
      include: { options: true, followUps: true },
    });
    await logAction(req, {
      action: 'QUESTION_CREATE', targetType: 'EXAM', targetId: req.params.id,
      payload: { questionId: created.id },
    });
    res.status(201).json({ question: created });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// PUT /api/admin/exams/questions/:qid — update question (+ replace options)
// ---------------------------------------------------------------------
router.put('/questions/:qid', async (req, res, next) => {
  try {
    const data = questionSchema.parse(req.body);
    const shapeErr = validateQuestionShape(data);
    if (shapeErr) return res.status(400).json({ error: shapeErr });

    // Replace options + follow-ups atomically so stale rows don't linger.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.questionOption.deleteMany({ where: { questionId: req.params.qid } });
      await tx.oralFollowUp.deleteMany({ where: { questionId: req.params.qid } });
      return tx.question.update({
        where: { id: req.params.qid },
        data: {
          skill: data.skill,
          type: data.type,
          order: data.order,
          prompt: data.prompt,
          passage: data.passage || null,
          audioUrl: data.audioUrl || null,
          audioDocumentId: data.audioDocumentId || null,
          explanation: data.explanation || null,
          modelEssay: data.modelEssay || null,
          points: data.points,
          options: {
            create: data.options.map((o, i) => ({
              label: o.label,
              text: o.text,
              isCorrect: o.isCorrect,
              order: o.order || i,
            })),
          },
          followUps: {
            create: data.followUps.map((f, i) => ({
              order: f.order || i,
              text: f.text,
              audioUrl: f.audioUrl || null,
              expectedAngle: f.expectedAngle || null,
            })),
          },
        },
        include: { options: true, followUps: true },
      });
    });
    await logAction(req, {
      action: 'QUESTION_UPDATE', targetType: 'EXAM', targetId: req.params.qid,
    });
    res.json({ question: updated });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// DELETE /api/admin/exams/questions/:qid
// ---------------------------------------------------------------------
router.delete('/questions/:qid', async (req, res, next) => {
  try {
    await prisma.question.delete({ where: { id: req.params.qid } });
    await logAction(req, {
      action: 'QUESTION_DELETE', targetType: 'EXAM', targetId: req.params.qid,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// POST /api/admin/exams/questions/:qid/audio — upload MP3, wire up audioUrl
// Body: multipart/form-data with field "audio"
// ---------------------------------------------------------------------
router.post('/questions/:qid/audio', audioUpload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file' });
    const audioUrl = `/api/audio/fei/${req.file.filename}`;
    const updated = await prisma.question.update({
      where: { id: req.params.qid },
      data: { audioUrl },
    });
    await logAction(req, {
      action: 'QUESTION_AUDIO_UPLOAD', targetType: 'EXAM', targetId: req.params.qid,
      payload: { filename: req.file.filename, size: req.file.size },
    });
    res.json({ question: updated, audioUrl });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------
// POST /api/admin/exams/import — bulk JSON import (full exam set + questions)
// Body: { title, year, description?, isPublished?, isFreePreview?, questions: [...] }
// Rolled into a single transaction — either the whole set lands or nothing.
// ---------------------------------------------------------------------
router.post('/import', async (req, res, next) => {
  try {
    const data = bulkImportSchema.parse(req.body);

    for (const [i, q] of data.questions.entries()) {
      const err = validateQuestionShape(q);
      if (err) {
        return res.status(400).json({ error: `Question ${i + 1}: ${err}` });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const set = await tx.examSet.create({
        data: {
          title: data.title,
          year: data.year,
          description: data.description || null,
          isPublished: data.isPublished,
          isFreePreview: data.isFreePreview,
        },
      });
      for (const [i, q] of data.questions.entries()) {
        await tx.question.create({
          data: {
            examSetId: set.id,
            skill: q.skill,
            type: q.type,
            order: q.order || i + 1,
            prompt: q.prompt,
            passage: q.passage || null,
            audioUrl: q.audioUrl || null,
            explanation: q.explanation || null,
            modelEssay: q.modelEssay || null,
            points: q.points,
            options: {
              create: q.options.map((o, j) => ({
                label: o.label,
                text: o.text,
                isCorrect: o.isCorrect,
                order: o.order || j,
              })),
            },
            followUps: {
              create: (q.followUps || []).map((f, j) => ({
                order: f.order || j,
                text: f.text,
                audioUrl: f.audioUrl || null,
                expectedAngle: f.expectedAngle || null,
              })),
            },
          },
        });
      }
      return set;
    });

    await logAction(req, {
      action: 'EXAM_BULK_IMPORT', targetType: 'EXAM', targetId: created.id,
      payload: { title: data.title, questionCount: data.questions.length },
    });
    res.status(201).json({ set: created, questionCount: data.questions.length });
  } catch (e) {
    if (e.issues) return res.status(400).json({ error: 'Validation failed', details: e.issues });
    next(e);
  }
});

module.exports = router;
