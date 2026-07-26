// DELF B1 level configuration. Same shape as b2.js (see that file for the
// contract). Grilles transcribed from the official France Éducation
// International correction grids (grille PE B1 / grille PO B1, "DOCUMENT
// RÉSERVÉ AUX CORRECTEURS") — dimension maxima include half-points; the sum
// of each grille is 25 (locked by test/levels.test.js).
//
// PO flow note: the app records ONE monologue + N jury-question answers
// (OralFollowUp), same pipeline as B2. The real B1 épreuve has 3 parts
// (entretien dirigé → exercice en interaction → point de vue); here the
// monologue carries the "expression d'un point de vue" and the follow-up
// questions stand in for the entretien/interaction exchanges. The grader is
// told (segmentContract) to score the part-1/part-2 dimensions from the
// question/answer segments.

// ---- Production Écrite — official grille B1. 10 dimensions, 25 points.
const PE_DIMENSIONS = [
  {
    key: 'consigne',
    max: 2,
    labelFr: 'Respect de la consigne',
    anchor:
      "Le candidat met-il sa production en adéquation avec le sujet proposé ? Respecte-t-il la consigne de longueur minimale indiquée (≈160 mots) ?",
  },
  {
    key: 'faits',
    max: 4,
    labelFr: 'Capacité à présenter des faits',
    anchor:
      "Le candidat peut-il décrire des faits, des événements ou des expériences ?",
  },
  {
    key: 'pensee',
    max: 4,
    labelFr: 'Capacité à exprimer sa pensée',
    anchor:
      "Le candidat peut-il présenter ses idées, ses sentiments et/ou ses réactions et donner son opinion ?",
  },
  {
    key: 'coherence',
    max: 3,
    labelFr: 'Cohérence et cohésion',
    anchor:
      "Le candidat peut-il relier une série d'éléments courts, simples et distincts en un discours qui s'enchaîne ?",
  },
  {
    key: 'lexique_etendue',
    max: 2,
    labelFr: 'Étendue du vocabulaire',
    anchor:
      "Possède-t-il un vocabulaire suffisant pour s'exprimer sur des sujets courants, si nécessaire à l'aide de périphrases ?",
  },
  {
    key: 'lexique_maitrise',
    max: 2,
    labelFr: 'Maîtrise du vocabulaire',
    anchor:
      "Montre-t-il une bonne maîtrise du vocabulaire élémentaire ? (Des erreurs sérieuses restent tolérées sur une pensée plus complexe.)",
  },
  {
    key: 'orthographe_lexicale',
    max: 2,
    labelFr: "Maîtrise de l'orthographe lexicale",
    anchor:
      "L'orthographe lexicale, la ponctuation et la mise en page sont-elles assez justes pour être suivies facilement le plus souvent ?",
  },
  {
    key: 'elaboration_phrases',
    max: 2,
    labelFr: 'Degré d’élaboration des phrases',
    anchor:
      "Maîtrise-t-il bien la structure de la phrase simple et les phrases complexes les plus courantes ?",
  },
  {
    key: 'temps_modes',
    max: 2,
    labelFr: 'Choix des temps et des modes',
    anchor:
      "Fait-il preuve d'un bon contrôle des temps et des modes malgré de nettes influences de la langue maternelle ?",
  },
  {
    key: 'morphosyntaxe',
    max: 2,
    labelFr: 'Morphosyntaxe - orthographe grammaticale',
    anchor:
      "Les accords en genre et en nombre, pronoms et marques verbales sont-ils contrôlés ?",
  },
];

const pe = {
  DIMENSIONS: PE_DIMENSIONS,
  DIMENSION_KEYS: PE_DIMENSIONS.map((d) => d.key),
  TOTAL_MAX: PE_DIMENSIONS.reduce((s, d) => s + d.max, 0), // 25
  CORRECTION_TYPES: ['grammar', 'lexique', 'orthographe', 'syntaxe'],
  // Official B1 PE: essai d'environ 160 mots minimum, 45 minutes.
  MIN_WORDS: 40,     // below this we refuse to call the AI
  TARGET_WORDS: 160,
  MAX_WORDS: 600,    // above this we warn but still grade
};

