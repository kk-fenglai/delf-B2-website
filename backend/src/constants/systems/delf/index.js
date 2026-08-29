// DELF exam system — thin wrapper over the existing level registry and
// scoring constants. No behavior lives here: constants/levels/ stays the
// single source of truth so the 10+ existing require sites are untouched.
const levels = require('../../levels');
const scoring = require('../../delfScoring');

module.exports = {
  key: 'DELF',
  // Semantic slug ↔ system skill key. Slugs are shared across systems and
  // match the frontend routes (/practice/<slug>).
  skills: [
    { key: 'CO', slug: 'listening' },
    { key: 'CE', slug: 'reading' },
    { key: 'PE', slug: 'writing' },
    { key: 'PO', slug: 'speaking' },
  ],
  scoring: {
    kind: 'points', // per-skill points summed to a total, with pass thresholds
    skillMax: scoring.SKILL_MAX_POINTS,
    totalMax: scoring.TOTAL_MAX,
    passTotalMin: scoring.PASS_TOTAL_MIN,
    passPerSkillMin: scoring.PASS_PER_SKILL_MIN,
  },
  LEVELS: levels.LEVELS,
  LEVEL_KEYS: levels.LEVEL_KEYS,
  DEFAULT_LEVEL: levels.DEFAULT_LEVEL,
  getLevel: levels.getLevel,
  toPublicLevel: levels.toPublic,
};
