// AI essay grader for DELF Production Écrite (level-aware; defaults to B2).
//
// Providers: DeepSeek V4 (api.deepseek.com) + Qwen/DashScope (dashscope.aliyuncs.com).
// Both expose an OpenAI-compatible chat-completions endpoint, so we use the
// `openai` SDK with two baseURL/apiKey instances and dispatch by model. Adding
// another OpenAI-compatible provider later is a one-entry addition to
// PROVIDERS below + a MODEL_CATALOG row in planMatrix.js.
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
const { deepseekV4RequestExtras } = require('../utils/deepseekRequest');
const { DEFAULT_LEVEL } = require('../constants/levels');
// resolveLevel 跨体系查找 level 配置：getLevel('IELTS_AC') 会静默回落 B2（法语
// grille 批英语作文），resolveLevel 命中 IELTS 自己的配置；B2/B1/A2 行为不变。
const { resolveLevel } = require('../constants/systems');
const {
  MODEL_CATALOG,
  MODEL_KEYS,
  CACHED_INPUT_MULTIPLIER,
} = require('../constants/planMatrix');

// ---- Provider registry + lazy singletons --------------------------------
// Each provider entry knows how to extract its own env config. Adding a new
// OpenAI-compatible provider: append an entry here and a MODEL_CATALOG row.
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
// Kept stable across all 3 sub-calls so DeepSeek's prefix cache can hit. One
// stable string PER LEVEL (memoised below); changing a level's string
// invalidates that level's cache — plan rollouts accordingly. For B2 this
// must reassemble byte-identically to the pre-refactor prompt (locked by
// test/fixtures/peSystemPrompt.txt).
function buildSystemPrompt(lvl) {
  const { DIMENSIONS, TOTAL_MAX, CORRECTION_TYPES } = lvl.pe;
  const rubricBlock = DIMENSIONS.map(
    (d) =>
      `  - ${d.key} (max ${d.max} pt) — ${d.labelFr}\n      Critère : ${d.anchor}`
  ).join('\n');

  return `${lvl.pePrompt.persona}

GRILLE D'ÉVALUATION — ${DIMENSIONS.length} dimensions, total ${TOTAL_MAX} points :
${rubricBlock}

PROTOCOLE DE NOTATION :
 1. Lisez d'abord le texte en entier avant de noter.
 2. Notez chaque dimension indépendamment, en vous appuyant sur le critère ci-dessus.
 3. Un score partiel (0.5, 1, 1.5…) est acceptable, mais toujours ≤ au max de la dimension.
 4. Pour les corrections : citation EXACTE (≤ 10 mots) du texte original, sans reformulation.
 5. Type de correction : ${CORRECTION_TYPES.join(' | ')}.

INTERDIT :
 - Ne paraphrasez pas la grille dans les feedbacks.
 - Ne dépassez PAS le max d'une dimension.
 - N'inventez PAS des citations qui ne sont pas dans le texte.
 - Ne calculez PAS de note globale — le système la recompose.

${lvl.pePrompt.anchors}

L'utilisateur vous demandera l'une de trois tâches ciblées (notation, corrections, ou synthèse). Concentrez-vous UNIQUEMENT sur la tâche demandée et appelez l'outil correspondant une seule fois.`;
}

const _systemPrompts = new Map();
function getSystemPrompt(levelKey = DEFAULT_LEVEL) {
  const lvl = resolveLevel(levelKey);
  if (!_systemPrompts.has(lvl.key)) {
    // 级别配置可提供完整 prompt（IELTS 英文骨架）；缺省走共享法语骨架。
    _systemPrompts.set(lvl.key, lvl.pePrompt.fullPrompt || buildSystemPrompt(lvl));
  }
  return _systemPrompts.get(lvl.key);
}

// ---- Tool schemas (one per sub-call) -------------------------------------
// Wrapped in OpenAI function-calling envelope at call time; the `parameters`
// field is plain JSON Schema. Built per level (dimension count / keys /
// correction types vary), memoised alongside the system prompt.
function buildToolDefs(lvl) {
  const { DIMENSIONS, DIMENSION_KEYS, CORRECTION_TYPES } = lvl.pe;
  return {
    scores: {
      name: 'submit_scores',
      description:
        lvl.pePrompt.toolDescriptions?.scores
        || `Soumettre la notation des ${DIMENSIONS.length} dimensions de la grille DELF ${lvl.key}. Feedback bref (≤ 25 mots par dimension).`,
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
    },
    corrections: {
      name: 'submit_corrections',
      description:
        lvl.pePrompt.toolDescriptions?.corrections
        || "Soumettre 3 à 8 corrections concrètes : citation exacte (≤10 mots), nature de l'erreur, suggestion, type.",
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
    },
    summary: {
      name: 'submit_summary',
      description:
        lvl.pePrompt.toolDescriptions?.summary
        || "Soumettre 2 à 4 points forts concrets et un retour global (80-150 mots, hiérarchisé forces → axes de progrès).",
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
    },
  };
}

