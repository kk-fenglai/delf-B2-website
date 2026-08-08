// Prompt builder for DELF B2 question generation.
//
// Each skill returns { system, user } for an OpenAI-compatible chat call.
// The model is asked to return a COMPACT intermediate JSON (passages listed
// once + questions referencing a passageIndex). generate.js then expands it
// into the site's import format (passage repeated per question). This avoids
// making the model repeat a 2000-char transcript 9 times (token waste + drift).
//
// Design rules condensed from docs/DELF_B2_出题指南.md §2. Keep the system
// message stable per skill so DeepSeek caches the prompt prefix across calls.

const COMMON_RULES = `Tu es un concepteur expert d'épreuves DELF B2 (France Éducation International, format rénové depuis 2020 : 100% QCM, plus de questions ouvertes).
Règles impératives :
- Niveau B2 : thèmes abstraits/de société, argumentation, sens implicite, ton, point de vue.
- ORIGINALITÉ TOTALE : invente un texte et des questions entièrement nouveaux. N'imite JAMAIS un sujet réel existant mot pour mot.
- Français naturel et correct.
- Distracteurs plausibles : "partiellement vrai", "piège par synonyme", "vrai mais hors sujet". Les 3 options ont une longueur comparable. Exactement UNE bonne réponse.
- Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans balises markdown.`;

const THEMES_HINT =
  "Thèmes possibles : environnement, travail, éducation, technologie/numérique, santé, médias, consommation, ville et transports, culture, voyage, alimentation, sciences.";

function coUser(theme) {
  return `Crée un exercice de COMPRÉHENSION ORALE DELF B2 (format rénové) sur le thème « ${theme} ».
Structure : 1 long document (interview/chronique radio, ~450-650 mots, 2 locuteurs possibles) + 6 questions QCM (3 options A/B/C).
Couvre : sens global/intention, information précise, attitude/ton implicite, relation logique.
Barème : points par question pour un total d'environ 25 (ex. 9 questions impossibles ici donc adapte : 6 questions, mets points 2 ou 3 chacune pour ~25... en réalité vise total ≈ 25).

Renvoie EXACTEMENT ce JSON :
{
  "title": "DELF B2 Compréhension de l’oral · <titre court du thème en français>",
  "description": "AI 原创模拟听力（DELF B2 format rénové），需人工复核。",
  "passages": ["<transcription complète du document audio>"],
  "questions": [
    { "passageIndex": 0, "prompt": "<question en français>", "points": 4,
      "options": [
        { "label": "A", "text": "...", "isCorrect": false },
        { "label": "B", "text": "...", "isCorrect": true },
        { "label": "C", "text": "...", "isCorrect": false }
      ],
      "explanation": "Réponse : B" }
  ]
}
Mets 6 questions. La somme des "points" doit faire 25 (ex. 5×4 + 1×5, ou 1×3 + ... vise 25). ${THEMES_HINT}`;
}

function ceUser(theme) {
  return `Crée un exercice de COMPRÉHENSION DES ÉCRITS DELF B2 (format rénové) sur le thème « ${theme} ».
Structure : 1 article de presse argumentatif original (~550-800 mots, avec une position d'auteur claire) + 7 questions QCM (3 options).
Couvre : idée principale/intention de l'auteur, repérage d'arguments, sens implicite, sens d'un mot en contexte, ton/position.
Barème : somme des "points" = 25.

Renvoie EXACTEMENT ce JSON :
{
  "title": "DELF B2 Compréhension des écrits · <titre court du thème en français>",
  "description": "AI 原创模拟阅读（DELF B2 format rénové），需人工复核。",
  "passages": ["<texte intégral de l'article>"],
  "questions": [
    { "passageIndex": 0, "prompt": "<question>", "points": 4,
      "options": [
        { "label": "A", "text": "...", "isCorrect": true },
        { "label": "B", "text": "...", "isCorrect": false },
        { "label": "C", "text": "...", "isCorrect": false }
      ],
      "explanation": "Réponse : A" }
  ]
}
Mets 7 questions. La somme des "points" doit faire 25. ${THEMES_HINT}`;
}

function peUser(theme) {
  return `Crée un sujet de PRODUCTION ÉCRITE DELF B2 sur le thème « ${theme} », avec une copie modèle.
Le sujet : une situation + une tâche argumentative (lettre formelle / contribution à un forum / article / lettre de réaction), ~250 mots demandés.
La copie modèle : ~250 mots, niveau B2, structurée (intro-arguments-conclusion), connecteurs logiques, langue correcte.

Renvoie EXACTEMENT ce JSON :
{
  "title": "DELF B2 Production écrite · <titre court du thème>",
  "description": "AI 原创模拟写作，含参考范文，需人工复核。",
  "prompt": "<consigne en français : situation + tâche, ~250 mots>",
  "modelEssay": "<copie modèle d'environ 250 mots en français>"
}
${THEMES_HINT}`;
}

function poUser(theme) {
  return `Crée un sujet de PRODUCTION ORALE DELF B2 sur le thème « ${theme} ».
Un court document déclencheur (~10 lignes, 120-180 mots) posant un problème de société débattable + 4 questions de relance d'examinateur, chacune avec un "expectedAngle" en chinois (axe d'évaluation, non montré au candidat).

Renvoie EXACTEMENT ce JSON :
{
  "title": "DELF B2 Production orale · <titre court du thème>",
  "description": "AI 原创口语主题卡，relances 由平台生成，需人工复核。",
  "stimulus": "<document déclencheur, ~10 lignes>",
  "followUps": [
    { "text": "<question de relance en français>", "expectedAngle": "<中文评分方向>" }
  ]
}
Mets 4 relances. ${THEMES_HINT}`;
}

function coShortUser(theme) {
  return `Crée l'EXERCICE 3 de compréhension orale DELF B2 : 3 courts documents audio indépendants (flash info, micro-trottoir, annonce/communiqué), ~80-150 mots chacun, sur des sujets variés autour du thème général « ${theme} ». Chaque document est entendu UNE seule fois.
Pour chaque document : 2 questions QCM (3 options A/B/C). Total 6 questions.

Renvoie EXACTEMENT ce JSON :
{
  "title": "DELF B2 Compréhension de l’oral · <thème>",
  "description": "Exercice 3 — 3 documents courts.",
  "passages": ["<transcription doc 1>", "<transcription doc 2>", "<transcription doc 3>"],
  "questions": [
    { "passageIndex": 0, "prompt": "<question>", "points": 2,
      "options": [
        { "label": "A", "text": "...", "isCorrect": true },
        { "label": "B", "text": "...", "isCorrect": false },
        { "label": "C", "text": "...", "isCorrect": false }
      ],
      "explanation": "Réponse : A" }
  ]
}
2 questions par document (passageIndex 0, 0, 1, 1, 2, 2). ${THEMES_HINT}`;
}

const USER_BUILDERS = { CO: coUser, CO_SHORT: coShortUser, CE: ceUser, PE: peUser, PO: poUser };

function buildPrompt(skill, theme) {
  const build = USER_BUILDERS[skill];
  if (!build) throw new Error(`Unknown skill: ${skill}`);
  return { system: COMMON_RULES, user: build(theme) };
}

module.exports = { buildPrompt };
