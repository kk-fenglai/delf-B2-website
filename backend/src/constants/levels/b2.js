// DELF B2 level configuration — single source of truth for everything that
// varies by exam level (B2 / B1 / A2). The `pe` / `po` objects keep the EXACT
// export shape of the legacy constants/delfRubric.js and delfOralRubric.js
// (which now re-export from here), so existing imports and the byte-equality
// fixtures in test/ stay valid. Level-specific prompt fragments and exam-shape
// metadata live in sibling keys (pePrompt / poPrompt / poPlan / …) — they are
// server-only and must never be serialised to the public API (see
// levels/index.js toPublic).

// ---- Production Écrite — official grille d'évaluation (France Éducation
// International). 10 dimensions summing to 25 points.
const PE_DIMENSIONS = [
  {
    key: 'consigne',
    max: 2,
    labelFr: 'Respect de la consigne',
    anchor:
      "Le candidat produit-il un texte conforme au sujet, au genre demandé (lettre, article…) et à la longueur exigée (≈250 mots) ?",
  },
  {
    key: 'sociolinguistique',
    max: 2,
    labelFr: 'Correction sociolinguistique',
    anchor:
      "Le registre est-il adapté au destinataire et au genre ? Les formules d'usage sont-elles respectées ?",
  },
  {
    key: 'faits',
    max: 4,
    labelFr: 'Capacité à présenter des faits',
    anchor:
      "Les faits sont-ils exposés de façon claire, précise et nuancée ?",
  },
  {
    key: 'argumentation',
    max: 4,
    labelFr: 'Capacité à argumenter une prise de position',
    anchor:
      "La prise de position est-elle défendue par des arguments développés et illustrés d'exemples pertinents ?",
  },
  {
    key: 'coherence',
    max: 3,
    labelFr: 'Cohérence et cohésion',
    anchor:
      "Le texte est-il organisé en paragraphes ? Les connecteurs logiques et les reprises anaphoriques sont-ils employés correctement ?",
  },
  {
    key: 'lexique_etendue',
    max: 2,
    labelFr: 'Étendue du vocabulaire',
    anchor:
      "Le vocabulaire est-il varié et nuancé, dépassant le répertoire élémentaire ?",
  },
  {
    key: 'lexique_maitrise',
    max: 2,
    labelFr: 'Maîtrise du vocabulaire',
    anchor:
      "Le vocabulaire est-il employé correctement ? Les collocations et la terminologie sont-elles adaptées ?",
  },
  {
    key: 'orthographe',
    max: 1,
    labelFr: "Maîtrise de l'orthographe",
    anchor:
      "L'orthographe lexicale et grammaticale est-elle globalement maîtrisée ?",
  },
  {
    key: 'morphosyntaxe_etendue',
    max: 3,
    labelFr: 'Étendue de la morphosyntaxe',
    anchor:
      "Le candidat utilise-t-il une gamme étendue de structures (subordination, concordance des temps, tournures variées) ?",
  },
  {
    key: 'morphosyntaxe_maitrise',
    max: 2,
    labelFr: 'Maîtrise de la morphosyntaxe',
    anchor:
      "Les accords, conjugaisons et constructions sont-ils contrôlés ? Les erreurs compromettent-elles le sens ?",
  },
];

const pe = {
  DIMENSIONS: PE_DIMENSIONS,
  DIMENSION_KEYS: PE_DIMENSIONS.map((d) => d.key),
  TOTAL_MAX: PE_DIMENSIONS.reduce((s, d) => s + d.max, 0), // 25
  // Colour-code categories for inline annotations on the frontend.
  CORRECTION_TYPES: ['grammar', 'lexique', 'orthographe', 'syntaxe'],
  // Word-count policy for DELF B2 PE (official: "~250 words").
  MIN_WORDS: 50,     // below this we refuse to call the AI
  TARGET_WORDS: 250,
  MAX_WORDS: 800,    // above this we warn but still grade
};

