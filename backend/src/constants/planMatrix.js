// Single source of truth for plan → AI capability mapping. Used by:
//   - middleware/requirePlan.js (tier ordering)
//   - services/aiGrader.js       (model validation + pricing + provider dispatch)
//   - routes/essays.js           (quota enforcement + regrade check)
//   - frontend (echoed via API, never hardcoded client-side)
//
// Providers (all OpenAI-compatible chat-completions format):
//   - deepseek → api.deepseek.com            (V4 Flash — official model id deepseek-v4-flash)
//   - qwen     → dashscope.aliyuncs.com      (Alibaba Qwen, cheapest + fastest)

// Canonical model keys exposed to users. Stable API identifiers; concrete
// provider model IDs + provider dispatch live in MODEL_CATALOG below.
const MODEL_KEYS = ['deepseek-chat', 'qwen-turbo', 'qwen-plus'];

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
    // Use the stable alias 'deepseek-chat' (routes to V3/V4 Flash with full tool-calling support).
    // Direct model IDs like 'deepseek-v4-flash' route to the Reasoner variant which rejects tool_choice.
    providerId: 'deepseek-chat',
    label: 'DeepSeek V4 Flash',
    inputUsdPerM: 0.14,
    outputUsdPerM: 0.28,
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

// Plan → AI quota + which grader models the user may pick.
// All paid tiers currently share the same model pool (`deepseek-chat`); we
// differentiate by quota, not by model availability. If we ever offer a
// "premium" model (e.g. Qwen Plus, Claude) gated by tier, add it to `models`.
//
// `monthlyEssays` / `monthlyOralExams` are counted per submission per
// calendar month. `dailyEssays` and `dailyOralExams` act as anti-abuse
// rate limits, especially for the AI_UNLIMITED tier where the monthly cap
// is effectively unbounded.
//
// UNLIMITED encoding: we use 99999 (not Infinity) because Infinity
// serializes to `null` via JSON.stringify and would break the quota echo
// to the frontend. 99999 is well past any realistic monthly usage.
const UNLIMITED = 99999;

// User-owned exam set caps ("我的题库") per plan, by primarySkill.
const USER_EXAM_SET_LIMITS = {
  FREE:         { CE: 2, PE: 2, CO: 2, PO: 2, MOCK: 0 },
  STANDARD:     { CE: 10, PE: 10, CO: 10, PO: 10, MOCK: 0 },
  AI:           { CE: 20, PE: 20, CO: 20, PO: 10, MOCK: 5 },
  AI_UNLIMITED: { CE: 50, PE: 50, CO: 50, PO: 30, MOCK: 20 },
};

function userExamSetLimit(plan, skill) {
  const caps = USER_EXAM_SET_LIMITS[plan] || USER_EXAM_SET_LIMITS.FREE;
  return caps[skill] ?? 0;
}

// FREE-tier monthly session caps, bucketed.
//   CE   — reading practice (mode=PRACTICE, skill='CE')
//   CO   — listening practice (mode=PRACTICE, skill='CO')
//   MOCK — full mock exam (mode='EXAM', any skill)
// `null` on paid tiers means uncapped. Resets at month boundary (calendar UTC).
const PLAN_CAPS = {
  FREE: {
    models: [],
    monthlyEssays: 0,
    dailyEssays: 0,
    monthlyOralExams: 0,
    dailyOralExams: 0,
    freeMonthlySessions: { CE: 3, CO: 3, MOCK: 2 },
    maxEssayTemplates: 0,
  },
  STANDARD: {
    models: ['deepseek-chat'],
    monthlyEssays: 5,
    dailyEssays: 3,
    monthlyOralExams: 3,
    dailyOralExams: 2,
    freeMonthlySessions: null,
    maxEssayTemplates: 0,
  },
  AI: {
    models: ['deepseek-chat'],
    monthlyEssays: 30,
    dailyEssays: 8,
    monthlyOralExams: 15,
    dailyOralExams: 5,
    freeMonthlySessions: null,
    maxEssayTemplates: 3,
  },
  AI_UNLIMITED: {
    models: ['deepseek-chat'],
    monthlyEssays: UNLIMITED,
    dailyEssays: 30,            // anti-abuse only — practically a soft "unlimited"
    monthlyOralExams: UNLIMITED,
    dailyOralExams: 15,
    freeMonthlySessions: null,
    maxEssayTemplates: UNLIMITED,
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
  USER_EXAM_SET_LIMITS,
  userExamSetLimit,
  planRank,
  planAtLeast,
  defaultModelForPlan,
  modelAllowedForPlan,
};
