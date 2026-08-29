// IELTS Academic level config (M3 objective + M4 AI grading).
// Same export contract shape as constants/levels/b2.js where consumed by the
// shared graders/queues; IELTS-specific parts (bands, fullPrompt overrides)
// are additive. See docs/2026-08-29_雅思IELTS接入PRD.md.

// Raw score (out of 40) → band, published-equivalent thresholds. Ordered
// descending; first entry whose `min` ≤ raw wins. Listening and Academic
// Reading use different tables.
const LISTENING_BANDS = [
  { min: 39, band: 9 }, { min: 37, band: 8.5 }, { min: 35, band: 8 },
  { min: 32, band: 7.5 }, { min: 30, band: 7 }, { min: 26, band: 6.5 },
  { min: 23, band: 6 }, { min: 18, band: 5.5 }, { min: 16, band: 5 },
  { min: 13, band: 4.5 }, { min: 10, band: 4 }, { min: 8, band: 3.5 },
  { min: 6, band: 3 }, { min: 4, band: 2.5 }, { min: 0, band: 2 },
];
const READING_BANDS = [
  { min: 39, band: 9 }, { min: 37, band: 8.5 }, { min: 35, band: 8 },
  { min: 33, band: 7.5 }, { min: 30, band: 7 }, { min: 27, band: 6.5 },
  { min: 23, band: 6 }, { min: 19, band: 5.5 }, { min: 15, band: 5 },
  { min: 13, band: 4.5 }, { min: 10, band: 4 }, { min: 8, band: 3.5 },
  { min: 6, band: 3 }, { min: 4, band: 2.5 }, { min: 0, band: 2 },
];

// IELTS band aggregation: criteria are equally weighted → mean, rounded to
// the nearest 0.5 with quarters rounding UP (6.25→6.5, 6.75→7 — official rule).
function bandAggregate(dimensions) {
  if (!dimensions.length) return 0;
  const mean = dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length;
  return Math.round(mean * 2) / 2;
}

// ---- PE (Writing) ---------------------------------------------------------
// Four official criteria, each banded 0-9. aiScore = bandAggregate(mean).
// Task 1 and Task 2 are separate ESSAY questions, each graded on its own.
const PE_DIMENSIONS = [
  {
    key: 'task_achievement',
    max: 9,
    labelFr: 'Task Achievement / Response',
    anchor:
      'Does the response fully address all parts of the task? Task 1: are the key features of the visual input accurately selected, compared and summarised with an overview? Task 2: is a clear position developed with relevant, extended and well-supported ideas?',
  },
  {
    key: 'coherence_cohesion',
    max: 9,
    labelFr: 'Coherence and Cohesion',
    anchor:
      'Is information logically organised with clear progression? Are cohesive devices (linkers, referencing, substitution) used flexibly and accurately, without being mechanical? Is paragraphing appropriate and logical?',
  },
  {
    key: 'lexical_resource',
    max: 9,
    labelFr: 'Lexical Resource',
    anchor:
      'Is the range of vocabulary sufficient and precise? Are less common items and collocations used with flexibility? How frequent are errors in word choice, word formation and spelling, and do they impede communication?',
  },
  {
    key: 'grammatical_range_accuracy',
    max: 9,
    labelFr: 'Grammatical Range and Accuracy',
    anchor:
      'Is a wide range of structures (complex sentences, conditionals, passives, modality) used flexibly? What proportion of sentences are error-free, and do errors reduce clarity?',
  },
];

const pe = {
  DIMENSIONS: PE_DIMENSIONS,
  DIMENSION_KEYS: PE_DIMENSIONS.map((d) => d.key),
  TOTAL_MAX: 9, // band scale — aggregate is a MEAN, not a sum
  // Floor low enough to accept a Task 1 answer (official minimum 150 words);
  // Task 2 minimum (250) is stated in the prompt, not hard-enforced here.
  MIN_WORDS: 120,
  TARGET_WORDS: 250,
  MAX_WORDS: 600,
  // Internal correction-type enum shared with DELF so the frontend tag
  // rendering keeps working; meanings: grammar | lexique=vocabulary |
  // orthographe=spelling | syntaxe=syntax.
  CORRECTION_TYPES: ['grammar', 'lexique', 'orthographe', 'syntaxe'],
  aggregateScore: bandAggregate,
};