// ---- Production Orale — official grille B1. Flat list of the per-part
// criteria + the 3 transversal criteria; 11 dimensions, 25 points.
const PO_DIMENSIONS = [
  {
    key: 'entretien_parler_de_soi',
    max: 2,
    labelFr: 'Entretien — parler de soi',
    anchor:
      "Peut parler de soi avec une certaine assurance en donnant informations, raisons et explications relatives à ses centres d'intérêt, projets et actions. (À évaluer sur les segments [QUESTION i]/[REPONSE i] de type personnel.)",
  },
  {
    key: 'entretien_echange',
    max: 1,
    labelFr: 'Entretien — aborder un échange',
    anchor:
      "Peut aborder sans préparation un échange sur un sujet familier avec une certaine assurance.",
  },
  {
    key: 'interaction_situations',
    max: 1,
    labelFr: 'Interaction — faire face aux situations',
    anchor:
      "Peut faire face sans préparation à des situations même un peu inhabituelles de la vie courante (respect de la situation et des codes sociolinguistiques).",
  },
  {
    key: 'interaction_actes_parole',
    max: 2,
    labelFr: 'Interaction — adapter les actes de parole',
    anchor: "Peut adapter les actes de parole à la situation.",
  },
  {
    key: 'interaction_repondre',
    max: 2,
    labelFr: "Interaction — répondre à l'interlocuteur",
    anchor:
      "Peut répondre aux sollicitations de l'interlocuteur (vérifier et confirmer des informations, commenter le point de vue d'autrui, etc.).",
  },
  {
    key: 'pdv_presentation',
    max: 1,
    labelFr: 'Point de vue — présenter le sujet',
    anchor:
      "Peut présenter d'une manière simple et directe le sujet à développer. (À évaluer sur le segment [EXPOSE].)",
  },
  {
    key: 'pdv_reflexion',
    max: 2.5,
    labelFr: 'Point de vue — réflexion personnelle',
    anchor:
      "Peut présenter et expliquer avec assez de précision les points principaux d'une réflexion personnelle.",
  },
  {
    key: 'pdv_coherence',
    max: 1.5,
    labelFr: 'Point de vue — relier les éléments',
    anchor:
      "Peut relier une série d'éléments en un discours assez clair pour être suivi sans difficulté la plupart du temps.",
  },
  {
    key: 'lexique',
    max: 4,
    labelFr: 'Lexique (étendue et maîtrise)',
    anchor:
      "Possède un vocabulaire suffisant pour s'exprimer sur des sujets courants, si nécessaire à l'aide de périphrases ; des erreurs sérieuses se produisent encore sur une pensée plus complexe.",
  },
  {
    key: 'morphosyntaxe',
    max: 5,
    labelFr: 'Morphosyntaxe',
    anchor:
      "Maîtrise bien la structure de la phrase simple et les phrases complexes les plus courantes. Bon contrôle malgré de nettes influences de la langue maternelle.",
  },
  {
    key: 'phonologie',
    max: 3,
    labelFr: 'Maîtrise du système phonologique',
    anchor:
      "Peut s'exprimer sans aide malgré quelques problèmes de formulation et des pauses occasionnelles. Prononciation claire et intelligible malgré des erreurs ponctuelles.",
  },
];

const po = {
  DIMENSIONS: PO_DIMENSIONS,
  DIMENSION_KEYS: PO_DIMENSIONS.map((d) => d.key),
  TOTAL_MAX: PO_DIMENSIONS.reduce((s, d) => s + d.max, 0), // 25
  CORRECTION_TYPES: ['grammar', 'lexique', 'syntaxe', 'register'],
  // Word-count thresholds (STT transcript, monologue + answers combined).
  MIN_WORDS: 60,       // below this: recording failure / near-silence
  TARGET_WORDS: 350,   // point de vue (5-7 min) + réponses
  MAX_WORDS: 1200,
  // Recording length policy (seconds).
  MONOLOGUE_MAX_SEC: 7 * 60,       // point de vue: 5-7 min official
  FOLLOW_UP_MAX_SEC: 90,           // per-question answer cap
  PREP_DEFAULT_SEC: 10 * 60,       // official: 10 min prep (partie 3 only)
  PREP_PRACTICE_SEC: 5 * 60,       // shortened in PRACTICE mode
};

