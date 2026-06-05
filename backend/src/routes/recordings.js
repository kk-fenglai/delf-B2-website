// User-facing routes for oral recording uploads + private playback.
//
//   POST /api/user/recordings        — multipart/form-data audio upload
//   GET  /api/user/recordings/:id/audio — owner-only playback
//
// Upload size capped at 8 MB (≈ 5 min mono Opus @ 24 kbps gives <1 MB; webm
// containers in browsers can balloon a bit, so 8 MB is a generous ceiling).
// Storage is local disk under backend/content/recordings — the same pattern
// adminExams.js uses for question audio. Switching to S3/OSS later is a
// drop-in replacement of the multer storage engine.

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');

const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { logger } = require('../utils/logger');
const { RECORDINGS_DIR } = require('../services/oralQueue');

const router = express.Router();

if (!fs.existsSync(RECORDINGS_DIR)) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
}

// MIME types we accept. webm/opus is the Chrome/Firefox default; mp4/aac is
// what Safari produces; m4a / wav are accepted as belt-and-braces.
const ALLOWED_MIME = /^audio\/(webm|ogg|mpeg|mp3|mp4|x-m4a|m4a|wav|wave|x-wav|aac)/i;

const recordingUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      // Shard by yyyy-mm so a single directory doesn't accumulate forever.
      const d = new Date();
      const sub = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const dir = path.join(RECORDINGS_DIR, sub);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '') || extFromMime(file.mimetype) || '.webm';
      const id = crypto.randomBytes(10).toString('hex');
      cb(null, `${Date.now()}-${id}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ALLOWED_MIME.test(file.mimetype);
    cb(ok ? null : new Error(`Unsupported audio mime: ${file.mimetype}`), ok);
  },
});

function extFromMime(mime) {
  if (!mime) return '';
  if (/webm/.test(mime)) return '.webm';
  if (/ogg/.test(mime)) return '.ogg';
  if (/mpeg|mp3/.test(mime)) return '.mp3';
  if (/mp4|m4a|aac/.test(mime)) return '.m4a';
  if (/wav/.test(mime)) return '.wav';
  return '';
}

// Per-user upload pace cap. Generous (60/min) — a full PO simulation creates
// at most ~6 recordings, so this is mostly a guardrail against runaway clients.
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || req.ip,
  message: { error: 'Too many upload requests, slow down' },
});

const uploadBodySchema = z.object({
  questionId: z.string().min(1),
  followUpId: z.string().min(1).optional().nullable(),
  sessionId: z.string().min(1).optional().nullable(),
  durationSec: z.coerce.number().int().min(0).max(15 * 60).optional(),
});

// -------------------------------------------------------------------------
// POST /api/user/recordings  — upload one segment (monologue or follow-up)
// Body (multipart): audio (file) + questionId + [followUpId] + [sessionId] + [durationSec]
// -------------------------------------------------------------------------
router.post(
  '/',
  requireAuth,
  requirePlan('STANDARD'),
  uploadLimiter,
  recordingUpload.single('audio'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

      let body;
      try {
        body = uploadBodySchema.parse(req.body);
      } catch (err) {
        // Best-effort cleanup of the orphaned upload.
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Validation failed', details: err.issues });
      }

      // Verify the user owns the (optional) session, and the question exists.
      const question = await prisma.question.findUnique({
        where: { id: body.questionId },
        select: { id: true, type: true, skill: true },
      });
      if (!question || question.type !== 'SPEAKING') {
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'Speaking question not found' });
      }

      if (body.sessionId) {
        const session = await prisma.examSession.findUnique({
          where: { id: body.sessionId },
          select: { id: true, userId: true },
        });
        if (!session || session.userId !== req.userId) {
          fs.unlink(req.file.path, () => {});
          return res.status(404).json({ error: 'Session not found' });
        }
      }

      if (body.followUpId) {
        const fu = await prisma.oralFollowUp.findUnique({
          where: { id: body.followUpId },
          select: { id: true, questionId: true },
        });
        if (!fu || fu.questionId !== body.questionId) {
          fs.unlink(req.file.path, () => {});
          return res.status(404).json({ error: 'Follow-up not found for this question' });
        }
      }

      // Store the path RELATIVE to RECORDINGS_DIR so we can cleanly migrate
      // the storage root later (e.g. to OSS) by changing only the resolver.
      const relPath = path.relative(RECORDINGS_DIR, req.file.path).replace(/\\/g, '/');

      const row = await prisma.recording.create({
        data: {
          userId: req.userId,
          sessionId: body.sessionId || null,
          questionId: body.questionId,
          followUpId: body.followUpId || null,
          audioPath: relPath,
          mimeType: req.file.mimetype || 'audio/webm',
          durationSec: body.durationSec || 0,
          sizeBytes: req.file.size,
        },
      });

      logger.info(
        {
          recordingId: row.id,
          userId: req.userId,
          questionId: body.questionId,
          followUpId: body.followUpId,
          sizeKb: Math.round(req.file.size / 1024),
          durationSec: row.durationSec,
        },
        'recording.upload'
      );

      res.status(201).json({
        recording: {
          id: row.id,
          questionId: row.questionId,
          followUpId: row.followUpId,
          sessionId: row.sessionId,
          mimeType: row.mimeType,
          durationSec: row.durationSec,
          sizeBytes: row.sizeBytes,
          createdAt: row.createdAt,
        },
      });
    } catch (e) { next(e); }
  }
);

// -------------------------------------------------------------------------
// GET /api/user/recordings/:id/audio  — owner-only stream
//
// We don't expose recording paths via a public static mount — recordings
// contain the candidate's voice and stay private. This handler does an
// auth+ownership check then streams the file with byte-range support.
// -------------------------------------------------------------------------
router.get('/:id/audio', requireAuth, async (req, res, next) => {
  try {
    const row = await prisma.recording.findUnique({ where: { id: req.params.id } });
    if (!row || row.userId !== req.userId) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    const abs = path.resolve(RECORDINGS_DIR, row.audioPath);
    if (!abs.startsWith(RECORDINGS_DIR) || !fs.existsSync(abs)) {
      return res.status(410).json({ error: 'Recording file is gone' });
    }

    const stat = fs.statSync(abs);
    const range = req.headers.range;
    res.setHeader('Content-Type', row.mimeType || 'audio/webm');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=3600');

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (!m) return res.status(416).end();
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (start >= stat.size || end >= stat.size) {
        res.setHeader('Content-Range', `bytes */${stat.size}`);
        return res.status(416).end();
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end - start + 1);
      return fs.createReadStream(abs, { start, end }).pipe(res);
    }

    res.setHeader('Content-Length', stat.size);
    return fs.createReadStream(abs).pipe(res);
  } catch (e) { next(e); }
});

// -------------------------------------------------------------------------
// GET /api/user/recordings  — list a user's recordings (filter by session/question)
// Used by SpeakingExam to recover an in-progress simulation after a refresh.
// -------------------------------------------------------------------------
const listSchema = z.object({
  sessionId: z.string().min(1).optional(),
  questionId: z.string().min(1).optional(),
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { sessionId, questionId } = listSchema.parse(req.query);
    if (!sessionId && !questionId) {
      return res.status(400).json({ error: 'sessionId or questionId required' });
    }
    const rows = await prisma.recording.findMany({
      where: {
        userId: req.userId,
        ...(sessionId ? { sessionId } : {}),
        ...(questionId ? { questionId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        questionId: true,
        followUpId: true,
        sessionId: true,
        mimeType: true,
        durationSec: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
    res.json({ recordings: rows });
  } catch (e) { next(e); }
});

module.exports = router;
