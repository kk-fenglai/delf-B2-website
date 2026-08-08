// DELF A2 level configuration. Same shape as b2.js (see that file for the
// contract). Grilles transcribed from the official France Éducation
// International correction grids (grille PE A2 / grille PO A2) — dimension
// maxima include half-points; each grille sums to 25 (test/levels.test.js).
//
// PE flow note: the official A2 PE has TWO exercises (Ex1 raconter/décrire
// 13 pts, Ex2 lettre/interaction 12 pts) written in the same 45-minute
// épreuve. The app keeps ONE submission: the sujet presents both exercises
// (pePlan.tasks = 2 drives the UI) and the candidate writes both texts in a
// single editor; the grader scores the ex1_*/ex2_* dimensions on the
// matching text.
//
// PO flow note: same pipeline as B2 (one monologue + jury-question answers).
// The monologue carries the "monologue suivi" (Partie 2); the follow-up
// questions stand in for the entretien dirigé and exercice en interaction.

// ---- Production Écrite — official grille A2. Ex1 (13 pts) + Ex2 (12 pts),
// 12 dimensions, 25 points.
const PE_DIMENSIONS = [
  {
    key: 'ex1_consigne',
    max: 1,
    labelFr: 'Ex. 1 — Respect de la consigne',
    anchor:
      "Exercice 1 : la production est-elle en adéquation avec la situation proposée ? La longueur minimale (≈60 mots) est-elle respectée ?",
  },
  {
    key: 'ex1_raconter',
    max: 4,
    labelFr: 'Ex. 1 — Capacité à raconter et à décrire',
    anchor:
      "Peut décrire de manière simple des aspects quotidiens de son environnement (gens, choses, lieux) et des événements, activités passées, expériences personnelles.",
  },
  {
    key: 'ex1_impressions',
    max: 2,
    labelFr: 'Ex. 1 — Capacité à donner ses impressions',
    anchor:
      "Peut communiquer sommairement ses impressions, expliquer pourquoi une chose plaît ou déplaît.",
  },
  {
    key: 'ex1_lexique',
    max: 2,
    labelFr: 'Ex. 1 — Lexique / orthographe lexicale',
    anchor:
      "Peut utiliser un répertoire élémentaire de mots relatifs à la situation ; écrit avec une relative exactitude phonétique mais pas forcément orthographique.",
  },
  {
    key: 'ex1_morphosyntaxe',
    max: 2.5,
    labelFr: 'Ex. 1 — Morphosyntaxe / orthographe grammaticale',
    anchor:
      "Peut utiliser des structures et formes grammaticales simples ; des erreurs élémentaires systématiques restent tolérées.",
  },
  {
    key: 'ex1_coherence',
    max: 1.5,
    labelFr: 'Ex. 1 — Cohérence et cohésion',
    anchor:
      "Peut relier les mots avec des connecteurs très élémentaires tels que « et », « alors ».",
  },
  {
    key: 'ex2_consigne',
    max: 1,
    labelFr: 'Ex. 2 — Respect de la consigne',
    anchor:
      "Exercice 2 : la production est-elle en adéquation avec la situation proposée ? La longueur minimale (≈60 mots) est-elle respectée ?",
  },
  {
    key: 'ex2_sociolinguistique',
    max: 1,
    labelFr: 'Ex. 2 — Correction sociolinguistique',
    anchor:
      "Peut utiliser les registres adaptés au destinataire et au contexte, ainsi que les formes courantes de l'accueil et de la prise de congé.",
  },
  {
    key: 'ex2_interagir',
    max: 4,
    labelFr: 'Ex. 2 — Capacité à interagir',
    anchor:
      "Peut écrire une lettre personnelle simple pour exprimer remerciements, excuses, propositions, etc.",
  },
  {
    key: 'ex2_lexique',
    max: 2,
    labelFr: 'Ex. 2 — Lexique / orthographe lexicale',
    anchor:
      "Peut utiliser un répertoire élémentaire de mots relatifs à la situation ; écrit avec une relative exactitude phonétique mais pas forcément orthographique.",
  },
  {
    key: 'ex2_morphosyntaxe',
    max: 2.5,
    labelFr: 'Ex. 2 — Morphosyntaxe / orthographe grammaticale',
    anchor:
      "Peut utiliser des structures et formes grammaticales simples ; des erreurs élémentaires systématiques restent tolérées.",
  },
  {
    key: 'ex2_coherence',
    max: 1.5,
    labelFr: 'Ex. 2 — Cohérence et cohésion',
    anchor:
      "Peut produire un texte simple et cohérent et relier des énoncés avec les articulations les plus fréquentes.",
  },
];

