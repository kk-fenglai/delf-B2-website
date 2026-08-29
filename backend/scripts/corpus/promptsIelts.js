// Prompt builder for IELTS Academic question generation (English).
//
// Same contract as prompts.js: each skill returns { system, user } for an
// OpenAI-compatible chat call, model returns compact JSON, generateIelts.js
// expands it into the site's import format (with system/level fields).
//
// Practice-set sizes mirror one real section/passage, 1 point per question
// (the frontend scales raw → /40 → band for display):
//   LISTENING  = 1 Part-2-style monologue (~450-600 words) + 10 questions
//   READING    = 1 academic passage (~700-900 words) + 13 questions
//   WRITING_T1 = Task 1 (data described in text — no image dependency)
//   WRITING_T2 = Task 2 essay
//   SPEAKING   = Part 2 cue card + Part 1/3 questions as follow-ups

const COMMON_RULES = `You are an expert IELTS Academic item writer with deep knowledge of Cambridge IELTS conventions.
Hard rules:
- TOTAL ORIGINALITY: invent completely new passages and questions. NEVER imitate a real past paper word for word.
- Natural, idiomatic English at an academic register appropriate to IELTS.
- Distractors must be plausible: "partially true", "synonym trap", "true but not what's asked". Options of comparable length. Exactly ONE correct answer per question.
- For True/False/Not Given: Not Given means the passage simply does not state it — craft at least one genuine Not Given item.
- For completion/short-answer items: the answer must be 1-3 words taken EXACTLY from the passage/recording; list acceptable variants.
- Reply with ONLY a valid JSON object — no surrounding text, no markdown fences.`;

const THEMES_HINT =
  'Possible topics: environment, urban planning, education, technology, health, media, work and careers, consumer behaviour, transport, culture, travel, science and research, history of everyday things.';

function listeningUser(theme) {
  return `Create one IELTS Academic LISTENING practice section on the theme "${theme}".
Structure: a Part-2-style monologue by ONE speaker (a guide, organiser or presenter giving practical information; 450-600 words) + 10 questions:
- Questions 1-6: sentence/note completion (type COMPLETION, answer = 1-3 words from the recording).
- Questions 7-10: multiple choice (type SINGLE, 3 options A/B/C).

Return EXACTLY this JSON:
{
  "title": "IELTS 听力 · <short English topic title>",
  "passages": ["<full transcript of the monologue>"],
  "questions": [
    { "passageIndex": 0, "type": "COMPLETION", "prompt": "<sentence with a gap shown as ______>",
      "answers": ["<exact answer>", "<acceptable variant>"],
      "explanation": "<one-line justification quoting the transcript>" },
    { "passageIndex": 0, "type": "SINGLE", "prompt": "<question>",
      "options": [
        { "label": "A", "text": "...", "isCorrect": false },
        { "label": "B", "text": "...", "isCorrect": true },
        { "label": "C", "text": "...", "isCorrect": false }
      ],
      "explanation": "Answer: B — <one-line justification>" }
  ]
}
Give 10 questions in recording order (6 COMPLETION then 4 SINGLE). ${THEMES_HINT}`;
}

function readingUser(theme) {
  return `Create one IELTS Academic READING practice passage on the theme "${theme}".
Structure: one academic passage (700-900 words, informative/argumentative, in the style of New Scientist or an undergraduate textbook) + 13 questions:
- Questions 1-5: True/False/Not Given (type TFNG) — include at least one genuine Not Given.
- Questions 6-9: multiple choice (type SINGLE, 3 options A/B/C).
- Questions 10-13: summary/sentence completion (type COMPLETION, answer = 1-3 words from the passage).

Return EXACTLY this JSON:
{
  "title": "IELTS 阅读 · <short English topic title>",
  "passages": ["<full passage text>"],
  "questions": [
    { "passageIndex": 0, "type": "TFNG", "prompt": "<statement>", "answer": "TRUE|FALSE|NOT GIVEN",
      "explanation": "<one-line justification>" },
    { "passageIndex": 0, "type": "SINGLE", "prompt": "<question>",
      "options": [ { "label": "A", "text": "...", "isCorrect": true }, { "label": "B", "text": "...", "isCorrect": false }, { "label": "C", "text": "...", "isCorrect": false } ],
      "explanation": "Answer: A — <one-line justification>" },
    { "passageIndex": 0, "type": "COMPLETION", "prompt": "<sentence with a gap shown as ______>",
      "answers": ["<exact answer>"],
      "explanation": "<one-line justification>" }
  ]
}
Give 13 questions in passage order (5 TFNG, 4 SINGLE, 4 COMPLETION). ${THEMES_HINT}`;
}

function writingT1User(theme) {
  return `Create one IELTS Academic WRITING Task 1 prompt on the theme "${theme}", with a model answer.
Because no image can be shown, the data must be fully described IN TEXT as a simple table or clearly enumerated figures inside the prompt (e.g. "The table below shows ... | 2000: 45% | 2010: 62% | 2020: 71% ..."). Two or three data series, enough for comparison and an overview.
Model answer: 160-190 words, band-8 quality, with a clear overview paragraph.

Return EXACTLY this JSON:
{
  "title": "IELTS 写作 · Task 1 <short English topic title>",
  "prompt": "<full Task 1 instruction including the text-described data. End with: 'Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.'>",
  "modelEssay": "<model answer, 160-190 words>"
}
${THEMES_HINT}`;
}

function writingT2User(theme) {
  return `Create one IELTS Academic WRITING Task 2 prompt on the theme "${theme}", with a model answer.
The prompt: a debatable statement + one of the standard instructions (discuss both views / agree or disagree / advantages and disadvantages / problem and solution). End with: "Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words."
Model answer: 270-300 words, band-8 quality, clear position, one main idea per body paragraph.

Return EXACTLY this JSON:
{
  "title": "IELTS 写作 · Task 2 <short English topic title>",
  "prompt": "<full Task 2 instruction>",
  "modelEssay": "<model answer, 270-300 words>"
}
${THEMES_HINT}`;
}

function speakingUser(theme) {
  return `Create one IELTS SPEAKING practice set on the theme "${theme}".
Structure:
- A Part 2 cue card: "Describe ..." + "You should say:" + 4 bullet points.
- 2 Part 1 warm-up questions (everyday, easy) and 3 Part 3 discussion questions (abstract, linked to the cue-card topic).
Each question gets an "expectedAngle" note in Chinese (evaluation focus, never shown to the candidate).

Return EXACTLY this JSON:
{
  "title": "IELTS 口语 · <short English topic title>",
  "cueCard": "<full Part 2 cue card text with the four bullets>",
  "followUps": [
    { "part": 1, "text": "<Part 1 question>", "expectedAngle": "<中文评分方向>" },
    { "part": 3, "text": "<Part 3 question>", "expectedAngle": "<中文评分方向>" }
  ]
}
Give 5 followUps total (2 with "part": 1 first, then 3 with "part": 3). ${THEMES_HINT}`;
}

const USER_BUILDERS = {
  LISTENING: listeningUser,
  READING: readingUser,
  WRITING_T1: writingT1User,
  WRITING_T2: writingT2User,
  SPEAKING: speakingUser,
};

function buildPrompt(skill, theme) {
  const build = USER_BUILDERS[skill];
  if (!build) throw new Error(`Unknown IELTS skill: ${skill}`);
  return { system: COMMON_RULES, user: build(theme) };
}

module.exports = { buildPrompt, SKILLS: Object.keys(USER_BUILDERS) };
