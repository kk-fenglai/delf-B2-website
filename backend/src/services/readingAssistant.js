// 划词助手 (reading assistant): AI dictionary lookups, sentence translation +
// grammar explanations, and full-passage translation for CE reading texts.
// Powered by deepseek-chat, same pattern as questionExplainer.js. Word lookups
// are cached in the WordLookup table (shared across all users); sentence and
// passage translations are not cached (arbitrary selections rarely repeat).
// Gated to AI-plan users at the route layer.
const OpenAI = require('openai');
const env = require('../config/env');
const prisma = require('../prisma');
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
    _client = new OpenAI({
      apiKey: env.DEEPSEEK_API_KEY,
      baseURL: env.DEEPSEEK_BASE_URL,
      timeout: 60_000,   // hard cap per call; SDK aborts and throws
      maxRetries: 1,     // one retry on transient network/5xx errors
    });
  }
  return _client;
}

// Explanation language for definitions / grammar notes (French text stays French).
const LANG_NAME = { zh: '简体中文', en: 'English', fr: 'français' };
function normLang(l) {
  const x = String(l || 'zh').toLowerCase().slice(0, 2);
  return LANG_NAME[x] ? x : 'zh';
}

// Strip a raw model reply down to the JSON object (defends against stray
// markdown fences even though response_format=json_object is requested).
function parseJsonReply(raw) {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object') throw new Error('Non-object JSON reply');
  return parsed;
}

// ---- Reply normalization ----
// json_object mode guarantees valid JSON, NOT field shapes: deepseek sometimes
// nests items (observed: grammar as [{ note, fragment }] instead of strings),
// which crashed the React popup. Flatten everything to the exact shapes the
// frontend renders so a creative reply can never break the UI or poison the
// WordLookup cache.
function asText(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(' ; ');
  if (typeof v === 'object') return Object.values(v).map(asText).filter(Boolean).join(' — ');
  return '';
}
function asTextArray(v) {
  return (Array.isArray(v) ? v : v == null ? [] : [v]).map(asText).filter(Boolean);
}
function asPairs(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((it) => (it && typeof it === 'object' && !Array.isArray(it)
      ? { fr: asText(it.fr), tr: asText(it.tr) }
      : { fr: asText(it), tr: '' }))
    .filter((p) => p.fr || p.tr);
}
function normalizeWordCard(r, word) {
  return {
    word: asText(r.word) || word,
    lemma: asText(r.lemma) || asText(r.word) || word,
    pos: asText(r.pos),
    ipa: asText(r.ipa),
    meanings: asTextArray(r.meanings),
    forms: asText(r.forms),
    examples: asPairs(r.examples),
  };
}
function normalizeSentenceCard(r) {
  const translation = asText(r.translation);
  if (!translation) {
    const e = new Error('Empty translation from model');
    e.code = 'AI_EMPTY';
    throw e;
  }
  return { translation, grammar: asTextArray(r.grammar), vocab: asPairs(r.vocab) };
}

