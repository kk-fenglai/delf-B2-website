// AI essay grader for DELF B2 Production Écrite.
//
// Provider: DeepSeek (api.deepseek.com). We use the `openai` SDK because
// DeepSeek exposes an OpenAI-compatible chat-completions endpoint. If you
// later want to swap providers (Mistral, Qwen, OpenAI itself), only the
// baseURL + model IDs in planMatrix.js need to change.
//
// Contract: gradeEssay({ essay, question, modelKey, locale }) → structured
// rubric result. Caller (essayQueue) is responsible for persistence — this
// module is pure I/O: DeepSeek in, parsed + validated JSON out.
//
// Why fan-out (3 parallel calls instead of one):
//   Output-token generation dominates latency. Splitting into 3 smaller
//   calls run in parallel keeps wall time well under the target. DeepSeek
//   auto-caches the prompt prefix across requests (no explicit cache_control
//   needed — just keep the system message identical).
//
// The three sub-calls:
//   - scoreCall       → 10 dimensions with brief feedback (≤ 25 words/dim)
//   - correctionsCall → 3-8 inline corrections
//   - summaryCall     → strengths[] + globalFeedback
//
// All three use the SAME system prompt → same cache prefix across the 3
// calls and across essays within the cache window.

const OpenAI = require('openai');
const { z } = require('zod');
const env = require('../config/env');
const { logger } = require('../utils/logger');
const {
  DIMENSIONS,
  DIMENSION_KEYS,
  TOTAL_MAX,
  CORRECTION_TYPES,
  MIN_WORDS,
} = require('../constants/delfRubric');
const {
  MODEL_CATALOG,
  MODEL_KEYS,
  CACHED_INPUT_MULTIPLIER,
} = require('../constants/planMatrix');

// ---- Singleton client ----------------------------------------------------
let _client = null;
function getClient() {
  if (!env.DEEPSEEK_API_KEY) {
    const e = new Error('DEEPSEEK_API_KEY not configured');
    e.code = 'AI_NOT_CONFIGURED';
    throw e;
  }
  if (!_client) {
    _client = new OpenAI({
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: env.DEEPSEEK_BASE_URL, // https://api.deepseek.com
    });
  }
  return _client;
}

// ---- Response locale -----------------------------------------------------
const LOCALES = {
  fr: {
    label: 'français',
    instruction:
      "Rédigez TOUS les champs 'feedback', 'globalFeedback', 'issue', 'suggestion' et 'strengths' en français de niveau B2 professionnel.",
  },
  en: {
    label: 'English',
    instruction:
      "Write ALL 'feedback', 'globalFeedback', 'issue', 'suggestion' and 'strengths' fields in clear professional English. Keep technical terms (e.g., 'subjonctif', 'connecteurs logiques') in French where appropriate.",
  },
  zh: {
    label: '简体中文',
    instruction:
      "所有 'feedback'、'globalFeedback'、'issue'、'suggestion'、'strengths' 字段请用简体中文撰写；语法术语可保留法语原文（如 subjonctif、accord du participe passé）。",
  },
};

function normaliseLocale(loc) {
  const l = String(loc || 'fr').toLowerCase().slice(0, 2);
  return LOCALES[l] ? l : 'fr';
}

