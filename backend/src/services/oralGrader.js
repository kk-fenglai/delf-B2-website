// AI oral grader for DELF B2 Production Orale.
//
// Mirrors aiGrader.js (Production Écrite) but operates on the STT transcript
// instead of the candidate's typed text. The transcript is segmented into
//   [MONOLOGUE] ... [DEBAT Q1: ...] ... [DEBAT Q2: ...] ...
// markers so the LLM can attribute scores to the right phase (in particular,
// the `interaction` dimension only looks at the débat segments).
//
// Why fan-out (3 parallel calls, same as PE):
//   Output-token generation dominates latency. Splitting reduces wall time
//   and lets the same system prompt serve as cache prefix.
//
// The three sub-calls:
//   - submit_scores       → 9 dimensions with brief feedback (≤ 25 mots)
//   - submit_corrections  → 3-8 spoken-language errors (gentler than PE,
//                            ignores filler words and hesitations)
//   - submit_summary      → strengths[] + globalFeedback

const OpenAI = require('openai');
const { z } = require('zod');
const env = require('../config/env');
const { logger } = require('../utils/logger');
const { deepseekV4RequestExtras } = require('../utils/deepseekRequest');
const {
  DIMENSIONS,
  DIMENSION_KEYS,
  TOTAL_MAX,
  CORRECTION_TYPES,
  MIN_WORDS,
} = require('../constants/delfOralRubric');
const {
  MODEL_CATALOG,
  MODEL_KEYS,
  CACHED_INPUT_MULTIPLIER,
} = require('../constants/planMatrix');

// ---- Provider registry (shared shape with aiGrader) ---------------------
const PROVIDERS = {
  deepseek: {
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseUrlEnv: 'DEEPSEEK_BASE_URL',
  },
  qwen: {
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    baseUrlEnv: 'DASHSCOPE_BASE_URL',
  },
};

const _clients = {};
function getClient(provider) {
  if (!PROVIDERS[provider]) {
    const e = new Error(`Unknown provider: ${provider}`);
    e.code = 'AI_BAD_MODEL';
    throw e;
  }
  if (!_clients[provider]) {
    const { apiKeyEnv, baseUrlEnv } = PROVIDERS[provider];
    const apiKey = env[apiKeyEnv];
    const baseURL = env[baseUrlEnv];
    if (!apiKey) {
      const e = new Error(`${apiKeyEnv} not configured`);
      e.code = 'AI_NOT_CONFIGURED';
      throw e;
    }
    _clients[provider] = new OpenAI({ apiKey, baseURL });
  }
  return _clients[provider];
}

// ---- Locale instructions -------------------------------------------------
const LOCALES = {
  fr: {
    label: 'français',
    instruction:
      "Rédigez TOUS les champs 'feedback', 'globalFeedback', 'issue', 'suggestion' et 'strengths' en français de niveau B2 professionnel.",
  },
  en: {
    label: 'English',
    instruction:
      "Write ALL 'feedback', 'globalFeedback', 'issue', 'suggestion' and 'strengths' fields in clear professional English. Keep technical terms in French where appropriate.",
  },
  zh: {
    label: '简体中文',
    instruction:
      "所有 'feedback'、'globalFeedback'、'issue'、'suggestion'、'strengths' 字段请用简体中文撰写；语法术语可保留法语原文。",
  },
};

function normaliseLocale(loc) {
  const l = String(loc || 'fr').toLowerCase().slice(0, 2);
  return LOCALES[l] ? l : 'fr';
}

// ---- System prompt -------------------------------------------------------
function buildSystemPrompt() {
  const rubricBlock = DIMENSIONS.map(
    (d) =>
      `  - ${d.key} (max ${d.max} pt) — ${d.labelFr}\n      Critère : ${d.anchor}`
  ).join('\n');

  return `Vous êtes un examinateur DELF B2 certifié par France Éducation International, spécialisé dans la Production Orale (épreuve individuelle, ~20 min après 30 min de préparation). Vous notez selon la GRILLE OFFICIELLE PO (25 points), à partir d'une TRANSCRIPTION AUTOMATIQUE de l'enregistrement du candidat.

GRILLE D'ÉVALUATION — 9 dimensions, total ${TOTAL_MAX} points :
${rubricBlock}

NATURE DE L'INPUT — IMPORTANT :
La transcription provient d'un système ASR. Elle peut contenir :
 - des mots manqués / mal reconnus (ne sanctionnez PAS le candidat pour des erreurs ASR évidentes — ex. "Apple" au lieu d'un nom français rare) ;
 - des disfluences (heu, euh, donc, voilà…) qui sont normales à l'oral et n'affectent l'aisance que si elles dominent ;
 - une ponctuation reconstruite — ne notez pas l'orthographe.

La transcription est segmentée :
 - [MONOLOGUE] : exposé du candidat (Partie 1, 5-7 min après préparation)
 - [DEBAT Q1] / [REPONSE 1] : question du jury et réponse (Partie 2)
 - [DEBAT Q2] / [REPONSE 2] : etc.
La dimension 'interaction' s'évalue UNIQUEMENT sur les segments [REPONSE i].
Les autres dimensions s'évaluent sur l'ensemble.

PROTOCOLE DE NOTATION :
 1. Lisez la transcription en entier avant de noter.
 2. Notez chaque dimension indépendamment, en vous appuyant sur le critère ci-dessus.
 3. Pour la dimension 'phonologie' : évaluez à partir d'INDICES TEXTUELS uniquement (mots tronqués, fausses reprises, syntaxe brisée signalant l'hésitation). Soyez prudent — la transcription ne reflète pas la prononciation directe ; en cas de doute, restez au milieu de la fourchette.
 4. Un score partiel (0.5, 1, 1.5…) est acceptable, mais toujours ≤ au max de la dimension.
 5. Pour les corrections : citation EXACTE (≤ 10 mots) du transcript original, sans reformulation. Visez les fautes lexicales / morphosyntaxiques claires ; ignorez les disfluences et les artefacts ASR.
 6. Type de correction : grammar | lexique | syntaxe | register.

INTERDIT :
 - Ne paraphrasez pas la grille dans les feedbacks.
 - Ne dépassez PAS le max d'une dimension.
 - N'inventez PAS des citations qui ne sont pas dans le transcript.
 - Ne calculez PAS de note globale — le système la recompose.
 - Ne sanctionnez PAS les disfluences orales mineures (ce serait double-pénalité avec 'aisance').

L'utilisateur vous demandera l'une de trois tâches ciblées (notation, corrections, ou synthèse). Concentrez-vous UNIQUEMENT sur la tâche demandée et appelez l'outil correspondant une seule fois.`;
}

