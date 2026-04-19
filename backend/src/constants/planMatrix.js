// Single source of truth for plan → AI capability mapping. Used by:
//   - middleware/requirePlan.js (tier ordering)
//   - services/aiGrader.js       (model validation + pricing)
//   - routes/essays.js           (quota enforcement + regrade check)
//   - frontend (echoed via API, never hardcoded client-side)
//
// Provider: DeepSeek (OpenAI-compatible API at api.deepseek.com).
// Rationale for the switch: domestic-accessible from mainland China (no VPN
// needed), ~30× cheaper than Claude Opus, ~2-5s typical latency. French
// quality is sufficient for DELF B2 rubric grading.

// Canonical model keys exposed to users. Stable API identifiers; the concrete
// provider model IDs live next to them in MODEL_CATALOG below.
const MODEL_KEYS = ['deepseek-chat'];

// Tier ordering. Index = tier rank; used by requirePlan(minPlan).
const PLAN_ORDER = ['FREE', 'STANDARD', 'AI', 'AI_UNLIMITED'];

function planRank(plan) {
  const i = PLAN_ORDER.indexOf(plan);
  return i === -1 ? 0 : i;
}

function planAtLeast(userPlan, minPlan) {
  return planRank(userPlan) >= planRank(minPlan);
}

// Concrete DeepSeek model IDs + per-call pricing (USD per 1M tokens).
// Prices as of 2026-04 — update here only; all cost math pulls from this table.
// DeepSeek auto-caches the prompt prefix; cached input is billed at ~25% of
// the fresh input rate (no short TTL like some providers' ephemeral caches).
const MODEL_CATALOG = {
  'deepseek-chat': {
    providerId: 'deepseek-chat',  // DeepSeek V3
    label: 'DeepSeek V3',
    inputUsdPerM: 0.27,
    outputUsdPerM: 1.10,
    tier: 'fast',
  },
};

// Cached-input discount vs base input rate. DeepSeek: $0.07 / $0.27 ≈ 0.26.
const CACHED_INPUT_MULTIPLIER = 0.26;

// Plan → which models the user may pick + monthly essay cap.
// FREE is intentionally locked out of AI grading entirely.
// With a single model, tiers differ purely by quota — simpler upsell story.
const PLAN_CAPS = {
  FREE: {
    models: [],
    monthlyEssays: 0,
    dailyEssays: 0,
  },
  STANDARD: {
    models: ['deepseek-chat'],
    monthlyEssays: 20,
    dailyEssays: 10,
  },
  AI: {
    models: ['deepseek-chat'],
    monthlyEssays: 50,
    dailyEssays: 15,
  },
  AI_UNLIMITED: {
    models: ['deepseek-chat'],
    monthlyEssays: 200,
    dailyEssays: 20,
  },
};

function defaultModelForPlan(plan) {
  const caps = PLAN_CAPS[plan] || PLAN_CAPS.FREE;
  return caps.models[0] || null;
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