// ---- System prompt (auto-cached by DeepSeek) -----------------------------
// Kept stable across all 3 sub-calls so DeepSeek's prefix cache can hit. If
// you change this string you invalidate the cache — plan rollouts accordingly.
function buildSystemPrompt() {
  const rubricBlock = DIMENSIONS.map(
    (d) =>
      `  - ${d.key} (max ${d.max} pt) — ${d.labelFr}\n      Critère : ${d.anchor}`
  ).join('\n');

  return `Vous êtes un examinateur DELF B2 certifié par France Éducation International avec 10 ans d'expérience en correction de la Production Écrite. Vous notez selon la GRILLE OFFICIELLE (25 points), sans clémence ni sévérité excessive.

GRILLE D'ÉVALUATION — 10 dimensions, total ${TOTAL_MAX} points :
${rubricBlock}

PROTOCOLE DE NOTATION :
 1. Lisez d'abord le texte en entier avant de noter.
 2. Notez chaque dimension indépendamment, en vous appuyant sur le critère ci-dessus.
 3. Un score partiel (0.5, 1, 1.5…) est acceptable, mais toujours ≤ au max de la dimension.
 4. Pour les corrections : citation EXACTE (≤ 10 mots) du texte original, sans reformulation.
 5. Type de correction : grammar | lexique | orthographe | syntaxe.

INTERDIT :
 - Ne paraphrasez pas la grille dans les feedbacks.
 - Ne dépassez PAS le max d'une dimension.
 - N'inventez PAS des citations qui ne sont pas dans le texte.
 - Ne calculez PAS de note globale — le système la recompose.

EXEMPLE — copie solide (18/25) :
  "Force est de constater que les algorithmes enferment les internautes dans des bulles cognitives…"
  → consigne 2/2, argumentation 3/4, coherence 3/3, lexique_etendue 2/2, morphosyntaxe_maitrise 1/2.

EXEMPLE — copie limite (12/25) :
  "Je pense que c'est mal parce que les gens ils regardent leur téléphone."
  → argumentation 1/4, coherence 1/3, lexique_etendue 0/2, morphosyntaxe_maitrise 0/2.

L'utilisateur vous demandera l'une de trois tâches ciblées (notation, corrections, ou synthèse). Concentrez-vous UNIQUEMENT sur la tâche demandée et appelez l'outil correspondant une seule fois.`;
}

let _systemPrompt = null;
function getSystemPrompt() {
  if (!_systemPrompt) _systemPrompt = buildSystemPrompt();
  return _systemPrompt;
}

// ---- Tool schemas (one per sub-call) -------------------------------------
// Wrapped in OpenAI function-calling envelope at call time; the `parameters`
// field below is plain JSON Schema.
const SCORE_TOOL_DEF = {
  name: 'submit_scores',
  description:
    "Soumettre la notation des 10 dimensions de la grille DELF B2. Feedback bref (≤ 25 mots par dimension).",
  parameters: {
    type: 'object',
    properties: {
      dimensions: {
        type: 'array',
        minItems: DIMENSIONS.length,
        maxItems: DIMENSIONS.length,
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: DIMENSION_KEYS },
            score: { type: 'number', minimum: 0 },
            max: { type: 'number', minimum: 0 },
            feedback: { type: 'string', minLength: 10, maxLength: 200 },
          },
          required: ['key', 'score', 'max', 'feedback'],
        },
      },
    },
    required: ['dimensions'],
  },
};

const CORRECTIONS_TOOL_DEF = {
  name: 'submit_corrections',
  description:
    "Soumettre 3 à 8 corrections concrètes : citation exacte (≤10 mots), nature de l'erreur, suggestion, type.",
  parameters: {
    type: 'object',
    properties: {
      corrections: {
        type: 'array',
        minItems: 0,
        maxItems: 12,
        items: {
          type: 'object',
          properties: {
            excerpt: { type: 'string', minLength: 1, maxLength: 200 },
            issue: { type: 'string', minLength: 5 },
            suggestion: { type: 'string', minLength: 1 },
            type: { type: 'string', enum: CORRECTION_TYPES },
          },
          required: ['excerpt', 'issue', 'suggestion', 'type'],
        },
      },
    },
    required: ['corrections'],
  },
};

const SUMMARY_TOOL_DEF = {
  name: 'submit_summary',
  description:
    "Soumettre 2 à 4 points forts concrets et un retour global (80-150 mots, hiérarchisé forces → axes de progrès).",
  parameters: {
    type: 'object',
    properties: {
      strengths: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: { type: 'string', minLength: 5 },
      },
      globalFeedback: { type: 'string', minLength: 80, maxLength: 1200 },
    },
    required: ['strengths', 'globalFeedback'],
  },
};