let _systemPrompt = null;
function getSystemPrompt() {
  if (!_systemPrompt) _systemPrompt = buildSystemPrompt();
  return _systemPrompt;
}

// ---- Tool schemas --------------------------------------------------------
const SCORE_TOOL_DEF = {
  name: 'submit_scores',
  description:
    "Soumettre la notation des 9 dimensions de la grille DELF B2 PO. Feedback bref (≤ 25 mots par dimension).",
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
    "Soumettre 3 à 8 corrections concrètes : citation exacte (≤10 mots) du transcript, nature de l'erreur, suggestion, type. Ignorer les disfluences orales.",
  parameters: {
    type: 'object',
    properties: {
      corrections: {
        type: 'array',
        minItems: 0,
        maxItems: 8,
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
    .max(8),
});

const SummarySchema = z.object({
  strengths: z.array(z.string().min(5)).min(1).max(4),
  globalFeedback: z.string().min(80),
});

// ---- Usage / cost (same as aiGrader) -------------------------------------
function extractUsage(usage) {
  const promptTotal = usage.prompt_tokens || 0;
  const outTotal = usage.completion_tokens || 0;
  if (typeof usage.prompt_cache_hit_tokens === 'number' ||
      typeof usage.prompt_cache_miss_tokens === 'number') {
    const cached = usage.prompt_cache_hit_tokens || 0;
    const fresh =
      usage.prompt_cache_miss_tokens != null
        ? usage.prompt_cache_miss_tokens
        : Math.max(0, promptTotal - cached);
    return { promptTotal, outTotal, cached, fresh };
  }
  const cached = usage.prompt_tokens_details?.cached_tokens || 0;
  const fresh = Math.max(0, promptTotal - cached);
  return { promptTotal, outTotal, cached, fresh };
}

function computeCostUsd(modelKey, usage) {
  const m = MODEL_CATALOG[modelKey];
  if (!m) return 0;
  const { outTotal, cached, fresh } = extractUsage(usage);
  const inRate = m.inputUsdPerM / 1_000_000;
  const outRate = m.outputUsdPerM / 1_000_000;
  return fresh * inRate + cached * inRate * CACHED_INPUT_MULTIPLIER + outTotal * outRate;
}

// ---- Retry / sub-call ----------------------------------------------------
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
      await new Promise((r) => setTimeout(r, baseMs + Math.random() * 200));
    }
  }
  throw lastErr;
}

const SUBCALL_TIMEOUT_MS = {
  'qwen-turbo': 25_000,
  'deepseek-chat': 30_000,
  'qwen-plus': 12_000,
};

const TASK_HINTS = {
  scores:
    "TÂCHE : notez les 9 dimensions de la grille PO. Pour chaque dimension, un feedback BREF de ≤ 25 mots. Appelez submit_scores une seule fois.",
  corrections:
    "TÂCHE : identifiez 3 à 8 erreurs précises dans le transcript (hors disfluences). Pour chaque erreur : citation EXACTE (≤10 mots) du transcript, nature, suggestion, type. Appelez submit_corrections une seule fois.",
  summary:
    "TÂCHE : listez 2 à 4 points forts concrets (citez des passages réussis du transcript) et rédigez un retour global de 80 à 150 mots (forces → axes de progrès). Appelez submit_summary une seule fois.",
};

const TASK_TOOL_DEFS = {
  scores: SCORE_TOOL_DEF,
  corrections: CORRECTIONS_TOOL_DEF,
  summary: SUMMARY_TOOL_DEF,
};