const pe = {
  DIMENSIONS: PE_DIMENSIONS,
  DIMENSION_KEYS: PE_DIMENSIONS.map((d) => d.key),
  TOTAL_MAX: PE_DIMENSIONS.reduce((s, d) => s + d.max, 0), // 25
  CORRECTION_TYPES: ['grammar', 'lexique', 'orthographe', 'syntaxe'],
  // Official A2 PE: 2 exercises of 60-80 mots each, 45 minutes. Thresholds
  // apply to the COMBINED submission (both texts in one editor).
  MIN_WORDS: 30,     // below this we refuse to call the AI
  TARGET_WORDS: 140, // ≈70 mots × 2 exercices
  MAX_WORDS: 500,    // above this we warn but still grade
};

// ---- Production Orale — official grille A2. Per-part criteria + 3
// transversal criteria; 9 dimensions, 25 points.
const PO_DIMENSIONS = [
  {
    key: 'entretien_presentation',
    max: 3,
    labelFr: 'Entretien — se présenter',
    anchor:
      "Peut établir un contact social, se présenter et décrire son environnement familier. (À évaluer sur les segments [QUESTION i]/[REPONSE i] de type personnel.)",
  },
  {
    key: 'entretien_reponses',
    max: 1,
    labelFr: 'Entretien — répondre aux questions',
    anchor:
      "Peut répondre et réagir à des questions simples. Peut gérer une interaction simple.",
  },
  {
    key: 'monologue_presentation',
    max: 3,
    labelFr: 'Monologue — présenter simplement',
    anchor:
      "Peut présenter de manière simple un événement, une activité, un projet, un lieu, etc. liés à un contexte familier. (À évaluer sur le segment [MONOLOGUE].)",
  },
  {
    key: 'monologue_liaison',
    max: 2,
    labelFr: 'Monologue — relier les informations',
    anchor:
      "Peut relier entre elles les informations apportées de manière simple et claire.",
  },
  {
    key: 'interaction_transactions',
    max: 4,
    labelFr: 'Interaction — transactions simples',
    anchor:
      "Peut demander et donner des informations dans des transactions simples de la vie quotidienne. Peut faire, accepter ou refuser des propositions.",
  },
  {
    key: 'interaction_relations',
    max: 2,
    labelFr: 'Interaction — relations sociales',
    anchor:
      "Peut entrer dans des relations sociales simplement mais efficacement, en utilisant les expressions courantes et en suivant les usages de base.",
  },
  {
    key: 'lexique',
    max: 3,
    labelFr: 'Lexique (étendue et maîtrise)',
    anchor:
      "Peut utiliser un répertoire limité mais adéquat pour gérer des situations courantes de la vie quotidienne.",
  },
  {
    key: 'morphosyntaxe',
    max: 4,
    labelFr: 'Morphosyntaxe',
    anchor:
      "Peut utiliser des structures et des formes grammaticales simples. Le sens général reste clair malgré la présence systématique d'erreurs élémentaires.",
  },
  {
    key: 'phonologie',
    max: 3,
    labelFr: 'Maîtrise du système phonologique',
    anchor:
      "Peut s'exprimer de façon suffisamment claire. L'interlocuteur devra parfois faire répéter.",
  },
];

const po = {
  DIMENSIONS: PO_DIMENSIONS,
  DIMENSION_KEYS: PO_DIMENSIONS.map((d) => d.key),
  TOTAL_MAX: PO_DIMENSIONS.reduce((s, d) => s + d.max, 0), // 25
  CORRECTION_TYPES: ['grammar', 'lexique', 'syntaxe', 'register'],
  // Word-count thresholds (STT transcript, monologue + answers combined).
  MIN_WORDS: 40,       // below this: recording failure / near-silence
  TARGET_WORDS: 200,   // monologue suivi (~2 min) + réponses
  MAX_WORDS: 800,
  // Recording length policy (seconds). The whole A2 épreuve is 6-8 min.
  MONOLOGUE_MAX_SEC: 3 * 60,       // monologue suivi: ~2 min official
  FOLLOW_UP_MAX_SEC: 60,           // per-question answer cap
  PREP_DEFAULT_SEC: 10 * 60,       // official: 10 min prep
  PREP_PRACTICE_SEC: 3 * 60,       // shortened in PRACTICE mode
};

