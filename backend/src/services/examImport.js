const crypto = require('crypto');
const { z } = require('zod');
const { sanitizeExamTitle, sanitizeExamDescription } = require('../utils/examTitle');
const { resolveExamSetYear } = require('../utils/examSetYear');

const VALID_SKILLS = ['CO', 'CE', 'PE', 'PO'];
const VALID_TYPES = ['SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'TRUE_FALSE_JUSTIFY', 'FILL', 'ESSAY', 'SPEAKING'];
const USER_SKILLS = ['CE', 'PE', 'CO', 'PO'];

const optionSchema = z.object({
  label: z.string().min(1).max(4),
  text: z.string().min(1),
  isCorrect: z.boolean().default(false),
  order: z.number().int().default(0),
});

const followUpSchema = z.object({
  order: z.number().int().min(0).default(0),
  text: z.string().min(1).max(500),
  audioUrl: z.string().optional().nullable(),
  expectedAngle: z.string().max(500).optional().nullable(),
});

const questionSchema = z.object({
  skill: z.enum(VALID_SKILLS),
  type: z.enum(VALID_TYPES),
  order: z.number().int().default(0),
  prompt: z.string().min(1),
  passage: z.string().optional().nullable(),
  audioUrl: z.string().optional().nullable(),
  audioDocumentId: z.string().optional().nullable(),
  explanation: z.string().optional().nullable(),
  modelEssay: z.string().optional().nullable(),
  points: z.number().int().min(1).max(25).default(1),
  options: z.array(optionSchema).default([]),
  followUps: z.array(followUpSchema).default([]),
});

const examSetSchema = z.object({
  title: z.string().min(1).max(200),
  year: z.number().int().min(2000).max(2100).optional().nullable(),
  description: z.string().optional().nullable(),
  isPublished: z.boolean().default(false),
  isFreePreview: z.boolean().default(false),
  // CO 听力分类覆盖：long | short | other（为空=按标题自动判定）
  coFormat: z.enum(['long', 'short', 'other']).optional().nullable(),
});

const bulkImportSchema = examSetSchema.extend({
  questions: z.array(questionSchema).min(1),
});

function validateQuestionShape(q) {
  const correctCount = q.options.filter((o) => o.isCorrect).length;
  if (q.type === 'SINGLE' || q.type === 'TRUE_FALSE' || q.type === 'TRUE_FALSE_JUSTIFY') {
    if (q.options.length < 2) return 'SINGLE/TRUE_FALSE/TRUE_FALSE_JUSTIFY needs ≥2 options';
    if (correctCount !== 1) return 'SINGLE/TRUE_FALSE/TRUE_FALSE_JUSTIFY needs exactly 1 correct option';
  }
  if (q.type === 'MULTIPLE') {
    if (q.options.length < 2) return 'MULTIPLE needs ≥2 options';
    if (correctCount < 1) return 'MULTIPLE needs ≥1 correct option';
  }
  if ((q.type === 'FILL' || q.type === 'ESSAY' || q.type === 'SPEAKING') && q.options.length > 0) {
    return `${q.type} must not have options`;
  }
  if (q.type === 'SPEAKING') {
    if (q.skill !== 'PO') return 'SPEAKING questions must have skill = PO';
    if (!q.followUps || q.followUps.length < 1) return 'SPEAKING needs ≥1 follow-up';
    if (q.followUps.length > 6) return 'SPEAKING accepts at most 6 follow-ups';
  }
  if (q.type !== 'SPEAKING' && q.followUps && q.followUps.length > 0) {
    return 'follow-ups are only allowed on SPEAKING questions';
  }
  return null;
}

/** Validate a user-owned question for CE / PE / CO / PO sets. */
function validateUserQuestion(q, primarySkill) {
  const parsed = questionSchema.safeParse(q);
  if (!parsed.success) return parsed.error.issues[0]?.message || 'Invalid question';
  const data = parsed.data;
  if (data.skill !== primarySkill) return `Question skill must be ${primarySkill}`;
  if (primarySkill === 'CE' && !['SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'TRUE_FALSE_JUSTIFY'].includes(data.type)) {
    return 'CE questions must be SINGLE, MULTIPLE, TRUE_FALSE, or TRUE_FALSE_JUSTIFY';
  }
  if (primarySkill === 'PE' && data.type !== 'ESSAY') {
    return 'PE questions must be type ESSAY';
  }
  if (primarySkill === 'CO' && !['SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'FILL'].includes(data.type)) {
    return 'CO questions must be SINGLE, MULTIPLE, TRUE_FALSE, or FILL';
  }
  if (primarySkill === 'PO' && data.type !== 'SPEAKING') {
    return 'PO questions must be type SPEAKING';
  }
  return validateQuestionShape(data) || null;
}

async function bulkCreateQuestions(tx, setId, questions) {
  const coAudioDocId = new Map();
  const audioDocRows = [];
  for (const q of questions) {
    if (q.skill === 'CO' && q.audioUrl && !coAudioDocId.has(q.audioUrl)) {
      const docId = crypto.randomUUID();
      coAudioDocId.set(q.audioUrl, docId);
      audioDocRows.push({
        id: docId,
        examSetId: setId,
        order: audioDocRows.length,
        title: `Document ${audioDocRows.length + 1}`,
        audioUrl: q.audioUrl,
        maxPlays: 2, prepSeconds: 60, gapSeconds: 180, answerSeconds: 0,
      });
    }
  }

  const questionRows = [];
  const optionRows = [];
  const followUpRows = [];
  questions.forEach((q, i) => {
    const qid = crypto.randomUUID();
    questionRows.push({
      id: qid,
      examSetId: setId,
      skill: q.skill,
      type: q.type,
      order: q.order || i + 1,
      prompt: q.prompt,
      passage: q.passage || null,
      audioUrl: q.audioUrl || null,
      audioDocumentId: q.skill === 'CO' && q.audioUrl ? coAudioDocId.get(q.audioUrl) : null,
      explanation: q.explanation || null,
      modelEssay: q.modelEssay || null,
      points: q.points,
    });
    q.options.forEach((o, j) => optionRows.push({
      questionId: qid,
      label: o.label,
      text: o.text,
      isCorrect: o.isCorrect,
      order: o.order || j,
    }));
    (q.followUps || []).forEach((f, j) => followUpRows.push({
      questionId: qid,
      order: f.order || j,
      text: f.text,
      audioUrl: f.audioUrl || null,
      expectedAngle: f.expectedAngle || null,
    }));
  });

  if (audioDocRows.length) await tx.audioDocument.createMany({ data: audioDocRows });
  await tx.question.createMany({ data: questionRows });
  if (optionRows.length) await tx.questionOption.createMany({ data: optionRows });
  if (followUpRows.length) await tx.oralFollowUp.createMany({ data: followUpRows });
}

async function createExamSetWithQuestions(tx, {
  title,
  description,
  year,
  isPublished,
  isFreePreview,
  ownerUserId,
  source,
  primarySkill,
  questions,
}) {
  const skills = [...new Set(questions.map((q) => q.skill))];
  const set = await tx.examSet.create({
    data: {
      title: sanitizeExamTitle(title),
      year: resolveExamSetYear({ title, year, skills }),
      description: description != null ? sanitizeExamDescription(description) : (description || null),
      isPublished: !!isPublished,
      isFreePreview: !!isFreePreview,
      ownerUserId: ownerUserId || null,
      source: source || 'PLATFORM',
      primarySkill: primarySkill || null,
    },
  });
  await bulkCreateQuestions(tx, set.id, questions);
  return set;
}

module.exports = {
  VALID_SKILLS,
  VALID_TYPES,
  USER_SKILLS,
  optionSchema,
  followUpSchema,
  questionSchema,
  examSetSchema,
  bulkImportSchema,
  validateQuestionShape,
  validateUserQuestion,
  bulkCreateQuestions,
  createExamSetWithQuestions,
};