// Per-task Zod schemas mirror the tool parameters for defence-in-depth.
const ScoreSchema = z.object({
  dimensions: z
    .array(
      z.object({
        key: z.enum(DIMENSION_KEYS),
        score: z.number().min(0),
        max: z.number().min(0),
        feedback: z.string().min(10),
      })
    )
    .length(DIMENSIONS.length),
});

const CorrectionsSchema = z.object({
  corrections: z
    .array(
      z.object({
        excerpt: z.string().min(1).max(200),
        issue: z.string().min(5),
        suggestion: z.string().min(1),
        type: z.enum(CORRECTION_TYPES),
      })
    )
    .max(12),
});

const SummarySchema = z.object({
  strengths: z.array(z.string().min(5)).min(1).max(4),
  globalFeedback: z.string().min(80),
});

// ---- Cost calculator -----------------------------------------------------
// DeepSeek usage fields (OpenAI-compatible + extras):
//   prompt_tokens, completion_tokens                       — total counts
//   prompt_cache_hit_tokens, prompt_cache_miss_tokens      — cache split
function computeCostUsd(modelKey, usage) {
  const m = MODEL_CATALOG[modelKey];
  if (!m) return 0;
  const cachedIn = usage.prompt_cache_hit_tokens || 0;
  const freshIn =
    (usage.prompt_cache_miss_tokens != null
      ? usage.prompt_cache_miss_tokens
      : Math.max(0, (usage.prompt_tokens || 0) - cachedIn));
  const out = usage.completion_tokens || 0;

  const inRate = m.inputUsdPerM / 1_000_000;
  const outRate = m.outputUsdPerM / 1_000_000;

  return freshIn * inRate + cachedIn * inRate * CACHED_INPUT_MULTIPLIER + out * outRate;
}

