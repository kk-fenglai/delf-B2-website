// DELF B2 Production Orale — official grille d'évaluation (France Éducation
// International). 9 dimensions summing to 25 points. Single source of truth —
// imported by oralGrader (for prompt) and echoed back in API responses so the
// frontend doesn't hardcode scale or labels.
//
// Note vs Production Écrite: PO has fewer dimensions (no orthographe, no
// "consigne" since the brief is read aloud), but adds the two oral-specific
// criteria — interaction and phonologie — that drive scoring at B2.

const DIMENSIONS = [
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

const DIMENSION_KEYS = DIMENSIONS.map((d) => d.key);
const TOTAL_MAX = DIMENSIONS.reduce((s, d) => s + d.max, 0); // 25

// Phonologie evaluated only loosely from the transcript (filler words, repeated
// false starts, broken syntax suggesting hesitation) — explicit caveat in the
// system prompt so the LLM doesn't over-penalise based on textual artefacts.

const CORRECTION_TYPES = ['grammar', 'lexique', 'syntaxe', 'register'];

// Word-count thresholds (computed from the STT transcript, monologue only).
// Below MIN_WORDS we refuse to call the LLM — almost certainly a recording
// failure or near-silence.
const MIN_WORDS = 80;       // ~50s of speech at slow B2 pace
const TARGET_WORDS = 450;   // monologue + débat answers combined target
const MAX_WORDS = 1500;

// Recording length policy (seconds). UI enforces these as hard timers.
const MONOLOGUE_MAX_SEC = 10 * 60;       // 10 min monologue max
const FOLLOW_UP_MAX_SEC = 90;            // per-question débat answer cap
const PREP_DEFAULT_SEC = 30 * 60;        // 30 min in EXAM mode
const PREP_PRACTICE_SEC = 5 * 60;        // shortened in PRACTICE mode

module.exports = {
  DIMENSIONS,
  DIMENSION_KEYS,
  TOTAL_MAX,
  CORRECTION_TYPES,
  MIN_WORDS,
  TARGET_WORDS,
  MAX_WORDS,
  MONOLOGUE_MAX_SEC,
  FOLLOW_UP_MAX_SEC,
  PREP_DEFAULT_SEC,
  PREP_PRACTICE_SEC,
};