const _toolDefs = new Map();
function getToolDefs(levelKey = DEFAULT_LEVEL) {
  const lvl = resolveLevel(levelKey);
  if (!_toolDefs.has(lvl.key)) _toolDefs.set(lvl.key, buildToolDefs(lvl));
  return _toolDefs.get(lvl.key);
}

// Per-task Zod schemas mirror the tool parameters for defence-in-depth.
// Normalise correction type: AI sometimes returns French variants or wrong case.
const CORRECTION_TYPE_MAP = {
  grammar: 'grammar', grammaire: 'grammar', grammatical: 'grammar', grammaticale: 'grammar',
  lexique: 'lexique', lexical: 'lexique', vocabulaire: 'lexique', vocabulary: 'lexique',
  orthographe: 'orthographe', spelling: 'orthographe', orthography: 'orthographe',
  syntaxe: 'syntaxe', syntax: 'syntaxe', syntaxique: 'syntaxe',
};
function normaliseCorrectionType(raw) {
  return CORRECTION_TYPE_MAP[String(raw || '').toLowerCase()] || 'grammar';
}

const ScoreSchema = z.object({
  dimensions: z
    .array(
      z.object({
        key: z.string(),                     // validated post-parse against DIMENSION_KEYS
        score: z.coerce.number().min(0),     // coerce "2" → 2
        max: z.coerce.number().min(0),
        feedback: z.string().min(1),         // just non-empty
      })
    )
    .min(1),                                 // at least 1 dimension (not exactly 10)
});

const CorrectionsSchema = z.object({
  corrections: z
    .array(
      z.object({
        excerpt: z.string().min(1).max(400),
        issue: z.string().min(1),
        suggestion: z.string().min(1),
        type: z.string().transform(normaliseCorrectionType),
      })
    )
    .max(12),
});

const SummarySchema = z.object({
  strengths: z.array(z.string().min(1)).min(1).max(6),
  globalFeedback: z.string().min(10),        // just non-trivial
});

