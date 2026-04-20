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

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AUDIO_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '.mp3').toLowerCase() || '.mp3';
      const id = crypto.randomBytes(8).toString('hex');
      cb(null, `${Date.now()}-${id}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB — enough for 10-min DELF audio
  fileFilter: (_req, file, cb) => {
    const ok = /audio\/(mpeg|mp3|mp4|ogg|wav|webm)/i.test(file.mimetype);
    cb(ok ? null : new Error('Only audio files are allowed'), ok);
  },
});

// ---------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------
const VALID_SKILLS = ['CO', 'CE', 'PE', 'PO'];
const VALID_TYPES = ['SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'FILL', 'ESSAY'];

const optionSchema = z.object({
  label: z.string().min(1).max(4),
  text: z.string().min(1),
  isCorrect: z.boolean().default(false),
  order: z.number().int().default(0),
});

const questionSchema = z.object({
  skill: z.enum(VALID_SKILLS),
  type: z.enum(VALID_TYPES),
  order: z.number().int().default(0),
  prompt: z.string().min(1),
  passage: z.string().optional().nullable(),
  audioUrl: z.string().optional().nullable(),
  explanation: z.string().optional().nullable(),
  points: z.number().int().min(1).max(25).default(1),
  options: z.array(optionSchema).default([]),
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
// SINGLE/TRUE_FALSE, at-least-one for MULTIPLE, zero options for FILL/ESSAY.
// Returns null on success, or a string error.
function validateQuestionShape(q) {
  const correctCount = q.options.filter((o) => o.isCorrect).length;
  if (q.type === 'SINGLE' || q.type === 'TRUE_FALSE') {
    if (q.options.length < 2) return 'SINGLE/TRUE_FALSE needs ≥2 options';
    if (correctCount !== 1) return 'SINGLE/TRUE_FALSE needs exactly 1 correct option';
  }
  if (q.type === 'MULTIPLE') {
    if (q.options.length < 2) return 'MULTIPLE needs ≥2 options';
    if (correctCount < 1) return 'MULTIPLE needs ≥1 correct option';
  }
  if ((q.type === 'FILL' || q.type === 'ESSAY') && q.options.length > 0) {
    return `${q.type} must not have options`;
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
          include: { options: { orderBy: { order: 'asc' } } },
        },
      },
    });
    if (!set) return res.status(404).json({ error: 'Exam set not found' });
    res.json({ set });
  } catch (e) { next(e); }
});

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
    await prisma.examSet.delete({ where: { id: req.params.id } });
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
        explanation: data.explanation || null,
        points: data.points,
        options: {
          create: data.options.map((o, i) => ({
            label: o.label,
            text: o.text,
            isCorrect: o.isCorrect,
            order: o.order || i,
          })),
        },
      },
      include: { options: true },
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

    // Replace options atomically so stale rows don't linger.
    const updated = await prisma.$transaction(async (tx) => {
      await tx.questionOption.deleteMany({ where: { questionId: req.params.qid } });
      return tx.question.update({
        where: { id: req.params.qid },
        data: {
          skill: data.skill,
          type: data.type,
          order: data.order,
          prompt: data.prompt,
          passage: data.passage || null,
          audioUrl: data.audioUrl || null,
          explanation: data.explanation || null,
          points: data.points,
          options: {
            create: data.options.map((o, i) => ({
              label: o.label,
              text: o.text,
              isCorrect: o.isCorrect,
              order: o.order || i,
            })),
          },
        },
        include: { options: true },
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
            points: q.points,
            options: {
              create: q.options.map((o, j) => ({
                label: o.label,
                text: o.text,
                isCorrect: o.isCorrect,
                order: o.order || j,
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
