// Level registry. getLevel() NEVER throws and defaults to B2 — every call
// site that has no level (legacy rows, missing query param, undefined) gets
// the exact B2 objects, so "B2 unchanged" is structural, not a convention.
const b2 = require('./b2');
const b1 = require('./b1');
const a2 = require('./a2');

const LEVELS = { B2: b2, B1: b1, A2: a2 };
const LEVEL_KEYS = Object.keys(LEVELS);
const DEFAULT_LEVEL = 'B2';

/** Unknown / null / legacy → B2. Never throws. */
function getLevel(key) {
  return LEVELS[String(key || '').toUpperCase()] || LEVELS[DEFAULT_LEVEL];
}

/**
 * Public projection for GET /api/levels — strips server-only fragments
 * (pePrompt / poPrompt contain LLM prompt text; poPlan.transcript contains
 * functions). Everything returned here is safe to cache client-side.
 */
function toPublic(lvl) {
  return {
    key: lvl.key,
    titlePrefix: lvl.titlePrefix,
    sectionPlan: lvl.sectionPlan,
    guide: lvl.guide,
    co: { playRules: lvl.co.playRules },
    pe: {
      minWords: lvl.pe.MIN_WORDS,
      targetWords: lvl.pe.TARGET_WORDS,
      maxWords: lvl.pe.MAX_WORDS,
      tasks: lvl.pePlan.tasks,
      dimensions: lvl.pe.DIMENSIONS.map(({ key, max, labelFr }) => ({ key, max, labelFr })),
    },
    po: {
      minWords: lvl.po.MIN_WORDS,
      targetWords: lvl.po.TARGET_WORDS,
      maxWords: lvl.po.MAX_WORDS,
      prepDefaultSec: lvl.po.PREP_DEFAULT_SEC,
      prepPracticeSec: lvl.po.PREP_PRACTICE_SEC,
      parts: lvl.poPlan.parts,
      dimensions: lvl.po.DIMENSIONS.map(({ key, max, labelFr }) => ({ key, max, labelFr })),
    },
  };
}

module.exports = { LEVELS, LEVEL_KEYS, DEFAULT_LEVEL, getLevel, toPublic };
