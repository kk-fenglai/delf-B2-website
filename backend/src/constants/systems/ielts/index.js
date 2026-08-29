// IELTS exam system (Academic only for now — General Training would add a
// second level sharing LISTENING/SPEAKING content).
const academic = require('./levels/academic');

const LEVELS = { IELTS_AC: academic };

module.exports = {
  key: 'IELTS',
  skills: [
    { key: 'LISTENING', slug: 'listening' },
    { key: 'READING', slug: 'reading' },
    { key: 'WRITING', slug: 'writing' },
    { key: 'SPEAKING', slug: 'speaking' },
  ],
  scoring: {
    kind: 'band', // 0–9 in 0.5 steps; overall = mean of 4 skills rounded to .5
    bandMin: 0,
    bandMax: 9,
    bandStep: 0.5,
  },
  LEVELS,
  LEVEL_KEYS: Object.keys(LEVELS),
  DEFAULT_LEVEL: 'IELTS_AC',
  getLevel(key) {
    return LEVELS[String(key || '').toUpperCase()] || LEVELS.IELTS_AC;
  },
  // Mirrors constants/levels/index.js toPublic() field-for-field (server-only
  // prompt fragments and transcript functions stripped) + IELTS bands extra.
  toPublicLevel(lvl) {
    return {
      key: lvl.key,
      titlePrefix: lvl.titlePrefix,
      sectionPlan: lvl.sectionPlan,
      co: { playRules: lvl.co.playRules },
      bands: lvl.bands, // raw(0..40) → band conversion, applied client-side
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
  },
};
