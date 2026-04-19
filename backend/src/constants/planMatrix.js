// Single source of truth for plan → AI capability mapping. Used by:
//   - middleware/requirePlan.js (tier ordering)
//   - services/aiGrader.js       (model validation + pricing)
//   - routes/essays.js           (quota enforcement + regrade check)
//   - frontend (echoed via API, never hardcoded client-side)

// Canonical model keys exposed to users. These are stable API identifiers;
// the concrete Anthropic model IDs live next to them in MODEL_CATALOG below.
const MODEL_KEYS = ['haiku-4-5', 'sonnet-4-6', 'opus-4-7'];

// Tier ordering. Index = tier rank; used by requirePlan(minPlan).
const PLAN_ORDER = ['FREE', 'STANDARD', 'AI', 'AI_UNLIMITED'];

function planRank(plan) {
  const i = PLAN_ORDER.indexOf(plan);
  return i === -1 ? 0 : i;
}

function planAtLeast(userPlan, minPlan) {
  return planRank(userPlan) >= planRank(minPlan);
}

// Concrete Anthropic model IDs + per-call pricing (USD per 1M tokens).
// Prices as of 2026-04 — update here only; all cost math pulls from this table.
// Cached input is 10% of the base input rate (5-min TTL ephemeral cache).
const MODEL_CATALOG = {
  'haiku-4-5': {
    anthropicId: 'claude-haiku-4-5-20251001',
    label: 'Haiku 4.5',
    inputUsdPerM: 1,
    outputUsdPerM: 5,
    tier: 'fast',
  },
  'sonnet-4-6': {
    anthropicId: 'claude-sonnet-4-6',
    label: 'Sonnet 4.6',
    inputUsdPerM: 3,
    outputUsdPerM: 15,
    tier: 'balanced',
  },
  'opus-4-7': {
    anthropicId: 'claude-opus-4-7',
    label: 'Opus 4.7',
    inputUsdPerM: 15,
    outputUsdPerM: 75,
    tier: 'precise',
  },
};

// Cached-input discount vs base input rate. Anthropic prompt caching (ephemeral).
const CACHED_INPUT_MULTIPLIER = 0.1;

// Plan → which models the user may pick + monthly essay cap.
// FREE is intentionally locked out of AI grading entirely.
const PLAN_CAPS = {
  FREE: {
    models: [],
    monthlyEssays: 0,
    dailyEssays: 0,
  },
  STANDARD: {
    models: ['haiku-4-5'],
    monthlyEssays: 20,
    dailyEssays: 10,
  },
  AI: {
    models: ['haiku-4-5', 'sonnet-4-6'],
    monthlyEssays: 50,
    dailyEssays: 15,
  },
  AI_UNLIMITED: {
    models: ['haiku-4-5', 'sonnet-4-6', 'opus-4-7'],
    monthlyEssays: 200, // soft cap to protect margin on Opus abusers
    dailyEssays: 20,
  },
};

function defaultModelForPlan(plan) {
  const caps = PLAN_CAPS[plan] || PLAN_CAPS.FREE;
  // Prefer the best model the user can access (last in MODEL_KEYS they have).
  for (let i = MODEL_KEYS.length - 1; i >= 0; i--) {
    if (caps.models.includes(MODEL_KEYS[i])) return MODEL_KEYS[i];
  }
  return null;
}

function modelAllowedForPlan(plan, modelKey) {
  const caps = PLAN_CAPS[plan];
  return !!(caps && caps.models.includes(modelKey));
}

module.exports = {
  MODEL_KEYS,
  MODEL_CATALOG,
  CACHED_INPUT_MULTIPLIER,
  PLAN_ORDER,
  PLAN_CAPS,
  planRank,
  planAtLeast,
  defaultModelForPlan,
  modelAllowedForPlan,
};