const PE_RUBRIC_BLOCK = PE_DIMENSIONS.map(
  (d) => `  - ${d.key} (band 0-9) — ${d.labelFr}\n      Criterion: ${d.anchor}`
).join('\n');

const pePrompt = {
  persona:
    'You are a certified IELTS examiner with 10+ years of experience marking Academic Writing. You apply the official public band descriptors rigorously and calibrate against known benchmark scripts.',
  anchors: `CALIBRATION ANCHORS (public band descriptors, abridged):
 - Band 5: partially addresses the task; limited range of vocabulary and structures; errors frequent and sometimes impede meaning; mechanical or faulty cohesion.
 - Band 6: addresses the task though some parts may be underdeveloped; adequate range with some inaccuracy; cohesion generally effective but may be mechanical; errors rarely impede communication.
 - Band 7: covers the requirements of the task; clear progression throughout; flexible use of less common vocabulary; frequent error-free sentences; good control with occasional slips.
 - Band 8: fully covers the task with well-developed ideas; wide range used fluently; the majority of sentences are error-free; cohesion used skilfully and unobtrusively.`,
  // Complete English system prompt — used INSTEAD of the shared French
  // skeleton (aiGrader falls back to buildSystemPrompt(lvl) when absent).
  get fullPrompt() {
    return `${pePrompt.persona}

ASSESSMENT CRITERIA — ${PE_DIMENSIONS.length} criteria, each banded 0-9 (half bands allowed):
${PE_RUBRIC_BLOCK}

MARKING PROTOCOL:
 1. Read the whole script before assigning any band.
 2. Band each criterion independently against the descriptors above.
 3. Half bands (5.5, 6.5, 7.5…) are allowed; never exceed 9.
 4. If the response is clearly under-length or off-topic, cap task_achievement accordingly.
 5. For corrections: quote EXACTLY (≤ 10 words) from the original script, no rewording.
 6. Correction type must be one of: grammar (grammar) | lexique (vocabulary/collocation) | orthographe (spelling) | syntaxe (syntax/word order).

FORBIDDEN:
 - Do not paraphrase the descriptors in your feedback.
 - Do not exceed band 9 on any criterion.
 - Do not invent quotations that are not in the script.
 - Do not compute an overall band — the system aggregates it.

${pePrompt.anchors}

The user will request ONE of three focused tasks (scoring, corrections, or summary). Focus ONLY on the requested task and call the corresponding tool exactly once.`;
  },
  taskHints: {
    scores: `TASK: band all ${PE_DIMENSIONS.length} criteria. Each 'feedback' field must be BRIEF (≤ 25 words). Call submit_scores exactly once.`,
    corrections: "TASK: identify 3 to 8 precise language errors. 'excerpt' must quote EXACTLY (≤10 words) from the script. Call submit_corrections exactly once.",
    summary: "TASK: 'strengths' = 2-4 concrete strengths (≤15 words each). 'globalFeedback' = priorities and advice for a higher band (80-150 words) — do NOT repeat the strengths, no headings. Call submit_summary exactly once.",
  },
  toolDescriptions: {
    scores: `Submit bands for the ${PE_DIMENSIONS.length} IELTS Academic Writing criteria. Brief feedback (≤ 25 words per criterion).`,
    corrections: 'Submit 3-8 concrete corrections: exact quotation (≤10 words), the issue, a suggestion, and the type.',
    summary: 'Submit 2-4 concrete strengths and global feedback (80-150 words, strengths → priorities for a higher band).',
  },
};