// ---- Usage parsing -------------------------------------------------------
// DeepSeek:      prompt_cache_hit_tokens / prompt_cache_miss_tokens
// Qwen (OpenAI): prompt_tokens_details.cached_tokens
// Both:          prompt_tokens, completion_tokens
function extractUsage(usage) {
  const promptTotal = usage.prompt_tokens || 0;
  const outTotal = usage.completion_tokens || 0;
  // DeepSeek surfaces cache split at top level.
  if (typeof usage.prompt_cache_hit_tokens === 'number' ||
      typeof usage.prompt_cache_miss_tokens === 'number') {
    const cached = usage.prompt_cache_hit_tokens || 0;
    const fresh =
      usage.prompt_cache_miss_tokens != null
        ? usage.prompt_cache_miss_tokens
        : Math.max(0, promptTotal - cached);
    return { promptTotal, outTotal, cached, fresh };
  }
  // OpenAI-standard shape (Qwen compatible-mode uses this).
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
// Per-model SDK timeout. Aimed slightly above the p95 generation time per
// model so legit slow responses still land; tighter than the old Anthropic
// budget because both providers are fast.
const SUBCALL_TIMEOUT_MS = {
  'qwen-turbo': 25_000,
  'deepseek-chat': 30_000,
  'qwen-plus': 35_000,
};

// Task hints no longer hardcode "en français" — the response language is now
// driven by the locale instruction appended in buildUserContent (this was the
// locale bug: `loc` was computed but never reached the model, so PE feedback
// was always French regardless of the user's aiLocale).
function buildTaskHint(task, lvl) {
  // 级别配置可提供英文任务提示（IELTS）；缺省走共享法语提示。
  if (lvl.pePrompt.taskHints?.[task]) return lvl.pePrompt.taskHints[task];
  switch (task) {
    case 'scores':
      return `TÂCHE : notez les ${lvl.pe.DIMENSIONS.length} dimensions de la grille. Chaque champ 'feedback' doit être BREF (≤ 25 mots). Appelez submit_scores une seule fois.`;
    case 'corrections':
      return "TÂCHE : identifiez 3 à 8 erreurs précises. Citation EXACTE (≤10 mots) du texte original pour 'excerpt'. Appelez submit_corrections une seule fois.";
    case 'summary':
      return "TÂCHE : champ 'strengths' = 2 à 4 points forts (≤15 mots chacun). Champ 'globalFeedback' = axes de progrès et conseils (80–150 mots) — NE répétez PAS les points forts, n'ajoutez PAS de titre. Appelez submit_summary une seule fois.";
    default:
      return '';
  }
}

const TASK_MAX_TOKENS = {
  scores: 2400,
  corrections: 2800,
  summary: 1800,
};

// With a single DeepSeek tier, every sub-call uses the same model. Shape kept
// for when we add deepseek-reasoner (R1) as a premium tier later.
function modelForTask(_task, userModelKey) {
  return userModelKey;
}

function buildUserContent(essay, question, task, lvl, loc) {
  return `Consigne (sujet) :
"""
${String(question.prompt || '').trim()}
"""

Copie du candidat (${essay.wordCount} mots) :
"""
${essay.content.trim()}
"""

${buildTaskHint(task, lvl)}

Langue du retour : ${LOCALES[loc].label}.
${LOCALES[loc].instruction}`;
}

async function runSubCall({ userModelKey, task, essay, question, levelKey, loc }) {
  const toolDef = getToolDefs(levelKey)[task];
  const taskModelKey = modelForTask(task, userModelKey);
  const taskModel = MODEL_CATALOG[taskModelKey];
  // Dispatch to the right provider client based on the model's provider tag.
  const client = getClient(taskModel.provider);

  const call = () =>
    client.chat.completions.create(
      {
        model: taskModel.providerId,
        max_tokens: TASK_MAX_TOKENS[task],
        tools: [{ type: 'function', function: toolDef }],
        tool_choice: { type: 'function', function: { name: toolDef.name } },
        messages: [
          { role: 'system', content: getSystemPrompt(levelKey) },
          { role: 'user', content: buildUserContent(essay, question, task, resolveLevel(levelKey), loc) },
        ],
        ...deepseekV4RequestExtras(taskModel),
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
    logger.error({
      task,
      model: userModelKey,
      finishReason: choice.finish_reason,
      gotTool: tc?.function?.name ?? null,
      messageContent: choice.message?.content?.slice(0, 300) ?? null,
    }, 'aiGrader.noToolUse');
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
  logger.error({ task, httpStatus: status ?? null, providerMsg: err?.message ?? null, code }, 'aiGrader.providerError');
  const wrapped = new Error(`Provider call failed (task=${task}): ${err?.message || err}`);
  wrapped.code = code;
  wrapped.cause = err;
  return wrapped;
}

// ---- Aggregation ---------------------------------------------------------
// 总分聚合按级别可配：DELF = 维度求和取整（sur 25，行为不变）；IELTS 级别配置
// 提供 aggregateScore = 等权平均就近取 0.5 band。
function aggregateDimScores(lvl, dims) {
  if (typeof lvl.pe.aggregateScore === 'function') return lvl.pe.aggregateScore(dims);
  return Math.round(dims.reduce((s, d) => s + d.score, 0));
}

// ---- Public API ----------------------------------------------------------
/**
 * @param {Object} args
 * @param {{ id: string, content: string, wordCount: number }} args.essay
 * @param {{ prompt: string }} args.question
 * @param {string} args.modelKey   — one of MODEL_KEYS
 * @param {string} args.locale     — fr | en | zh
 * @param {string} [args.level]    — exam level (B2 | B1 | A2); missing/unknown → B2
 * @returns {Promise<{ aiScore, aiFeedback, rubric, corrections, strengths, model, tokensIn, tokensOut, tokensCached, costUsd }>}
 */
async function gradeEssay({ essay, question, modelKey, locale, level, onPartial }) {
  const lvl = resolveLevel(level);
  if (!MODEL_KEYS.includes(modelKey)) {
    const e = new Error(`Unknown model key: ${modelKey}`);
    e.code = 'AI_BAD_MODEL';
    throw e;
  }
  if (!essay?.content || essay.wordCount < lvl.pe.MIN_WORDS) {
    const e = new Error(`Essay too short (need ≥ ${lvl.pe.MIN_WORDS} words)`);
    e.code = 'AI_ESSAY_TOO_SHORT';
    throw e;
  }

  const loc = normaliseLocale(locale);
  const started = Date.now();

  // Fan out: 3 sub-calls in parallel. Each sub-call resolves its own client
  // via the model's provider tag (DeepSeek or Qwen).
  // When onPartial is provided, each sub-call writes its parsed result to the
  // DB immediately on completion so the frontend can show progressive results.
  const tasks = ['scores', 'corrections', 'summary'];
  const results = await Promise.all(
    tasks.map(async (task) => {
      const res = await runSubCall({ userModelKey: modelKey, task, essay, question, levelKey: lvl.key, loc })
        .catch((err) => { throw wrapProviderError(err, task); });

      if (onPartial) {
        try {
          if (task === 'scores') {
            const parsed = ScoreSchema.parse(res.rawInput);
            const byKey = new Map(parsed.dimensions.map((d) => [d.key, d]));
            const canonical = lvl.pe.DIMENSIONS.map((ref) => {
              const got = byKey.get(ref.key);
              const score = Math.max(0, Math.min(ref.max, got?.score ?? 0));
              return { key: ref.key, score, max: ref.max, feedback: got?.feedback ?? '' };
            });
            await onPartial('scores', {
              rubric: canonical,
              aiScore: aggregateDimScores(lvl, canonical),
            });
          } else if (task === 'corrections') {
            const parsed = CorrectionsSchema.parse(res.rawInput);
            await onPartial('corrections', { corrections: parsed.corrections });
          } else if (task === 'summary') {
            const parsed = SummarySchema.parse(res.rawInput);
            await onPartial('summary', { aiFeedback: parsed.globalFeedback, strengths: parsed.strengths });
          }
        } catch { /* partial write failure doesn't abort the grade */ }
      }

      return res;
    })
  );

  const [scoreRes, corrRes, sumRes] = results;

  let scoreParsed, corrParsed, sumParsed;
  try { scoreParsed = ScoreSchema.parse(scoreRes.rawInput); }
  catch (err) {
    logger.error({ task: 'scores', model: modelKey, level: lvl.key, zodError: err.message, raw: scoreRes.rawInput }, 'aiGrader.parse.fail');
    const e = new Error(`scores tool output invalid: ${err.message}`);
    e.code = 'AI_BAD_OUTPUT'; e.cause = err; throw e;
  }
  try { corrParsed = CorrectionsSchema.parse(corrRes.rawInput); }
  catch (err) {
    logger.error({ task: 'corrections', model: modelKey, level: lvl.key, zodError: err.message, raw: corrRes.rawInput }, 'aiGrader.parse.fail');
    const e = new Error(`corrections tool output invalid: ${err.message}`);
    e.code = 'AI_BAD_OUTPUT'; e.cause = err; throw e;
  }
  try { sumParsed = SummarySchema.parse(sumRes.rawInput); }
  catch (err) {
    logger.error({ task: 'summary', model: modelKey, level: lvl.key, zodError: err.message, raw: sumRes.rawInput }, 'aiGrader.parse.fail');
    const e = new Error(`summary tool output invalid: ${err.message}`);
    e.code = 'AI_BAD_OUTPUT'; e.cause = err; throw e;
  }

  // Per-dim: clamp score to [0, max]; reorder to the LEVEL's canonical
  // dimension order — using the wrong level here silently returns the other
  // level's keys with all-zero scores.
  const byKey = new Map(scoreParsed.dimensions.map((d) => [d.key, d]));
  const canonical = lvl.pe.DIMENSIONS.map((ref) => {
    const got = byKey.get(ref.key);
    const score = Math.max(0, Math.min(ref.max, got?.score ?? 0));
    return {
      key: ref.key,
      score,
      max: ref.max,
      feedback: got?.feedback ?? '',
    };
  });

  const aiScore = aggregateDimScores(lvl, canonical);

  // Aggregate usage across sub-calls. Each provider's usage shape differs;
  // extractUsage normalises to { promptTotal, outTotal, cached, fresh }.
  let tokensIn = 0, tokensOut = 0, tokensCached = 0, costUsd = 0;
  const perTask = {};
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const r = results[i];
    const ext = extractUsage(r.usage);
    tokensIn += ext.promptTotal;
    tokensOut += ext.outTotal;
    tokensCached += ext.cached;
    const taskCost = computeCostUsd(r.modelKey, r.usage);
    costUsd += taskCost;
    perTask[task] = {
      model: r.modelKey,
      provider: MODEL_CATALOG[r.modelKey]?.provider,
      tokensIn: ext.promptTotal,
      tokensOut: ext.outTotal,
      cacheHit: ext.cached,
      costUsd: Number(taskCost.toFixed(6)),
    };
  }

  logger.info(
    {
      essayId: essay.id,
      model: modelKey,
      provider: MODEL_CATALOG[modelKey]?.provider,
      latencyMs: Date.now() - started,
      tokensIn,
      tokensOut,
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
    tokensIn,
    tokensOut,
    tokensCached,
    costUsd,
  };
}

module.exports = {
  gradeEssay,
  // exported for tests. The *_TOOL_DEF keys keep their legacy names and point
  // at the default-level (B2) instances so the byte-equality fixtures apply.
  _internal: {
    ScoreSchema,
    CorrectionsSchema,
    SummarySchema,
    SCORE_TOOL_DEF: getToolDefs(DEFAULT_LEVEL).scores,
    CORRECTIONS_TOOL_DEF: getToolDefs(DEFAULT_LEVEL).corrections,
    SUMMARY_TOOL_DEF: getToolDefs(DEFAULT_LEVEL).summary,
    computeCostUsd,
    normaliseLocale,
    getSystemPrompt,
    getToolDefs,
    SUBCALL_TIMEOUT_MS,
  },
};