// ---- Server-only prompt fragments ----------------------------------------
const pePrompt = {
  persona:
    "Vous êtes un examinateur DELF B1 certifié par France Éducation International avec 10 ans d'expérience en correction de la Production Écrite. Vous notez selon la GRILLE OFFICIELLE B1 (25 points), sans clémence ni sévérité excessive. Au niveau B1, on attend un texte construit (essai, article, lettre) d'environ 160 mots exprimant une opinion personnelle sur un sujet familier — on n'exige PAS l'argumentation nuancée ni la richesse lexicale du B2.",
  // Few-shot calibration anchors pinned at B1 expectations. TODO: validate
  // against human-scored B1 copies before high-stakes use.
  anchors: `EXEMPLE — copie solide (18/25) :
  "Personnellement, je pense que les réseaux sociaux ont changé notre vie. D'abord, ils permettent de rester en contact avec la famille…"
  → consigne 2/2, faits 3/4, pensee 3/4, coherence 2.5/3, elaboration_phrases 1.5/2.

EXEMPLE — copie limite (12/25) :
  "C'est bien le sport. Moi je fais le foot avec mes amis c'est bon pour la santé."
  → pensee 2/4, coherence 1/3, lexique_etendue 1/2, temps_modes 0.5/2.`,
};

const poPrompt = {
  persona:
    "Vous êtes un examinateur DELF B1 certifié par France Éducation International, spécialisé dans la Production Orale (épreuve individuelle de 15 min environ : entretien dirigé, exercice en interaction, expression d'un point de vue après 10 min de préparation). Vous notez selon la GRILLE OFFICIELLE PO B1 (25 points), à partir d'une TRANSCRIPTION AUTOMATIQUE de l'enregistrement du candidat.",
  segmentContract: `La transcription est segmentée :
 - [EXPOSE] : expression d'un point de vue du candidat (Partie 3, 5-7 min après préparation)
 - [QUESTION 1] / [REPONSE 1] : question de l'examinateur et réponse du candidat
 - [QUESTION 2] / [REPONSE 2] : etc.
Les dimensions 'entretien_*' et 'interaction_*' s'évaluent UNIQUEMENT sur les segments [REPONSE i] (les questions tiennent lieu d'entretien dirigé et d'exercice en interaction).
Les dimensions 'pdv_*' s'évaluent sur le segment [EXPOSE].
Les dimensions 'lexique', 'morphosyntaxe' et 'phonologie' s'évaluent sur l'ensemble.`,
};

// ---- Exam-shape metadata --------------------------------------------------
// PE: one single writing task at B1 (essai ~160 mots).
const pePlan = { tasks: 1 };

// PO: monologue (point de vue) + jury questions — mirrors the B2 pipeline
// shape (one monologue part, one Q&A part); see the flow note at the top.
const poPlan = {
  parts: [
    { key: 'pointdevue', order: 0, hasMonologue: true,  monologueMaxSec: 420, prepSec: 600, followUpMaxSec: null },
    { key: 'echange',    order: 1, hasMonologue: false, monologueMaxSec: null, prepSec: 0,  followUpMaxSec: 90 },
  ],
  interactionParts: ['echange'], // feeds the entretien_*/interaction_* dimensions
  transcript: {
    partHeader: null,
    monologueMarker: '[EXPOSE]',
    followUpQuestion: (n, text) => `[QUESTION ${n}] ${text}`,
    followUpAnswer: (n) => `[REPONSE ${n}]`,
    missingAnswer: '(pas de réponse enregistrée)',
  },
};

// CO audio play rules. At B1 every document is played TWICE (unlike B2's
// single-play short clips); prep/gap timings are shorter than B2's.
const co = {
  playRules: {
    long:  { maxPlays: 2, prepSeconds: 30, gapSeconds: 60, answerSeconds: 0 },
    short: { maxPlays: 2, prepSeconds: 30, gapSeconds: 0,  answerSeconds: 0 },
    other: { maxPlays: 2, prepSeconds: 30, gapSeconds: 60, answerSeconds: 0 },
  },
  defaultFormat: 'long',
};

// Mock-exam section plan. No merged CE+PE block at B1 — each épreuve is its
// own timed section. Official: CO ~25 min, CE 45 min, PE 45 min, PO 15 min.
const sectionPlan = {
  order: ['CO', 'CE', 'PE', 'PO'],
  minutes: { CO: 25, CE: 45, PE: 45, PO: 15 },
  merges: [],
  poSeparateSession: true,
};

const guide = { collectiveTotalMin: 115, individualPrepMin: 10 };

module.exports = {
  key: 'B1',
  titlePrefix: 'DELF B1',
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