// ---- Production Orale — official grille d'évaluation. 9 dimensions summing
// to 25 points. Note vs PE: PO has fewer dimensions (no orthographe, no
// "consigne" since the brief is read aloud), but adds the two oral-specific
// criteria — interaction and phonologie — that drive scoring at B2.
const PO_DIMENSIONS = [
  {
    key: 'presentation',
    max: 2,
    labelFr: 'Présentation du point de vue',
    anchor:
      "Le candidat introduit-il clairement son sujet et annonce-t-il un point de vue défendable, en restant en lien avec le document déclencheur ?",
  },
  {
    key: 'argumentation',
    max: 4,
    labelFr: 'Capacité à argumenter une prise de position',
    anchor:
      "La position est-elle défendue par des arguments développés, illustrés d'exemples concrets et hiérarchisés ?",
  },
  {
    key: 'interaction',
    max: 4,
    labelFr: 'Capacité à réagir et à dialoguer',
    anchor:
      "Le candidat réagit-il aux questions du jury sans relance excessive, nuance-t-il son propos et défend-il sa position face aux objections ?",
  },
  {
    key: 'aisance',
    max: 3,
    labelFr: 'Aisance et fluidité',
    anchor:
      "Le débit est-il suffisamment continu pour que la communication ne soit pas gênée ? Les pauses et hésitations sont-elles maîtrisées ?",
  },
  {
    key: 'lexique_etendue',
    max: 2,
    labelFr: 'Étendue du vocabulaire',
    anchor:
      "Le vocabulaire est-il varié et nuancé, dépassant le répertoire élémentaire ?",
  },
  {
    key: 'lexique_maitrise',
    max: 2,
    labelFr: 'Maîtrise du vocabulaire',
    anchor:
      "Le vocabulaire est-il employé correctement ? Les collocations et la terminologie sont-elles adaptées au contexte ?",
  },
  {
    key: 'morphosyntaxe_etendue',
    max: 3,
    labelFr: 'Étendue de la morphosyntaxe',
    anchor:
      "Le candidat utilise-t-il une gamme étendue de structures (subordination, concordance des temps, tournures variées) ?",
  },
  {
    key: 'morphosyntaxe_maitrise',
    max: 2,
    labelFr: 'Maîtrise de la morphosyntaxe',
    anchor:
      "Les accords, conjugaisons et constructions sont-ils contrôlés ? Les erreurs compromettent-elles le sens ?",
  },
  {
    key: 'phonologie',
    max: 3,
    labelFr: 'Phonologie',
    anchor:
      "La prononciation, l'intonation et le rythme sont-ils suffisamment clairs pour ne pas gêner la compréhension ?",
  },
];

const po = {
  DIMENSIONS: PO_DIMENSIONS,
  DIMENSION_KEYS: PO_DIMENSIONS.map((d) => d.key),
  TOTAL_MAX: PO_DIMENSIONS.reduce((s, d) => s + d.max, 0), // 25
  // Phonologie evaluated only loosely from the transcript (filler words,
  // repeated false starts, broken syntax suggesting hesitation) — explicit
  // caveat in the system prompt so the LLM doesn't over-penalise based on
  // textual artefacts.
  CORRECTION_TYPES: ['grammar', 'lexique', 'syntaxe', 'register'],
  // Word-count thresholds (computed from the STT transcript, monologue only).
  // Below MIN_WORDS we refuse to call the LLM — almost certainly a recording
  // failure or near-silence.
  MIN_WORDS: 80,       // ~50s of speech at slow B2 pace
  TARGET_WORDS: 450,   // monologue + débat answers combined target
  MAX_WORDS: 1500,
  // Recording length policy (seconds). UI enforces these as hard timers.
  MONOLOGUE_MAX_SEC: 10 * 60,      // 10 min monologue max
  FOLLOW_UP_MAX_SEC: 90,           // per-question débat answer cap
  PREP_DEFAULT_SEC: 30 * 60,       // 30 min in EXAM mode
  PREP_PRACTICE_SEC: 5 * 60,       // shortened in PRACTICE mode
};

// ---- Server-only prompt fragments ----------------------------------------
// Byte-for-byte extracts from the pre-level-refactor aiGrader/oralGrader
// system prompts. Any whitespace drift here invalidates DeepSeek's prefix
// cache and silently shifts B2 scores — the fixtures in test/fixtures/
// lock these down.
const pePrompt = {
  persona:
    "Vous êtes un examinateur DELF B2 certifié par France Éducation International avec 10 ans d'expérience en correction de la Production Écrite. Vous notez selon la GRILLE OFFICIELLE (25 points), sans clémence ni sévérité excessive.",
  // Few-shot calibration anchors. These are CALIBRATION, not decoration: they
  // pin what an 18/25 and a 12/25 copy look like AT THIS LEVEL. Each level
  // needs its own anchors validated against human-scored essays.
  anchors: `EXEMPLE — copie solide (18/25) :
  "Force est de constater que les algorithmes enferment les internautes dans des bulles cognitives…"
  → consigne 2/2, argumentation 3/4, coherence 3/3, lexique_etendue 2/2, morphosyntaxe_maitrise 1/2.

EXEMPLE — copie limite (12/25) :
  "Je pense que c'est mal parce que les gens ils regardent leur téléphone."
  → argumentation 1/4, coherence 1/3, lexique_etendue 0/2, morphosyntaxe_maitrise 0/2.`,
};

