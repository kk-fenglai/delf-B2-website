const crypto = require('crypto');
const { z } = require('zod');
const { sanitizeExamTitle, sanitizeExamDescription } = require('../utils/examTitle');
const { resolveExamSetYear } = require('../utils/examSetYear');
const { LEVEL_KEYS, getLevel } = require('../constants/levels');
const { SYSTEM_KEYS, getSystem } = require('../constants/systems');

// 全体系 level 键并集；system×level 组合合法性由 validateSystemLevel 交叉校验。
const ALL_LEVEL_KEYS = SYSTEM_KEYS.flatMap((k) => getSystem(k).LEVEL_KEYS);

const VALID_SKILLS = ['CO', 'CE', 'PE', 'PO'];
// 每个体系允许的题型；并集进 questionSchema 的枚举，组合合法性由
// validateQuestionForSystem 交叉校验（TRUE_FALSE_JUSTIFY 等 DELF 专属，
// TFNG/MATCHING/COMPLETION/SHORT_ANSWER 为 IELTS 专属）。
const SYSTEM_TYPES = {
  DELF: ['SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'TRUE_FALSE_JUSTIFY', 'FILL', 'ESSAY', 'SPEAKING'],
  IELTS: ['SINGLE', 'MULTIPLE', 'TFNG', 'MATCHING', 'COMPLETION', 'SHORT_ANSWER', 'ESSAY', 'SPEAKING'],
  // TCF 三项必考全为四选一单选（题库来源 TV5Monde 训练册）；无 PE/PO。
  TCF: ['SINGLE'],
};
const VALID_TYPES = [...new Set(Object.values(SYSTEM_TYPES).flat())];
const ALL_SKILL_KEYS = [...new Set(SYSTEM_KEYS.flatMap((k) => getSystem(k).skills.map((s) => s.key)))];
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
  skill: z.enum(ALL_SKILL_KEYS),
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
  // 考试体系。缺省 DELF ⇒ 所有既存导入文件行为完全不变。
  system: z.enum(SYSTEM_KEYS).default('DELF'),
  // 考试等级。缺省 B2 ⇒ 磁盘上所有既存导入文件行为完全不变。
  // 枚举是全体系并集；与 system 的组合合法性由路由层 validateSystemLevel 校验。
  level: z.enum(ALL_LEVEL_KEYS).default('B2'),
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
  if (q.type === 'TFNG') {
    if (q.options.length !== 3) return 'TFNG needs exactly 3 options (TRUE / FALSE / NOT GIVEN)';
    if (correctCount !== 1) return 'TFNG needs exactly 1 correct option';
  }
  if (q.type === 'MATCHING') {
    if (q.options.length < 2) return 'MATCHING needs ≥2 options (the matching pool)';
    if (correctCount !== 1) return 'MATCHING needs exactly 1 correct option';
  }
  if (q.type === 'COMPLETION' || q.type === 'SHORT_ANSWER') {
    // 接受答案存于 isCorrect 选项的 text（与 grader.js 的 FILL 族判分一致）。
    if (correctCount < 1) return `${q.type} needs ≥1 correct option holding accepted answers`;
  }
  if (q.type === 'SPEAKING') {
    // 口语技能键按体系不同：DELF=PO，IELTS=SPEAKING。
    if (q.skill !== 'PO' && q.skill !== 'SPEAKING') return 'SPEAKING questions must have skill = PO (DELF) or SPEAKING (IELTS)';
    if (!q.followUps || q.followUps.length < 1) return 'SPEAKING needs ≥1 follow-up';
    if (q.followUps.length > 6) return 'SPEAKING accepts at most 6 follow-ups';
  }
  if (q.type !== 'SPEAKING' && q.followUps && q.followUps.length > 0) {
    return 'follow-ups are only allowed on SPEAKING questions';
  }
  return null;
}

/** 题目×体系交叉校验：skill 必须属于该体系，type 必须在该体系题型白名单内。 */
function validateQuestionForSystem(q, systemKey) {
  const sys = getSystem(systemKey || 'DELF');
  if (!sys.skills.some((s) => s.key === q.skill)) {
    return `Skill ${q.skill} is not valid for system ${sys.key}`;
  }
  if (!SYSTEM_TYPES[sys.key].includes(q.type)) {
    return `Type ${q.type} is not valid for system ${sys.key}`;
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

async function bulkCreateQuestions(tx, setId, questions, { system, level, coFormat } = {}) {
  // 听力播放参数按 体系→级别 配置解析；coFormat 为空时用该级别的 defaultFormat。
  // 必须走 getSystem：直接 getLevel('IELTS_AC') 会静默回落 B2 拿错参数。
  const sys = getSystem(system);
  const listeningKey = sys.skills.find((s) => s.slug === 'listening').key;
  const co = sys.getLevel(level).co;
  const playRules = co.playRules[coFormat] || co.playRules[co.defaultFormat];
  const coAudioDocId = new Map();
  const audioDocRows = [];
  for (const q of questions) {
    if (q.skill === listeningKey && q.audioUrl && !coAudioDocId.has(q.audioUrl)) {
      const docId = crypto.randomUUID();
      coAudioDocId.set(q.audioUrl, docId);
      audioDocRows.push({
        id: docId,
        examSetId: setId,
        order: audioDocRows.length,
        title: `Document ${audioDocRows.length + 1}`,
        audioUrl: q.audioUrl,
        ...playRules,
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
      audioDocumentId: q.audioUrl ? coAudioDocId.get(q.audioUrl) || null : null,
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
  system,
  level,
  coFormat,
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
      system: system || 'DELF',
      level: level || 'B2',
      coFormat: coFormat || null,
      ownerUserId: ownerUserId || null,
      source: source || 'PLATFORM',
      primarySkill: primarySkill || null,
    },
  });
  await bulkCreateQuestions(tx, set.id, questions, { system: set.system, level: set.level, coFormat: set.coFormat });
  return set;
}

module.exports = {
  VALID_SKILLS,
  ALL_SKILL_KEYS,
  VALID_TYPES,
  USER_SKILLS,
  optionSchema,
  followUpSchema,
  questionSchema,
  examSetSchema,
  bulkImportSchema,
  validateQuestionShape,
  validateQuestionForSystem,
  validateUserQuestion,
  bulkCreateQuestions,
  createExamSetWithQuestions,
};
