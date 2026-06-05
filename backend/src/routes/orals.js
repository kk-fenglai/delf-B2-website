// User-facing routes for AI-graded oral exams (Production Orale).
//   GET  /api/user/orals/quota         — current month usage vs cap
//   GET  /api/user/orals/:id           — poll a single oral (status + result)
//   POST /api/user/orals/:id/regrade   — re-grade with a different model
//
// Mirrors essays.js — same plan gating, same hourly limiter shape, same
// upgrade-required error envelope so the frontend reuses one upgrade modal.

const express = require('express');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');

const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { enqueue } = require('../services/oralQueue');
const {
  MODEL_KEYS,
  MODEL_CATALOG,
  PLAN_CAPS,
  defaultModelForPlan,
  modelAllowedForPlan,
} = require('../constants/planMatrix');
const {
  DIMENSIONS,
  TOTAL_MAX,
  MIN_WORDS,
  TARGET_WORDS,
  MAX_WORDS,
  MONOLOGUE_MAX_SEC,
  FOLLOW_UP_MAX_SEC,
  PREP_DEFAULT_SEC,
  PREP_PRACTICE_SEC,
} = require('../constants/delfOralRubric');

const router = express.Router();

const aiGradeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || req.ip,
  message: { error: 'Too many AI grading requests this hour' },
});

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function dayStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Returns both month and day counts so callers can enforce both the
// monthly cap (plan tier) and the daily anti-abuse rate limit (matters
// most for AI_UNLIMITED where the monthly cap is effectively unbounded).
async function currentUsage(userId) {
  const [month, day] = await Promise.all([
    prisma.oral.count({ where: { userId, createdAt: { gte: monthStart() } } }),
    prisma.oral.count({ where: { userId, createdAt: { gte: dayStart() } } }),
  ]);
  return { month, day };
}

function serialiseOral(row) {
  const parseJson = (s) => {
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
  };
  return {
    id: row.id,
    questionId: row.questionId,
    sessionId: row.sessionId,
    status: row.status,
    model: row.model,
    locale: row.locale,
    aiScore: row.aiScore,
    aiFeedback: row.aiFeedback,
    rubric: parseJson(row.rubric),
    corrections: parseJson(row.corrections),
    strengths: parseJson(row.strengths),
    transcriptCombined: row.transcriptCombined,
    recordingIds: parseJson(row.recordingIds) || [],
    errorMessage: row.errorMessage,
    gradedAt: row.gradedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// Build the structured playback layout so the frontend can render one slot
// per follow-up (with "no recording" placeholders for missing ones) instead
// of just listing whatever recordings happen to exist — which mislabels
// segments when any recording is missing.
async function buildPlaybackLayout(row) {
  const recIds = (() => {
    try { return JSON.parse(row.recordingIds || '[]'); }
    catch { return []; }
  })();

  const [recordings, followUps] = await Promise.all([
    recIds.length
      ? prisma.recording.findMany({
        where: { id: { in: recIds }, userId: row.userId },
        select: { id: true, followUpId: true, durationSec: true },
      })
      : Promise.resolve([]),
    prisma.oralFollowUp.findMany({
      where: { questionId: row.questionId },
      orderBy: { order: 'asc' },
      select: { id: true, order: true, text: true },
    }),
  ]);

  const monologue = recordings.find((r) => !r.followUpId) || null;
  const byFollowUp = new Map(
    recordings.filter((r) => r.followUpId).map((r) => [r.followUpId, r])
  );

  return {
    monologueRecordingId: monologue?.id || null,
    followUps: followUps.map((f) => ({
      id: f.id,
      order: f.order,
      text: f.text,
      recordingId: byFollowUp.get(f.id)?.id || null,
    })),
  };
}

// -------------------------------------------------------------------------
// GET /api/user/orals/quota
// -------------------------------------------------------------------------
router.get('/quota', requireAuth, async (req, res, next) => {
  try {
    const plan = req.userPlan || 'FREE';
    const caps = PLAN_CAPS[plan] || PLAN_CAPS.FREE;
    const used = await currentUsage(req.userId);
    const reset = new Date(monthStart());
    reset.setMonth(reset.getMonth() + 1);
    res.json({
      plan,
      used: used.month,                  // monthly usage (back-compat)
      dailyUsed: used.day,
      monthlyCap: caps.monthlyOralExams,
      dailyCap: caps.dailyOralExams,
      resetAt: reset,
      allowedModels: caps.models,
      defaultModel: defaultModelForPlan(plan),
      models: caps.models.map((k) => ({
        key: k,
        label: MODEL_CATALOG[k].label,
        tier: MODEL_CATALOG[k].tier,
      })),
      thresholds: {
        totalMax: TOTAL_MAX,
        minWords: MIN_WORDS,
        targetWords: TARGET_WORDS,
        maxWords: MAX_WORDS,
        monologueMaxSec: MONOLOGUE_MAX_SEC,
        followUpMaxSec: FOLLOW_UP_MAX_SEC,
        prepDefaultSec: PREP_DEFAULT_SEC,
        prepPracticeSec: PREP_PRACTICE_SEC,
        dimensions: DIMENSIONS.map((d) => ({
          key: d.key,
          max: d.max,
          labelFr: d.labelFr,
        })),
      },
    });
  } catch (e) { next(e); }
});

// -------------------------------------------------------------------------
// GET /api/user/orals/:id  — polling endpoint for OralGradeCard
// -------------------------------------------------------------------------
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const row = await prisma.oral.findUnique({ where: { id: req.params.id } });
    if (!row || row.userId !== req.userId) {
      return res.status(404).json({ error: 'Oral not found' });
    }
    const layout = await buildPlaybackLayout(row);
    res.json({ oral: { ...serialiseOral(row), ...layout } });
  } catch (e) { next(e); }
});

