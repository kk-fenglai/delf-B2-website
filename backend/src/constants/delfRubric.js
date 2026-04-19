// DELF B2 Production Écrite — official grille d'évaluation (France Éducation
// International). 10 dimensions summing to 25 points. Single source of truth —
// imported by aiGrader (for prompt), echoed back in API responses so the
// frontend doesn't hardcode scale or labels.

const DIMENSIONS = [
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

const DIMENSION_KEYS = DIMENSIONS.map((d) => d.key);
const TOTAL_MAX = DIMENSIONS.reduce((s, d) => s + d.max, 0); // 25

// Colour-code categories for inline annotations on the frontend.
const CORRECTION_TYPES = ['grammar', 'lexique', 'orthographe', 'syntaxe'];

// Word-count policy for DELF B2 PE (official: "~250 words").
const MIN_WORDS = 50;     // below this we refuse to call the AI
const TARGET_WORDS = 250;
const MAX_WORDS = 800;    // above this we warn but still grade

module.exports = {
  DIMENSIONS,
  DIMENSION_KEYS,
  TOTAL_MAX,
  CORRECTION_TYPES,
  MIN_WORDS,
  TARGET_WORDS,
  MAX_WORDS,
};