async function chatJson({ system, user, maxTokens }) {
  const resp = await client().chat.completions.create({
    model: PROVIDER_MODEL,
    temperature: 0.2,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return parseJsonReply(resp.choices?.[0]?.message?.content);
}

/**
 * Dictionary-style lookup of a French word/expression, 法语助手 style.
 * Cached in WordLookup by `${lang}:${word}` — one DeepSeek call per word ever.
 * @returns {Promise<object>} { word, lemma, pos, ipa, meanings[], forms, examples[] }
 */
async function lookupWord({ word, lang }) {
  const L = normLang(lang);
  const w = String(word).trim().toLowerCase();
  const key = `${L}:${w}`;

  const cached = await prisma.wordLookup.findUnique({ where: { key } });
  if (cached) {
    try { return normalizeWordCard(JSON.parse(cached.result), w); } catch { /* corrupt row — regenerate below */ }
  }

  const raw = await chatJson({
    maxTokens: 700,
    system: 'You are a precise French–Chinese/English dictionary for DELF B2 learners, like 法语助手. Reply with a single JSON object only.',
    user: [
      `Look up the French word or expression: « ${word} »`,
      'Return JSON with exactly these keys:',
      '{',
      '  "word": the form as given,',
      '  "lemma": dictionary base form (infinitive for verbs, masculine singular for adjectives),',
      '  "pos": part of speech abbreviation, e.g. "n.f." "n.m." "v.t." "adj." "adv." "loc.",',
      '  "ipa": IPA pronunciation of the lemma, without slashes,',
      `  "meanings": array of 1-4 plain strings — short definitions in ${LANG_NAME[L]}, most common first,`,
      '  "forms": one short note on conjugation/gender/plural if irregular or notable, else "",',
      `  "examples": array of 1-2 { "fr": B2-level example sentence, "tr": its ${LANG_NAME[L]} translation }`,
      '}',
      'Every array item must be exactly the type shown above — no extra nesting.',
      'If the input is inflected (e.g. a conjugated verb), identify the lemma and mention the form in "forms".',
      'If it is not a French word, set "meanings" to a single best guess and say so in "forms".',
    ].join('\n'),
  });
  const result = normalizeWordCard(raw, w);

  // Cache is best-effort: a lost write only costs one extra AI call later.
  try {
    await prisma.wordLookup.upsert({
      where: { key },
      create: { key, word: w, lang: L, result: JSON.stringify(result) },
      update: { result: JSON.stringify(result) },
    });
  } catch (err) {
    logger?.warn?.({ err, key }, 'failed to cache word lookup');
  }
  return result;
}

/**
 * Translate a selected sentence/phrase and explain its grammar.
 * @returns {Promise<object>} { translation, grammar[], vocab[] }
 */
async function explainSentence({ text, lang }) {
  const L = normLang(lang);
  const raw = await chatJson({
    maxTokens: 900,
    system: 'You are an experienced DELF B2 French tutor. You translate accurately and explain grammar clearly and concisely. Reply with a single JSON object only.',
    user: [
      'From a DELF B2 reading passage, a learner selected this French text:',
      `"""\n${text}\n"""`,
      'Return JSON with exactly these keys:',
      '{',
      `  "translation": faithful ${LANG_NAME[L]} translation,`,
      `  "grammar": array of 1-4 plain strings — each one a short ${LANG_NAME[L]} note on a grammar point worth learning here (tense/mood choice, pronouns, connectors, sentence structure), quoting the relevant French fragment inside the string,`,
      `  "vocab": array of 0-5 { "fr": key word or expression, "tr": ${LANG_NAME[L]} meaning } for B2-level vocabulary in the text`,
      '}',
      'Every array item must be exactly the type shown above — no extra nesting.',
      'Keep every note to one or two sentences.',
    ].join('\n'),
  });
  return normalizeSentenceCard(raw);
}

/**
 * Translate a whole reading passage, preserving paragraph breaks so the
 * frontend can interleave source and translation paragraph by paragraph.
 * @returns {Promise<{translation: string}>}
 */
async function translatePassage({ text, lang }) {
  const L = normLang(lang);
  const paragraphs = String(text).split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);
  const resp = await client().chat.completions.create({
    model: PROVIDER_MODEL,
    temperature: 0.2,
    max_tokens: 3000,
    messages: [
      { role: 'system', content: `You translate French DELF B2 exam texts into natural, faithful ${LANG_NAME[L]}. Output the translation only — no preamble, no notes.` },
      {
        role: 'user',
        content: [
          `Translate this French text into ${LANG_NAME[L]}.`,
          `It has ${paragraphs.length} paragraph(s); translate paragraph by paragraph and separate them with a blank line, keeping the same paragraph count.`,
          '"""',
          paragraphs.join('\n\n'),
          '"""',
        ].join('\n'),
      },
    ],
  });
  const translation = (resp.choices?.[0]?.message?.content || '').trim();
  if (!translation) {
    const e = new Error('Empty translation from model');
    e.code = 'AI_EMPTY';
    throw e;
  }
  return { translation };
}

module.exports = { lookupWord, explainSentence, translatePassage };
