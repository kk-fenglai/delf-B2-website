// On-demand AI explanations for CO (listening) and CE (reading) objective
// questions. Generated with deepseek-chat, cached on Question.aiExplanation as
// JSON { zh?, en?, fr? } and reused across all users (the question content is
// identical for everyone). Gated to AI-plan users at the route layer.
const OpenAI = require('openai');
const env = require('../config/env');
const { logger } = require('../utils/logger');

const PROVIDER_MODEL = 'deepseek-chat';
let _client = null;
function client() {
  if (!_client) {
    if (!env.DEEPSEEK_API_KEY) {
      const e = new Error('DEEPSEEK_API_KEY not configured');
      e.code = 'AI_NOT_CONFIGURED';
      throw e;
    }
    _client = new OpenAI({ apiKey: env.DEEPSEEK_API_KEY, baseURL: env.DEEPSEEK_BASE_URL });
  }
  return _client;
}

const LANG_INSTRUCTION = {
  zh: '用简体中文撰写解析；法语术语和题目中的法语原文保留法语。',
  en: 'Write the explanation in clear English; keep French terms and quoted French from the question in French.',
  fr: 'Rédigez l’explication en français de niveau B2 clair.',
};
function normLang(l) {
  const x = String(l || 'zh').toLowerCase().slice(0, 2);
  return LANG_INSTRUCTION[x] ? x : 'zh';
}

function readCache(raw) {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

// Build the user prompt from the question, its options and any source text.
function buildPrompt(q, lang) {
  const correct = (q.options || []).filter((o) => o.isCorrect).map((o) => `${o.label}. ${o.text}`);
  const allOpts = (q.options || []).map((o) => `${o.label}. ${o.text}`);
  const source = (q.readingPassage?.content || q.passage || '').trim();
  const skillName = q.skill === 'CO' ? 'Compréhension de l’oral (listening)' : 'Compréhension des écrits (reading)';
  const parts = [
    `DELF B2 ${skillName} question. Explain it for a learner reviewing their answer.`,
    source ? `Source text:\n"""\n${source.slice(0, 4000)}\n"""` : '(No source text available — reason from the question itself.)',
    `Question: ${q.prompt}`,
    allOpts.length ? `Options:\n${allOpts.join('\n')}` : '(Open-ended / fill-in question.)',
    correct.length ? `Correct answer: ${correct.join(' ; ')}` : (q.explanation ? `Reference: ${q.explanation}` : ''),
    '',
    'Write a focused explanation that covers:',
    '1. Why the correct answer is correct (cite the relevant part of the source if given).',
    allOpts.length ? '2. Briefly why each other option is wrong.' : '2. What a strong answer must contain.',
    '3. One key vocabulary / grammar / strategy tip for this question type.',
    'Keep it concise (about 120–200 words). Plain text, no markdown headers.',
    LANG_INSTRUCTION[lang],
  ].filter(Boolean);
  return parts.join('\n');
}

/**
 * Get (cached) or generate the AI explanation for a question in `lang`.
 * @param {object} question  Question with `options`, `readingPassage`, fields.
 * @param {string} lang      zh | en | fr
 * @param {(id:string, text:string)=>Promise<void>} persist  saves merged cache
 * @returns {Promise<string>}
 */
async function getOrCreateExplanation(question, lang, persist) {
  const L = normLang(lang);
  const cache = readCache(question.aiExplanation);
  if (cache[L] && String(cache[L]).trim()) return cache[L];

  const resp = await client().chat.completions.create({
    model: PROVIDER_MODEL,
    temperature: 0.3,
    max_tokens: 700,
    messages: [
      { role: 'system', content: 'You are an experienced DELF B2 examiner and tutor. You explain why answers are right or wrong clearly and accurately.' },
      { role: 'user', content: buildPrompt(question, L) },
    ],
  });
  const text = (resp.choices?.[0]?.message?.content || '').trim();
  if (!text) {
    const e = new Error('Empty explanation from model');
    e.code = 'AI_EMPTY';
    throw e;
  }

  cache[L] = text;
  try {
    await persist(question.id, JSON.stringify(cache));
  } catch (err) {
    // Caching is best-effort; still return the generated text.
    logger?.warn?.({ err, questionId: question.id }, 'failed to cache aiExplanation');
  }
  return text;
}

module.exports = { getOrCreateExplanation };
