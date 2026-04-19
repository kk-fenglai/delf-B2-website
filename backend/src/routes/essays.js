// User-facing routes for AI-graded essays.
//   GET  /api/user/essays/:id         — poll a single essay (status + result)
//   POST /api/user/essays/:id/regrade — re-grade with a different model
//   GET  /api/user/essays/quota       — current month usage vs cap
//
// All routes require auth + at least STANDARD plan (FREE is blocked entirely).
// Rate-limited separately from auth to protect the Anthropic bill.

const express = require('express');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');

const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { requirePlan } = require('../middleware/requirePlan');
const { enqueue } = require('../services/essayQueue');
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
} = require('../constants/delfRubric');

const router = express.Router();

// Hourly ceiling regardless of monthly cap — protects against a runaway
// frontend loop (or a compromised token) draining the Anthropic budget.
const aiGradeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
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

async function currentUsage(userId) {
  const [month, day] = await Promise.all([
    prisma.essay.count({ where: { userId, createdAt: { gte: monthStart() } } }),
    prisma.essay.count({ where: { userId, createdAt: { gte: dayStart() } } }),
  ]);
  return { month, day };
}

function serialiseEssay(row) {
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
    content: row.content,
    wordCount: row.wordCount,
    aiScore: row.aiScore,
    aiFeedback: row.aiFeedback,
    rubric: parseJson(row.rubric),
    corrections: parseJson(row.corrections),
    strengths: parseJson(row.strengths),
    errorMessage: row.errorMessage,
    gradedAt: row.gradedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// -------------------------------------------------------------------------
// GET /api/user/essays/quota
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
      used: used.month,
      dayUsed: used.day,
      monthlyCap: caps.monthlyEssays,
      dailyCap: caps.dailyEssays,
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
// GET /api/user/essays/:id  — polling endpoint for the grade card
// -------------------------------------------------------------------------
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const row = await prisma.essay.findUnique({ where: { id: req.params.id } });
    if (!row || row.userId !== req.userId) {
      return res.status(404).json({ error: 'Essay not found' });
    }
    res.json({ essay: serialiseEssay(row) });
  } catch (e) { next(e); }
});

// -------------------------------------------------------------------------
// POST /api/user/essays/:id/regrade  — switch model, re-queue
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

      // Quota: regrade counts against the monthly cap (each call costs tokens).
      const caps = PLAN_CAPS[plan];
      const used = await currentUsage(req.userId);
      if (used.month >= caps.monthlyEssays) {
        return res.status(402).json({
          error: 'Monthly AI grading quota reached',
          code: 'QUOTA_EXCEEDED',
          used: used.month,
          cap: caps.monthlyEssays,
        });
      }
      if (used.day >= caps.dailyEssays) {
        return res.status(402).json({
          error: 'Daily AI grading limit reached',
          code: 'DAILY_LIMIT',
          used: used.day,
          cap: caps.dailyEssays,
        });
      }

      const essay = await prisma.essay.findUnique({ where: { id: req.params.id } });
      if (!essay || essay.userId !== req.userId) {
        return res.status(404).json({ error: 'Essay not found' });
      }
      if (essay.status === 'queued' || essay.status === 'grading') {
        return res.status(409).json({
          error: 'Essay is already being graded',
          code: 'ALREADY_GRADING',
        });
      }

      const updated = await prisma.essay.update({
        where: { id: essay.id },
        data: {
          status: 'queued',
          model,
          locale: locale || essay.locale || 'fr',
          errorMessage: null,
          // Preserve prior result visible via gradedAt until new one lands.
        },
      });
      enqueue(updated.id);
      res.json({ essay: serialiseEssay(updated) });
    } catch (e) { next(e); }
  }
);

module.exports = router;