const poPrompt = {
  persona:
    "Vous êtes un examinateur DELF B2 certifié par France Éducation International, spécialisé dans la Production Orale (épreuve individuelle, ~20 min après 30 min de préparation). Vous notez selon la GRILLE OFFICIELLE PO (25 points), à partir d'une TRANSCRIPTION AUTOMATIQUE de l'enregistrement du candidat.",
  // The transcript segment contract. Kept as a literal (not templated) so the
  // B2 prompt reassembles byte-identically; B1/A2 define their own.
  segmentContract: `La transcription est segmentée :
 - [MONOLOGUE] : exposé du candidat (Partie 1, 5-7 min après préparation)
 - [DEBAT Q1] / [REPONSE 1] : question du jury et réponse (Partie 2)
 - [DEBAT Q2] / [REPONSE 2] : etc.
La dimension 'interaction' s'évalue UNIQUEMENT sur les segments [REPONSE i].
Les autres dimensions s'évaluent sur l'ensemble.`,
};

// ---- Exam-shape metadata --------------------------------------------------
// PE: number of writing tasks in one épreuve (A2 = 2 short tasks; B1/B2 = 1).
const pePlan = { tasks: 1 };

// PO: ordered parts + transcript marker templates. B2 = monologue + débat.
// `transcript` contains functions → server-only, stripped by toPublic().
// buildCombinedTranscript (oralQueue) must produce byte-identical output to
// the pre-refactor version for B2 — locked by test/oralTranscript.test.js.
const poPlan = {
  parts: [
    { key: 'monologue', order: 0, hasMonologue: true,  monologueMaxSec: 600, prepSec: 1800, followUpMaxSec: null },
    { key: 'debat',     order: 1, hasMonologue: false, monologueMaxSec: null, prepSec: 0,   followUpMaxSec: 90 },
  ],
  interactionParts: ['debat'], // which parts feed the `interaction` dimension
  transcript: {
    partHeader: null, // B2 emits no per-part header → transcript bytes unchanged
    monologueMarker: '[MONOLOGUE]',
    followUpQuestion: (n, text) => `[DEBAT Q${n}] ${text}`,
    followUpAnswer: (n) => `[REPONSE ${n}]`,
    missingAnswer: '(pas de réponse enregistrée)',
  },
};

// CO audio play rules by coFormat. These are the values previously hardcoded
// in examImport.js bulkCreateQuestions and routes/adminExams.js.
const co = {
  playRules: {
    long:  { maxPlays: 2, prepSeconds: 60, gapSeconds: 180, answerSeconds: 0 },
    short: { maxPlays: 1, prepSeconds: 30, gapSeconds: 0,   answerSeconds: 0 },
    other: { maxPlays: 2, prepSeconds: 60, gapSeconds: 180, answerSeconds: 0 },
  },
  defaultFormat: 'long', // reproduces the pre-refactor import default (2/60/180)
};

// Mock-exam section plan. `merges` expresses the B2-only rule that CE+PE run
// as one freely-allocated 120-minute block; B1/A2 set merges: [].
const sectionPlan = {
  order: ['CO', 'CE', 'PE', 'PO'],
  minutes: { CO: 30, CE: 30, PE: 60, PO: 20 },
  merges: [{ key: 'CEPE', skills: ['CE', 'PE'], minutes: 120 }],
  poSeparateSession: true,
};

const guide = { collectiveTotalMin: 150, individualPrepMin: 30 };

module.exports = {
  key: 'B2',
  titlePrefix: 'DELF B2',
  pe,
  po,
  pePrompt,
  poPrompt,
  pePlan,
  poPlan,
  co,
  sectionPlan,
  guide,
};