// ---- Retry wrapper -------------------------------------------------------
// Tight budget: 1 retry max, short backoff. Each sub-call must fit in ~8s
// wall time for the fan-out to land under 10s.
async function withRetry(fn, { attempts = 2, baseMs = 400 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status || err?.response?.status;
      if (status && status >= 400 && status < 500 && status !== 429) throw err;
      if (i === attempts - 1) break;
      const wait = baseMs + Math.random() * 200;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// ---- Sub-call runner -----------------------------------------------------
// Single per-model timeout map. With a single DeepSeek tier today, just one
// entry — but the shape is kept for future multi-model support.
const SUBCALL_TIMEOUT_MS = {
  'deepseek-chat': 10_000,
};

const TASK_HINTS = {
  scores:
    "TÂCHE : notez les 10 dimensions de la grille. Pour chaque dimension, un feedback BREF de ≤ 25 mots. Appelez submit_scores une seule fois.",
  corrections:
    "TÂCHE : identifiez 3 à 8 erreurs précises. Pour chaque erreur : citation EXACTE (≤10 mots) du texte, nature, suggestion, type. Appelez submit_corrections une seule fois.",
  summary:
    "TÂCHE : listez 2 à 4 points forts concrets (citez des formulations réussies) et rédigez un retour global de 80 à 150 mots (forces → axes de progrès). Appelez submit_summary une seule fois.",
};

const TASK_TOOL_DEFS = {
  scores: SCORE_TOOL_DEF,
  corrections: CORRECTIONS_TOOL_DEF,
  summary: SUMMARY_TOOL_DEF,
};

const TASK_MAX_TOKENS = {
  scores: 1200,
  corrections: 1000,
  summary: 600,
};

// With a single DeepSeek tier, every sub-call uses the same model. Shape kept
// for when we add deepseek-reasoner (R1) as a premium tier later.
function modelForTask(_task, userModelKey) {
  return userModelKey;
}

function buildUserContent(essay, question, loc, task) {
  return `Consigne (sujet) :
"""
${String(question.prompt || '').trim()}
"""

Copie du candidat (${essay.wordCount} mots) :
"""
${essay.content.trim()}
"""

${TASK_HINTS[task]}

Langue du retour : ${LOCALES[loc].label}.
${LOCALES[loc].instruction}`;
}

async function runSubCall({ client, userModelKey, task, essay, question, loc }) {
  const toolDef = TASK_TOOL_DEFS[task];
  const taskModelKey = modelForTask(task, userModelKey);
  const taskModel = MODEL_CATALOG[taskModelKey];

  const call = () =>
    client.chat.completions.create(
      {
        model: taskModel.providerId,
        max_tokens: TASK_MAX_TOKENS[task],
        // Force the model to call exactly this tool — structured output
        // guaranteed, no free-text parsing needed.
        tools: [{ type: 'function', function: toolDef }],
        tool_choice: { type: 'function', function: { name: toolDef.name } },
        messages: [
          { role: 'system', content: getSystemPrompt() },
          { role: 'user', content: buildUserContent(essay, question, loc, task) },
        ],
      },
      { timeout: SUBCALL_TIMEOUT_MS[taskModelKey] || 10_000 }
    );

  const resp = await withRetry(call);

  const choice = resp.choices?.[0];
  if (!choice) {
    const e = new Error(`No choices returned for task=${task}`);
    e.code = 'AI_NO_TOOL_USE';
    throw e;
  }
  if (choice.finish_reason === 'length') {
    const e = new Error(`Output truncated for task=${task}: hit max_tokens`);
    e.code = 'AI_OUTPUT_TRUNCATED';
    throw e;
  }

  const toolCalls = choice.message?.tool_calls;
  const tc = toolCalls && toolCalls[0];
  if (!tc || tc.type !== 'function' || tc.function?.name !== toolDef.name) {
    const e = new Error(`Expected tool_call=${toolDef.name} for task=${task}, got ${tc?.function?.name || 'none'}`);
    e.code = 'AI_NO_TOOL_USE';
    throw e;
  }

  // OpenAI-format tool calls always deliver `arguments` as a JSON string.
  let rawInput;
  try {
    rawInput = JSON.parse(tc.function.arguments || '{}');
  } catch (err) {
    const e = new Error(`tool_call arguments not valid JSON for task=${task}: ${err.message}`);
    e.code = 'AI_BAD_OUTPUT'; e.cause = err;
    throw e;
  }

  return {
    rawInput,
    usage: resp.usage || {},
    stopReason: choice.finish_reason,
    modelKey: taskModelKey,
  };
}

function wrapProviderError(err, task) {
  if (err?.code && typeof err.code === 'string' && err.code.startsWith('AI_')) return err;
  const status = err?.status;
  const code =
    status === 429                     ? 'AI_RATE_LIMITED' :
    status >= 500                      ? 'AI_PROVIDER_DOWN' :
    status >= 400 && status < 500      ? 'AI_BAD_REQUEST'   :
    'AI_CALL_FAILED';
  const wrapped = new Error(`DeepSeek call failed (task=${task}): ${err?.message || err}`);
  wrapped.code = code;
  wrapped.cause = err;
  return wrapped;
}

// ---- Public API ----------------------------------------------------------
/**
 * @param {Object} args
 * @param {{ id: string, content: string, wordCount: number }} args.essay
 * @param {{ prompt: string }} args.question
 * @param {string} args.modelKey   — one of MODEL_KEYS
 * @param {string} args.locale     — fr | en | zh
 * @returns {Promise<{ aiScore, aiFeedback, rubric, corrections, strengths, model, tokensIn, tokensOut, tokensCached, costUsd }>}
 */
async function gradeEssay({ essay, question, modelKey, locale }) {
  if (!MODEL_KEYS.includes(modelKey)) {
    const e = new Error(`Unknown model key: ${modelKey}`);
    e.code = 'AI_BAD_MODEL';
    throw e;
  }
  if (!essay?.content || essay.wordCount < MIN_WORDS) {
    const e = new Error(`Essay too short (need ≥ ${MIN_WORDS} words)`);
    e.code = 'AI_ESSAY_TOO_SHORT';
    throw e;
  }

  const client = getClient();
  const loc = normaliseLocale(locale);
  const started = Date.now();

  // Fan out: 3 sub-calls in parallel. Wall time ≈ max of the three.
  const tasks = ['scores', 'corrections', 'summary'];
  const results = await Promise.all(
    tasks.map((task) =>
      runSubCall({ client, userModelKey: modelKey, task, essay, question, loc })
        .catch((err) => { throw wrapProviderError(err, task); })
    )
  );

  const [scoreRes, corrRes, sumRes] = results;

  let scoreParsed, corrParsed, sumParsed;
  try { scoreParsed = ScoreSchema.parse(scoreRes.rawInput); }
  catch (err) {
    const e = new Error(`scores tool output invalid: ${err.message}`);
    e.code = 'AI_BAD_OUTPUT'; e.cause = err; throw e;
  }
  try { corrParsed = CorrectionsSchema.parse(corrRes.rawInput); }
  catch (err) {
    const e = new Error(`corrections tool output invalid: ${err.message}`);
    e.code = 'AI_BAD_OUTPUT'; e.cause = err; throw e;
  }
  try { sumParsed = SummarySchema.parse(sumRes.rawInput); }
  catch (err) {
    const e = new Error(`summary tool output invalid: ${err.message}`);
    e.code = 'AI_BAD_OUTPUT'; e.cause = err; throw e;
  }

  // Per-dim: clamp score to [0, max]; reorder to canonical dimension order.
  const byKey = new Map(scoreParsed.dimensions.map((d) => [d.key, d]));
  const canonical = DIMENSIONS.map((ref) => {
    const got = byKey.get(ref.key);
    const score = Math.max(0, Math.min(ref.max, got?.score ?? 0));
    return {
      key: ref.key,
      score,
      max: ref.max,
      feedback: got?.feedback ?? '',
    };
  });

  const aiScore = Math.round(canonical.reduce((s, d) => s + d.score, 0));

  // Aggregate usage. Each sub-call reports its own DeepSeek usage.
  const usageSum = { prompt_tokens: 0, completion_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 };
  let costUsd = 0;
  const perTask = {};
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const r = results[i];
    const u = r.usage;
    usageSum.prompt_tokens += u.prompt_tokens || 0;
    usageSum.completion_tokens += u.completion_tokens || 0;
    usageSum.prompt_cache_hit_tokens += u.prompt_cache_hit_tokens || 0;
    usageSum.prompt_cache_miss_tokens += u.prompt_cache_miss_tokens || 0;
    const taskCost = computeCostUsd(r.modelKey, u);
    costUsd += taskCost;
    perTask[task] = {
      model: r.modelKey,
      tokensIn: u.prompt_tokens || 0,
      tokensOut: u.completion_tokens || 0,
      cacheHit: u.prompt_cache_hit_tokens || 0,
      costUsd: Number(taskCost.toFixed(6)),
    };
  }
  const tokensCached = usageSum.prompt_cache_hit_tokens;

  logger.info(
    {
      essayId: essay.id,
      model: modelKey,
      provider: 'deepseek',
      latencyMs: Date.now() - started,
      tokensIn: usageSum.prompt_tokens,
      tokensOut: usageSum.completion_tokens,
      tokensCached,
      costUsd: Number(costUsd.toFixed(6)),
      perTask,
    },
    'ai_grader.done'
  );

  return {
    aiScore,
    aiFeedback: sumParsed.globalFeedback,
    rubric: canonical,
    corrections: corrParsed.corrections,
    strengths: sumParsed.strengths,
    model: modelKey,
    tokensIn: usageSum.prompt_tokens,
    tokensOut: usageSum.completion_tokens,
    tokensCached,
    costUsd,
  };
}

module.exports = {
  gradeEssay,
  // exported for tests
  _internal: {
    ScoreSchema,
    CorrectionsSchema,
    SummarySchema,
    SCORE_TOOL_DEF,
    CORRECTIONS_TOOL_DEF,
    SUMMARY_TOOL_DEF,
    computeCostUsd,
    normaliseLocale,
    SUBCALL_TIMEOUT_MS,
  },
};