// ---- Server-only prompt fragments ----------------------------------------
const pePrompt = {
  persona:
    "Vous êtes un examinateur DELF A2 certifié par France Éducation International avec 10 ans d'expérience en correction de la Production Écrite. Vous notez selon la GRILLE OFFICIELLE A2 (25 points : Exercice 1 sur 13, Exercice 2 sur 12), sans clémence ni sévérité excessive. La copie contient DEUX textes courts (60-80 mots chacun) : Exercice 1 = raconter/décrire (journal, message…), Exercice 2 = lettre simple pour interagir (inviter, remercier, s'excuser…). Notez les dimensions ex1_* sur le premier texte et ex2_* sur le second. Au niveau A2, des erreurs élémentaires systématiques sont attendues et ne doivent pas être sur-pénalisées.",
  // Few-shot calibration anchors pinned at A2 expectations. TODO: validate
  // against human-scored A2 copies before high-stakes use.
  anchors: `EXEMPLE — copie solide (19/25) :
  "Samedi dernier, je suis allé au parc avec ma famille. Il faisait beau et nous avons fait un pique-nique…"
  → ex1_consigne 1/1, ex1_raconter 3.5/4, ex1_impressions 1.5/2, ex2_interagir 3/4.

EXEMPLE — copie limite (12/25) :
  "je va au cinema avec ami. le film est bien. / merci pour invitation je viens pas."
  → ex1_raconter 2/4, ex1_morphosyntaxe 1/2.5, ex2_sociolinguistique 0.5/1, ex2_interagir 1.5/4.`,
};

const poPrompt = {
  persona:
    "Vous êtes un examinateur DELF A2 certifié par France Éducation International, spécialisé dans la Production Orale (épreuve individuelle de 6-8 min : entretien dirigé, monologue suivi, exercice en interaction, après 10 min de préparation). Vous notez selon la GRILLE OFFICIELLE PO A2 (25 points), à partir d'une TRANSCRIPTION AUTOMATIQUE de l'enregistrement du candidat. Au niveau A2, des erreurs élémentaires systématiques sont attendues tant que le sens général reste clair.",
  segmentContract: `La transcription est segmentée :
 - [MONOLOGUE] : monologue suivi du candidat (Partie 2, ~2 min après préparation)
 - [QUESTION 1] / [REPONSE 1] : question de l'examinateur et réponse du candidat
 - [QUESTION 2] / [REPONSE 2] : etc.
Les dimensions 'entretien_*' et 'interaction_*' s'évaluent UNIQUEMENT sur les segments [REPONSE i] (les questions tiennent lieu d'entretien dirigé et d'exercice en interaction).
Les dimensions 'monologue_*' s'évaluent sur le segment [MONOLOGUE].
Les dimensions 'lexique', 'morphosyntaxe' et 'phonologie' s'évaluent sur l'ensemble.`,
};

// ---- Exam-shape metadata --------------------------------------------------
// PE: TWO short writing tasks in one submission (see flow note at the top).
const pePlan = { tasks: 2 };

// PO: monologue (monologue suivi) + jury questions — mirrors the B2 pipeline
// shape (one monologue part, one Q&A part).
const poPlan = {
  parts: [
    { key: 'monologue', order: 0, hasMonologue: true,  monologueMaxSec: 180, prepSec: 600, followUpMaxSec: null },
    { key: 'echange',   order: 1, hasMonologue: false, monologueMaxSec: null, prepSec: 0,  followUpMaxSec: 60 },
  ],
  interactionParts: ['echange'], // feeds the entretien_*/interaction_* dimensions
  transcript: {
    partHeader: null,
    monologueMarker: '[MONOLOGUE]',
    followUpQuestion: (n, text) => `[QUESTION ${n}] ${text}`,
    followUpAnswer: (n) => `[REPONSE ${n}]`,
    missingAnswer: '(pas de réponse enregistrée)',
  },
};

// CO audio play rules. At A2 every document is played TWICE; short prep/gap.
const co = {
  playRules: {
    long:  { maxPlays: 2, prepSeconds: 30, gapSeconds: 30, answerSeconds: 0 },
    short: { maxPlays: 2, prepSeconds: 30, gapSeconds: 0,  answerSeconds: 0 },
    other: { maxPlays: 2, prepSeconds: 30, gapSeconds: 30, answerSeconds: 0 },
  },
  defaultFormat: 'long',
};

// Mock-exam section plan. No merged block at A2. Official: CO ~25 min,
// CE 30 min, PE 45 min, PO 6-8 min.
const sectionPlan = {
  order: ['CO', 'CE', 'PE', 'PO'],
  minutes: { CO: 25, CE: 30, PE: 45, PO: 8 },
  merges: [],
  poSeparateSession: true,
};

const guide = { collectiveTotalMin: 100, individualPrepMin: 10 };

module.exports = {
  key: 'A2',
  titlePrefix: 'DELF A2',
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