const TASK_MAX_TOKENS = {
  scores: 1500,
  corrections: 2400,
  summary: 1000,
};

function buildUserContent({ transcriptCombined, question, followUps, loc, task }) {
  const followUpsBlock = followUps.length
    ? followUps
        .map((f, i) => `Question ${i + 1} : ${f.text}` + (f.expectedAngle ? `\n  (angle attendu : ${f.expectedAngle})` : ''))
        .join('\n')
    : '(aucune question prévue)';

  return `Sujet du document déclencheur (consigne) :
"""
${String(question.prompt || '').trim()}
"""

Document de support fourni au candidat :
"""
${String(question.passage || '').trim()}
"""

Questions prévues du jury (Partie 2) :
${followUpsBlock}

Transcription automatique de l'enregistrement (segments balisés) :
"""
${transcriptCombined.trim()}
"""

${TASK_HINTS[task]}

Langue du retour : ${LOCALES[loc].label}.
${LOCALES[loc].instruction}`;
}

async function runSubCall({ userModelKey, task, transcriptCombined, question, followUps, loc }) {
  const toolDef = TASK_TOOL_DEFS[task];
  const taskModel = MODEL_CATALOG[userModelKey];
  const client = getClient(taskModel.provider);

  const forceToolChoice = !(
    taskModel?.provider === 'deepseek' &&
    String(taskModel?.providerId || '').startsWith('deepseek-v4')
  );

  const call = () =>
    client.chat.completions.create(
      {
        model: taskModel.providerId,
        max_tokens: TASK_MAX_TOKENS[task],
        tools: [{ type: 'function', function: toolDef }],
        ...(forceToolChoice ? { tool_choice: { type: 'function', function: { name: toolDef.name } } } : {}),
        messages: [
          { role: 'system', content: getSystemPrompt() },
          {
            role: 'user',
            content: buildUserContent({ transcriptCombined, question, followUps, loc, task }),
          },
        ],
        ...deepseekV4RequestExtras(taskModel),
      },
      { timeout: SUBCALL_TIMEOUT_MS[userModelKey] || 10_000 }
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

  const tc = choice.message?.tool_calls?.[0];
  if (!tc || tc.type !== 'function' || tc.function?.name !== toolDef.name) {
    const e = new Error(`Expected tool_call=${toolDef.name} for task=${task}, got ${tc?.function?.name || 'none'}`);
    e.code = 'AI_NO_TOOL_USE';
    throw e;
  }

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
    modelKey: userModelKey,
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
  const wrapped = new Error(`Provider call failed (task=${task}): ${err?.message || err}`);
  wrapped.code = code;
  wrapped.cause = err;
  return wrapped;
}

function countWords(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
}

/**
 * @param {Object} args
 * @param {{ id: string, transcriptCombined: string }} args.oral
 * @param {{ prompt: string, passage?: string }} args.question
 * @param {{ text: string, expectedAngle?: string }[]} args.followUps
 * @param {string} args.modelKey
 * @param {string} args.locale
 */
async function gradeOral({ oral, question, followUps = [], modelKey, locale }) {
  if (!MODEL_KEYS.includes(modelKey)) {
    const e = new Error(`Unknown model key: ${modelKey}`);
    e.code = 'AI_BAD_MODEL';
    throw e;
  }
  const transcriptCombined = String(oral?.transcriptCombined || '');
  const wc = countWords(transcriptCombined);
  if (!transcriptCombined.trim() || wc < MIN_WORDS) {
    const e = new Error(`Transcript too short (need ≥ ${MIN_WORDS} words, got ${wc})`);
    e.code = 'AI_ORAL_TOO_SHORT';
    throw e;
  }

  const loc = normaliseLocale(locale);
  const started = Date.now();

  const tasks = ['scores', 'corrections', 'summary'];
  const results = await Promise.all(
    tasks.map((task) =>
      runSubCall({
        userModelKey: modelKey,
        task,
        transcriptCombined,
        question,
        followUps,
        loc,
      }).catch((err) => { throw wrapProviderError(err, task); })
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

  let tokensIn = 0, tokensOut = 0, tokensCached = 0, costUsd = 0;
  for (let i = 0; i < tasks.length; i++) {
    const r = results[i];
    const ext = extractUsage(r.usage);
    tokensIn += ext.promptTotal;
    tokensOut += ext.outTotal;
    tokensCached += ext.cached;
    costUsd += computeCostUsd(r.modelKey, r.usage);
  }

  logger.info(
    {
      oralId: oral.id,
      model: modelKey,
      provider: MODEL_CATALOG[modelKey]?.provider,
      latencyMs: Date.now() - started,
      tokensIn,
      tokensOut,
      tokensCached,
      costUsd: Number(costUsd.toFixed(6)),
      transcriptWords: wc,
    },
    'oral_grader.done'
  );

  return {
    aiScore,
    aiFeedback: sumParsed.globalFeedback,
    rubric: canonical,
    corrections: corrParsed.corrections,
    strengths: sumParsed.strengths,
    model: modelKey,
    tokensIn,
    tokensOut,
    tokensCached,
    costUsd,
  };
}

module.exports = {
  gradeOral,
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
