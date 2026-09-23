// TCF exam system (Test de connaissance du français). One level for now —
// "tout public" — fed by the TV5Monde practice booklets (see levels/toutPublic.js).
const toutPublic = require('./levels/toutPublic');

const LEVELS = { TCF_TP: toutPublic };

// Indicative CEFR level from the share of correct answers. The real TCF maps
// an IRT score (100–699) to A1…C2 per épreuve; a half-length practice booklet
// cannot reproduce that, so the frontend labels this an estimate. Ordered
// ascending; the last entry whose minPct ≤ pct wins.
const CEFR_BANDS = [
  { minPct: 0, level: 'A1' },
  { minPct: 20, level: 'A2' },
  { minPct: 40, level: 'B1' },
  { minPct: 60, level: 'B2' },
  { minPct: 80, level: 'C1' },
  { minPct: 93, level: 'C2' },
];

module.exports = {
  key: 'TCF',
  skills: [
    { key: 'CO', slug: 'listening' },
    { key: 'SL', slug: 'grammar' },
    { key: 'CE', slug: 'reading' },
  ],
  scoring: {
    kind: 'cefr', // 1 point per item; % correct → indicative CEFR level
    cefrBands: CEFR_BANDS,
  },
  LEVELS,
  LEVEL_KEYS: Object.keys(LEVELS),
  DEFAULT_LEVEL: 'TCF_TP',
  getLevel(key) {
    return LEVELS[String(key || '').toUpperCase()] || LEVELS.TCF_TP;
  },
  // No pe/po: the level has none (see toutPublic.js). Same field names as the
  // DELF/IELTS projections for everything that exists.
  toPublicLevel(lvl) {
    return {
      key: lvl.key,
      titlePrefix: lvl.titlePrefix,
      sectionPlan: lvl.sectionPlan,
      guide: lvl.guide,
      co: { playRules: lvl.co.playRules },
    };
  },
};
