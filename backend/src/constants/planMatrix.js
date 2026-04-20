// Single source of truth for plan → AI capability mapping. Used by:
//   - middleware/requirePlan.js (tier ordering)
//   - services/aiGrader.js       (model validation + pricing + provider dispatch)
//   - routes/essays.js           (quota enforcement + regrade check)
//   - frontend (echoed via API, never hardcoded client-side)
//
// Providers (all OpenAI-compatible chat-completions format):
//   - deepseek → api.deepseek.com            (V3, best French quality of the set)
//   - qwen     → dashscope.aliyuncs.com      (Alibaba Qwen, cheapest + fastest)

// Canonical model keys exposed to users. Stable API identifiers; concrete
// provider model IDs + provider dispatch live in MODEL_CATALOG below.
const MODEL_KEYS = ['qwen-turbo', 'deepseek-chat', 'qwen-plus'];

// Tier ordering. Index = tier rank; used by requirePlan(minPlan).
const PLAN_ORDER = ['FREE', 'STANDARD', 'AI', 'AI_UNLIMITED'];

function planRank(plan) {
  const i = PLAN_ORDER.indexOf(plan);
  return i === -1 ? 0 : i;
}

function planAtLeast(userPlan, minPlan) {
  return planRank(userPlan) >= planRank(minPlan);
}

// Concrete model IDs + per-call pricing (USD per 1M tokens).
// Prices as of 2026-04 — update here only; all cost math pulls from this table.
// Both providers auto-cache the prompt prefix; cached input is billed at ~25-40%
// of the fresh input rate (no short TTL like Anthropic's 5-min ephemeral).
const MODEL_CATALOG = {
  'qwen-turbo': {
    provider: 'qwen',
    providerId: 'qwen-turbo',
    label: 'Qwen Turbo',
    inputUsdPerM: 0.042,   // ≈ ¥0.3/M
    outputUsdPerM: 0.083,  // ≈ ¥0.6/M
    tier: 'fast',
  },
  'deepseek-chat': {
    provider: 'deepseek',
    providerId: 'deepseek-chat',
    label: 'DeepSeek V3',
    inputUsdPerM: 0.27,
    outputUsdPerM: 1.10,
    tier: 'balanced',
  },
  'qwen-plus': {
    provider: 'qwen',
    providerId: 'qwen-plus',
    label: 'Qwen Plus',
    inputUsdPerM: 0.111,   // ≈ ¥0.8/M
    outputUsdPerM: 0.278,  // ≈ ¥2/M
    tier: 'precise',
  },
};

// Cached-input discount vs base input rate. Average across providers;
// exact rate varies (DeepSeek 0.26, Qwen ~0.40), but approximate is fine
// for non-billing accounting.
const CACHED_INPUT_MULTIPLIER = 0.3;

// Plan → which models the user may pick + monthly essay cap.
// FREE is intentionally locked out of AI grading entirely.
// Differentiation: STANDARD only gets qwen-turbo (cheap); AI gets qwen-turbo +
// deepseek-chat; AI_UNLIMITED unlocks everything. Quotas scale as well.
const PLAN_CAPS = {
  FREE: {
    models: [],
    monthlyEssays: 0,
    dailyEssays: 0,
  },
  STANDARD: {
    models: ['qwen-turbo'],
    monthlyEssays: 20,
    dailyEssays: 10,
  },
  AI: {
    models: ['qwen-turbo', 'deepseek-chat'],
    monthlyEssays: 50,
    dailyEssays: 15,
  },
  AI_UNLIMITED: {
    models: ['qwen-turbo', 'deepseek-chat', 'qwen-plus'],
    monthlyEssays: 200,
    dailyEssays: 20,
  },
};

function defaultModelForPlan(plan) {
  const caps = PLAN_CAPS[plan] || PLAN_CAPS.FREE;
  // Prefer the highest tier the plan allows (last in MODEL_KEYS order).
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