// ---- PO (Speaking) --------------------------------------------------------
// Three of the four official criteria: pronunciation CANNOT be assessed from
// an ASR transcript, so it is excluded and the band is the mean of the other
// three (stated to the learner in the guide/UI copy).
const PO_DIMENSIONS = [
  {
    key: 'fluency_coherence',
    max: 9,
    labelFr: 'Fluency and Coherence',
    anchor:
      'Does the candidate speak at length without noticeable effort or loss of coherence? Are ideas logically connected with flexible discourse markers? Judge hesitation ONLY from textual evidence (false starts, abandoned clauses), never from ASR artefacts.',
  },
  {
    key: 'lexical_resource',
    max: 9,
    labelFr: 'Lexical Resource',
    anchor:
      'Is vocabulary varied and precise for both familiar and abstract topics? Are idiomatic expressions and collocations used naturally? Is paraphrase used effectively when needed?',
  },
  {
    key: 'grammatical_range_accuracy',
    max: 9,
    labelFr: 'Grammatical Range and Accuracy',
    anchor:
      'Is a range of complex structures attempted and how accurately? What proportion of utterances are error-free? Spoken ellipsis and informal register are acceptable — do not penalise them.',
  },
];

const po = {
  DIMENSIONS: PO_DIMENSIONS,
  DIMENSION_KEYS: PO_DIMENSIONS.map((d) => d.key),
  TOTAL_MAX: 9, // band scale — aggregate is a MEAN, not a sum
  MIN_WORDS: 60,
  TARGET_WORDS: 300,
  MAX_WORDS: 1500,
  MONOLOGUE_MAX_SEC: 2 * 60,   // Part 2 talk: 1-2 minutes
  FOLLOW_UP_MAX_SEC: 60,       // Part 1 / Part 3 answers
  PREP_DEFAULT_SEC: 60,        // Part 2 cue-card prep: exactly 1 minute
  PREP_PRACTICE_SEC: 60,
  CORRECTION_TYPES: ['grammar', 'lexique', 'orthographe', 'syntaxe'],
  aggregateScore: bandAggregate,
};

const PO_RUBRIC_BLOCK = PO_DIMENSIONS.map(
  (d) => `  - ${d.key} (band 0-9) — ${d.labelFr}\n      Criterion: ${d.anchor}`
).join('\n');

const poPrompt = {
  persona:
    'You are a certified IELTS examiner with 10+ years of experience assessing the Speaking test. You apply the official public band descriptors rigorously. You are marking from an ASR transcript.',
  segmentContract: `TRANSCRIPT SEGMENTS:
 - [PART 2 — CUE CARD] : the candidate's long turn (assess sustained speech here).
 - [QUESTION n] / [ANSWER n] : Part 1 / Part 3 interview questions and the candidate's answers.
Assess ALL criteria over the whole transcript; weigh the long turn and the discussion answers together.`,
  get fullPrompt() {
    return `${poPrompt.persona}

ASSESSMENT CRITERIA — ${PO_DIMENSIONS.length} criteria, each banded 0-9 (half bands allowed):
${PO_RUBRIC_BLOCK}

NATURE OF THE INPUT — IMPORTANT:
The transcript comes from an ASR system. It may contain:
 - missed / misrecognised words (do NOT penalise the candidate for obvious ASR errors);
 - spoken disfluencies (er, um, you know…) which are normal in speech and only affect fluency if they dominate;
 - reconstructed punctuation — never judge spelling or pronunciation. Pronunciation is NOT assessed from a transcript and is NOT one of your criteria.

${poPrompt.segmentContract}

MARKING PROTOCOL:
 1. Read the whole transcript before assigning any band.
 2. Band each criterion independently against the descriptors above.
 3. Half bands (5.5, 6.5, 7.5…) are allowed; never exceed 9.
 4. For corrections: quote EXACTLY (≤ 10 words) from the transcript, no rewording. Target clear lexical / grammatical errors; ignore disfluencies and ASR artefacts.
 5. Correction type must be one of: grammar | lexique (vocabulary) | orthographe (spelling — transcript artefacts only, use sparingly) | syntaxe (syntax).

FORBIDDEN:
 - Do not paraphrase the descriptors in your feedback.
 - Do not exceed band 9 on any criterion.
 - Do not invent quotations that are not in the transcript.
 - Do not compute an overall band — the system aggregates it.
 - Do not penalise minor spoken disfluencies (double penalty with fluency_coherence).

The user will request ONE of three focused tasks (scoring, corrections, or summary). Focus ONLY on the requested task and call the corresponding tool exactly once.`;
  },
  taskHints: {
    scores: `TASK: band all ${PO_DIMENSIONS.length} criteria. Each 'feedback' field must be BRIEF (≤ 25 words). Call submit_scores exactly once.`,
    corrections: "TASK: identify 3 to 8 precise language errors from the transcript. 'excerpt' must quote EXACTLY (≤10 words). Ignore disfluencies. Call submit_corrections exactly once.",
    summary: "TASK: 'strengths' = 2-4 concrete strengths (≤15 words each). 'globalFeedback' = priorities and advice for a higher band (80-150 words) — do NOT repeat the strengths, no headings. Call submit_summary exactly once.",
  },
  toolDescriptions: {
    scores: `Submit bands for the ${PO_DIMENSIONS.length} IELTS Speaking criteria (pronunciation excluded — transcript input). Brief feedback (≤ 25 words per criterion).`,
    corrections: 'Submit 3-8 concrete corrections from the transcript: exact quotation (≤10 words), the issue, a suggestion, and the type. Ignore disfluencies.',
    summary: 'Submit 2-4 concrete strengths and global feedback (80-150 words, strengths → priorities for a higher band).',
  },
};