// -------------------------------------------------------------------------
// POST /api/user/orals/:id/regrade  — switch model, re-queue (re-uses STT
//                                     transcripts already in the recording rows)
// -------------------------------------------------------------------------
const regradeSchema = z.object({
  model: z.enum(MODEL_KEYS),
  locale: z.enum(['fr', 'en', 'zh']).optional(),
});

router.post(
  '/:id/regrade',
  requireAuth,
  requirePlan('STANDARD'),
  aiGradeLimiter,
  async (req, res, next) => {
    try {
      const { model, locale } = regradeSchema.parse(req.body);

      const plan = req.userPlan || 'FREE';
      if (!modelAllowedForPlan(plan, model)) {
        return res.status(403).json({
          error: 'This model is not included in your current plan',
          code: 'MODEL_NOT_ALLOWED',
          requiresUpgrade: true,
          currentPlan: plan,
        });
      }

      // Quota: regrade burns LLM tokens (STT is reused), still counts.
      const caps = PLAN_CAPS[plan];
      const used = await currentUsage(req.userId);
      if (used.month >= caps.monthlyOralExams) {
        return res.status(402).json({
          error: 'Monthly oral exam quota reached',
          code: 'QUOTA_EXCEEDED',
          used: used.month,
          cap: caps.monthlyOralExams,
        });
      }
      // Daily rate-limit (anti-abuse, important for AI_UNLIMITED whose
      // monthly cap is effectively unbounded).
      if (used.day >= caps.dailyOralExams) {
        return res.status(429).json({
          error: 'Daily oral exam limit reached',
          code: 'DAILY_RATE_LIMITED',
          used: used.day,
          cap: caps.dailyOralExams,
        });
      }

      const oral = await prisma.oral.findUnique({ where: { id: req.params.id } });
      if (!oral || oral.userId !== req.userId) {
        return res.status(404).json({ error: 'Oral not found' });
      }
      if (oral.status === 'queued' || oral.status === 'transcribing' || oral.status === 'grading') {
        return res.status(409).json({
          error: 'Oral is already being processed',
          code: 'ALREADY_GRADING',
        });
      }

      const updated = await prisma.oral.update({
        where: { id: oral.id },
        data: {
          // Skip back to 'grading' if we already have a transcript — the
          // worker's processOne idempotently re-runs the LLM phase. If we
          // have no transcript, go through 'queued' so STT runs.
          status: oral.transcriptCombined ? 'queued' : 'queued',
          model,
          locale: locale || oral.locale || 'fr',
          errorMessage: null,
        },
      });
      enqueue(updated.id);
      const layout = await buildPlaybackLayout(updated);
      res.json({ oral: { ...serialiseOral(updated), ...layout } });
    } catch (e) { next(e); }
  }
);

module.exports = router;
