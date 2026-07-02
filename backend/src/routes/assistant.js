// 划词助手 (reading assistant) endpoints: word lookup, sentence translation +
// grammar, full-passage translation. AI-plan only (403 upsell otherwise, same
// contract as the question-explanation endpoint). Mounted at /api/assistant
// behind a per-IP rate limiter — every cache miss costs DeepSeek tokens.
const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { planAtLeast } = require('../constants/planMatrix');
const { lookupWord, explainSentence, translatePassage } = require('../services/readingAssistant');

const router = express.Router();

const langSchema = z.enum(['zh', 'en', 'fr']).default('zh');
// Selected word/expression: short, single-line French text.
const wordSchema = z.object({
  word: z.string().trim().min(1).max(64).refine((s) => !/\n/.test(s), 'single line only'),
  lang: langSchema,
});
const sentenceSchema = z.object({
  text: z.string().trim().min(2).max(600),
  lang: langSchema,
});
const passageSchema = z.object({
  text: z.string().trim().min(20).max(8000),
  lang: langSchema,
});

// All three endpoints share the same auth + plan gate.
router.use(requireAuth, (req, res, next) => {
  if (!planAtLeast(req.userPlan, 'AI')) {
    return res.status(403).json({ error: 'upgrade_required', upsell: true });
  }
  next();
});

function aiErrorToHttp(e, res, next) {
  if (e.code === 'AI_NOT_CONFIGURED') return res.status(503).json({ error: 'AI not configured' });
  if (e.code === 'AI_EMPTY' || e instanceof SyntaxError) {
    return res.status(502).json({ error: 'AI returned an unusable reply, please retry' });
  }
  return next(e);
}

// POST /api/assistant/word — dictionary card for a selected word (cached globally)
router.post('/word', async (req, res, next) => {
  const parsed = wordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid word' });
  try {
    res.json(await lookupWord(parsed.data));
  } catch (e) { aiErrorToHttp(e, res, next); }
});

// POST /api/assistant/sentence — translation + grammar notes for a selection
router.post('/sentence', async (req, res, next) => {
  const parsed = sentenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid text' });
  try {
    res.json(await explainSentence(parsed.data));
  } catch (e) { aiErrorToHttp(e, res, next); }
});

// POST /api/assistant/passage — full translation of a reading passage
router.post('/passage', async (req, res, next) => {
  const parsed = passageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid text' });
  try {
    res.json(await translatePassage(parsed.data));
  } catch (e) { aiErrorToHttp(e, res, next); }
});

module.exports = router;
