// TCF "tout public" level config. Content source: the 17 TV5Monde / France
// Éducation International "Livret d'entraînement" booklets — a half-length
// version of the three compulsory TCF épreuves, all 4-option single-choice
// items worth 1 point:
//   CO  Compréhension orale        items 1–15  (official paper: 29)
//   SL  Structures de la langue    items 16–25 (official paper: 18)
//   CE  Compréhension écrite       items 26–40 (official paper: 29)
// No PE/PO: TCF's optional Expression écrite/orale are not in the booklets,
// so this level deliberately exposes no `pe`/`po` — the shared AI graders are
// never reached because examImport only accepts SINGLE for system TCF.
//
// Skill keys reuse DELF's CO/CE on purpose: routes/exams.js special-cases
// 'CO' (transcript scrubbing, AudioDocument-only audio), and TCF listening
// needs exactly that behaviour.

const co = {
  // One continuous recording per booklet (all 15 items with their pauses),
  // played once — the official TCF listening rule.
  playRules: {
    single: { maxPlays: 1, prepSeconds: 0, gapSeconds: 0, answerSeconds: 0 },
  },
  defaultFormat: 'single',
};

// Minutes scaled from the official paper (CO 25 / SL 15 / CE 45 for
// 29/18/29 items) to the booklet's item counts.
const sectionPlan = {
  order: ['CO', 'SL', 'CE'],
  minutes: { CO: 15, SL: 10, CE: 25 },
  merges: [],
  poSeparateSession: false,
};

const guide = { collectiveTotalMin: 50, individualPrepMin: 0 };

module.exports = {
  key: 'TCF_TP',
  titlePrefix: 'TCF',
  co,
  sectionPlan,
  guide,
};