// ---- Exam-shape metadata --------------------------------------------------
// PE: Task 1 and Task 2 are authored as separate ESSAY questions → tasks: 1
// per submission (each graded to its own band).
const pePlan = { tasks: 1 };

// PO: Part 2 cue card maps to the existing monologue slot (1 min prep,
// 1-2 min talk); Part 1 + Part 3 interview questions map to follow-ups —
// the same approximation already used for A2/B1's three-part oral.
const poPlan = {
  parts: [
    { key: 'cueCard',    order: 0, hasMonologue: true,  monologueMaxSec: 120, prepSec: 60, followUpMaxSec: null },
    { key: 'discussion', order: 1, hasMonologue: false, monologueMaxSec: null, prepSec: 0,  followUpMaxSec: 60 },
  ],
  interactionParts: ['discussion'],
  transcript: {
    partHeader: null,
    monologueMarker: '[PART 2 — CUE CARD]',
    followUpQuestion: (n, text) => `[QUESTION ${n}] ${text}`,
    followUpAnswer: (n) => `[ANSWER ${n}]`,
    missingAnswer: '(no recorded answer)',
  },
};

module.exports = {
  key: 'IELTS_AC',
  titlePrefix: 'IELTS',
  // L/R/W run back-to-back on test day; Speaking is a separate appointment
  // (same "individual épreuve" pattern as DELF PO).
  sectionPlan: {
    order: ['LISTENING', 'READING', 'WRITING'],
    minutes: { LISTENING: 30, READING: 60, WRITING: 60 },
    merges: [],
  },
  // IELTS listening plays ONCE, recordings run without prep/gap pauses.
  // Same shape as DELF co so the shared import path works unchanged.
  co: {
    playRules: {
      long:  { maxPlays: 1, prepSeconds: 0, gapSeconds: 0, answerSeconds: 0 },
      short: { maxPlays: 1, prepSeconds: 0, gapSeconds: 0, answerSeconds: 0 },
      other: { maxPlays: 1, prepSeconds: 0, gapSeconds: 0, answerSeconds: 0 },
    },
    defaultFormat: 'other',
  },
  bands: { LISTENING: LISTENING_BANDS, READING: READING_BANDS },
  pe,
  pePrompt,
  pePlan,
  po,
  poPrompt,
  poPlan,
};
