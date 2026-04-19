// AI essay grader for DELF B2 Production Écrite.
//
// Contract: gradeEssay({ essay, question, modelKey, locale }) → structured
// rubric result. Caller (essayQueue) is responsible for persistence — this
// module is pure I/O: Claude in, parsed + validated JSON out.
//
// Design notes:
//  - tool_use with tool_choice forces a single JSON call; no parsing free text
//  - system prompt is marked with cache_control: ephemeral so the rubric +
//    few-shot examples hit the 5-min Anthropic prompt cache (~90% discount on
//    input token cost) after the first call in a 5-min window
//  - total aiScore is recomputed server-side from dimensions; we never trust
//    a model-claimed total
//  - 3 retries with exponential backoff for 429 / 5xx; surfaces a typed error
//    for essayQueue to classify (transient vs terminal)

const Anthropic = require('@anthropic-ai/sdk');
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
  if (!env.ANTHROPIC_API_KEY) {
    const e = new Error('ANTHROPIC_API_KEY not configured');
    e.code = 'AI_NOT_CONFIGURED';
    throw e;
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
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

// ---- System prompt (cached) ---------------------------------------------
// Kept stable so the cache key survives between calls. If you change this
// string you invalidate the cache — plan rollouts accordingly.
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
 4. Identifiez 3 à 8 erreurs précises à corriger (corrections[]). Pour chaque :
      - excerpt : citation EXACTE (≤ 10 mots) extraite du texte original, sans reformulation
      - issue   : nature de l'erreur
      - suggestion : correction proposée
      - type : grammar | lexique | orthographe | syntaxe
 5. Listez 2 à 4 points forts concrets (strengths[]) en citant des formulations réussies du texte.
 6. Rédigez un retour global (globalFeedback) de 80 à 180 mots — constructif, hiérarchisé (forces → axes de progrès).

INTERDIT :
 - Ne paraphrasez pas la grille dans les feedbacks.
 - Ne dépassez PAS le max d'une dimension.
 - N'inventez PAS des citations qui ne sont pas dans le texte.
 - Ne calculez PAS de note globale — le système la recompose.

SORTIE : vous devez appeler l'outil "submit_grade" une seule fois avec un JSON valide. Pas de texte libre avant ou après.

EXEMPLE ABRÉGÉ — copie solide (18/25) :
  Sujet : "Les réseaux sociaux nuisent-ils au débat démocratique ?"
  Extrait : "Force est de constater que les algorithmes enferment les internautes dans des bulles cognitives…"
  → consigne 2/2, argumentation 3/4 (exemples variés mais 1 argument peu développé), coherence 3/3, lexique_etendue 2/2, morphosyntaxe_maitrise 1/2 (2 erreurs d'accord).

EXEMPLE ABRÉGÉ — copie limite (12/25) :
  Extrait : "Je pense que c'est mal parce que les gens ils regardent leur téléphone."
  → argumentation 1/4 (argument non développé), coherence 1/3 (pas de connecteurs), lexique_etendue 0/2 (registre oral), morphosyntaxe_maitrise 0/2 (reprise pronominale fautive).`;
}

// Lazy-build + memoize (same string across calls ⇒ same cache key).
let _systemPrompt = null;
function getSystemPrompt() {
  if (!_systemPrompt) _systemPrompt = buildSystemPrompt();
  return _systemPrompt;
}

// ---- Tool schema ---------------------------------------------------------
const GRADE_TOOL = {
  name: 'submit_grade',
  description:
    "Soumettre l'évaluation détaillée d'une copie de DELF B2 Production Écrite selon la grille officielle.",
  input_schema: {
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
            feedback: { type: 'string', minLength: 20 },
          },
          required: ['key', 'score', 'max', 'feedback'],
        },
      },
      corrections: {
        type: 'array',
        minItems: 0,
        maxItems: 20,
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
      strengths: {
        type: 'array',
        minItems: 1,
        maxItems: 6,
        items: { type: 'string', minLength: 5 },
      },
      globalFeedback: { type: 'string', minLength: 80 },
    },
    required: ['dimensions', 'corrections', 'strengths', 'globalFeedback'],
  },
};

// Zod mirrors the tool schema for defence-in-depth: even if Anthropic ever
// relaxes tool validation, we reject malformed output locally.
const ToolOutputSchema = z.object({
  dimensions: z
    .array(
      z.object({
        key: z.enum(DIMENSION_KEYS),
        score: z.number().min(0),
        max: z.number().min(0),
        feedback: z.string().min(20),
      })
    )
    .length(DIMENSIONS.length),
  corrections: z
    .array(
      z.object({
        excerpt: z.string().min(1).max(200),
        issue: z.string().min(5),
        suggestion: z.string().min(1),
        type: z.enum(CORRECTION_TYPES),
      })
    )
    .max(20),
  strengths: z.array(z.string().min(5)).min(1).max(6),
  globalFeedback: z.string().min(80),
});

// ---- Cost calculator -----------------------------------------------------
function computeCostUsd(modelKey, usage) {
  const m = MODEL_CATALOG[modelKey];
  if (!m) return 0;
  const freshIn = usage.input_tokens || 0;
  const cachedIn =
    (usage.cache_read_input_tokens || 0) +
    // cache_creation_input_tokens is billed at 1.25x, but Anthropic reports
    // it separately; for now we bill it at 1.25x to match invoicing.
    (usage.cache_creation_input_tokens || 0) * 1.25;
  const out = usage.output_tokens || 0;

  const inRate = m.inputUsdPerM / 1_000_000;
  const outRate = m.outputUsdPerM / 1_000_000;

  return (
    freshIn * inRate +
    cachedIn * inRate * CACHED_INPUT_MULTIPLIER +
    out * outRate
  );
}

// ---- Retry wrapper -------------------------------------------------------
async function withRetry(fn, { attempts = 3, baseMs = 800 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = err?.status || err?.response?.status;
      // 4xx other than 429 are terminal — don't retry.
      if (status && status >= 400 && status < 500 && status !== 429) throw err;
      if (i === attempts - 1) break;
      const wait = baseMs * Math.pow(2, i) + Math.random() * 300;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
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
  const model = MODEL_CATALOG[modelKey];
  const started = Date.now();

  const userContent = `Consigne (sujet) :
"""
${String(question.prompt || '').trim()}
"""

Copie du candidat (${essay.wordCount} mots) :
"""
${essay.content.trim()}
"""

Langue du retour : ${LOCALES[loc].label}.
${LOCALES[loc].instruction}`;

  const call = () =>
    client.messages.create({
      model: model.anthropicId,
      max_tokens: 2500,
      temperature: 0.2,
      system: [
        {
          type: 'text',
          text: getSystemPrompt(),
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [GRADE_TOOL],
      tool_choice: { type: 'tool', name: GRADE_TOOL.name },
      messages: [{ role: 'user', content: userContent }],
    });

  let resp;
  try {
    resp = await withRetry(call);
  } catch (err) {
    const code =
      err?.status === 429 ? 'AI_RATE_LIMITED' :
      err?.status >= 500   ? 'AI_PROVIDER_DOWN' :
      'AI_CALL_FAILED';
    const wrapped = new Error(`Claude call failed: ${err?.message || err}`);
    wrapped.code = code;
    wrapped.cause = err;
    throw wrapped;
  }

  // Extract the tool_use block. stop_reason should be 'tool_use'.
  const toolUse = (resp.content || []).find((b) => b.type === 'tool_use');
  if (!toolUse) {
    const e = new Error('Claude returned no tool_use block');
    e.code = 'AI_NO_TOOL_USE';
    throw e;
  }

  // Validate shape. If this throws, the queue will mark as error (terminal).
  let parsed;
  try {
    parsed = ToolOutputSchema.parse(toolUse.input);
  } catch (err) {
    const e = new Error(`Tool output failed Zod validation: ${err.message}`);
    e.code = 'AI_BAD_OUTPUT';
    e.cause = err;
    throw e;
  }

  // Per-dim: clamp score to [0, max]; reorder to canonical dimension order so
  // frontend can zip against DIMENSIONS by index.
  const byKey = new Map(parsed.dimensions.map((d) => [d.key, d]));
  const canonical = DIMENSIONS.map((ref) => {
    const got = byKey.get(ref.key);
    const score = Math.max(0, Math.min(ref.max, got?.score ?? 0));
    return {
      key: ref.key,
      score,
      max: ref.max, // enforce the authoritative max
      feedback: got?.feedback ?? '',
    };
  });

  // Server-side total (ignore any model-claimed total).
  const aiScore = Math.round(canonical.reduce((s, d) => s + d.score, 0));

  const usage = resp.usage || {};
  const tokensCached =
    (usage.cache_read_input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0);
  const costUsd = computeCostUsd(modelKey, usage);

  logger.info(
    {
      essayId: essay.id,
      model: modelKey,
      latencyMs: Date.now() - started,
      tokensIn: usage.input_tokens,
      tokensOut: usage.output_tokens,
      tokensCached,
      costUsd: Number(costUsd.toFixed(6)),
      stopReason: resp.stop_reason,
    },
    'ai_grader.done'
  );

  return {
    aiScore,
    aiFeedback: parsed.globalFeedback,
    rubric: canonical,
    corrections: parsed.corrections,
    strengths: parsed.strengths,
    model: modelKey,
    tokensIn: usage.input_tokens || 0,
    tokensOut: usage.output_tokens || 0,
    tokensCached,
    costUsd,
  };
}

module.exports = {
  gradeEssay,
  // exported for tests
  _internal: { ToolOutputSchema, GRADE_TOOL, computeCostUsd, normaliseLocale },
};
