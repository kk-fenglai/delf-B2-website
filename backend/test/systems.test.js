// Exam-system registry invariants (PRD 2026-08-29 IELTS 接入, M1).
const test = require('node:test');
const assert = require('node:assert');

const {
  SYSTEMS, SYSTEM_KEYS, DEFAULT_SYSTEM, getSystem, validateSystemLevel, resolveLevelKey, toPublicSystem,
} = require('../src/constants/systems');
const { gradeAnswer } = require('../src/services/grader');
const { validateQuestionForSystem, validateQuestionShape } = require('../src/services/examImport');
const { getLevel, toPublic, LEVEL_KEYS } = require('../src/constants/levels');

test('getSystem: legacy null/empty falls back to DELF, unknown key THROWS', () => {
  assert.strictEqual(DEFAULT_SYSTEM, 'DELF');
  assert.strictEqual(getSystem().key, 'DELF');
  assert.strictEqual(getSystem(null).key, 'DELF');
  assert.strictEqual(getSystem('').key, 'DELF');
  assert.strictEqual(getSystem('ielts').key, 'IELTS');
  // 与 getLevel 的静默回落相反：跨体系串线必须炸，不能拿 DELF 评分标准批雅思。
  assert.throws(() => getSystem('TOEFL'), /Unknown exam system/);
});

test('DELF system wraps the existing level registry unchanged', () => {
  const delf = getSystem('DELF');
  assert.deepStrictEqual(delf.LEVEL_KEYS, LEVEL_KEYS);
  assert.strictEqual(delf.getLevel('A2'), getLevel('A2'));
  assert.strictEqual(delf.toPublicLevel, toPublic);
  assert.deepStrictEqual(delf.scoring, {
    kind: 'points', skillMax: 25, totalMax: 100, passTotalMin: 50, passPerSkillMin: 5,
  });
});

test('DELF and IELTS expose the same four semantic slugs (TCF has its own set, see tcf.test.js)', () => {
  for (const key of ['DELF', 'IELTS']) {
    assert.deepStrictEqual(
      SYSTEMS[key].skills.map((s) => s.slug),
      ['listening', 'reading', 'writing', 'speaking'],
      `system ${key}`
    );
  }
});

test('validateSystemLevel rejects cross-system combos and unknown systems', () => {
  assert.strictEqual(validateSystemLevel('DELF', 'B2'), null);
  assert.strictEqual(validateSystemLevel(undefined, 'A2'), null); // legacy → DELF
  assert.strictEqual(validateSystemLevel('IELTS', 'IELTS_AC'), null);
  assert.match(validateSystemLevel('IELTS', 'B2'), /not valid for system IELTS/);
  assert.match(validateSystemLevel('DELF', 'IELTS_AC'), /not valid for system DELF/);
  assert.match(validateSystemLevel('TOEFL', 'B2'), /Unknown exam system/);
});

test('toPublicSystem: DELF levels are byte-identical to GET /api/levels payload', () => {
  const pub = toPublicSystem(SYSTEMS.DELF);
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(pub.levels)),
    JSON.parse(JSON.stringify(LEVEL_KEYS.map((k) => toPublic(getLevel(k)))))
  );
  assert.strictEqual(pub.defaultLevel, 'B2');
});

test('toPublicSystem: IELTS exposes band scoring and the Academic level', () => {
  const pub = toPublicSystem(SYSTEMS.IELTS);
  assert.deepStrictEqual(pub.scoring, { kind: 'band', bandMin: 0, bandMax: 9, bandStep: 0.5 });
  assert.strictEqual(pub.levels.length, 1);
  assert.strictEqual(pub.levels[0].key, 'IELTS_AC');
  assert.deepStrictEqual(pub.levels[0].sectionPlan.minutes, { LISTENING: 30, READING: 60, WRITING: 60 });
});

test('resolveLevelKey knows every system\'s levels and still defaults to B2', () => {
  assert.strictEqual(resolveLevelKey('IELTS_AC'), 'IELTS_AC');
  assert.strictEqual(resolveLevelKey('A2'), 'A2');
  assert.strictEqual(resolveLevelKey('ielts_ac'), 'IELTS_AC');
  assert.strictEqual(resolveLevelKey(undefined), 'B2');
  assert.strictEqual(resolveLevelKey('C1'), 'B2');
});

test('validateQuestionForSystem rejects cross-system skills and types', () => {
  const base = { skill: 'LISTENING', type: 'TFNG' };
  assert.strictEqual(validateQuestionForSystem(base, 'IELTS'), null);
  assert.match(validateQuestionForSystem(base, 'DELF'), /Skill LISTENING is not valid/);
  assert.match(validateQuestionForSystem({ skill: 'CE', type: 'TFNG' }, 'DELF'), /Type TFNG is not valid/);
  assert.match(validateQuestionForSystem({ skill: 'READING', type: 'TRUE_FALSE_JUSTIFY' }, 'IELTS'), /Type TRUE_FALSE_JUSTIFY is not valid/);
  assert.strictEqual(validateQuestionForSystem({ skill: 'CE', type: 'SINGLE' }, undefined), null); // legacy → DELF
});

test('new IELTS question types grade correctly', () => {
  const tfng = {
    type: 'TFNG', points: 1,
    options: [
      { label: 'A', text: 'TRUE', isCorrect: false },
      { label: 'B', text: 'FALSE', isCorrect: false },
      { label: 'C', text: 'NOT GIVEN', isCorrect: true },
    ],
  };
  assert.deepStrictEqual(gradeAnswer(tfng, 'C'), { isCorrect: true, score: 1 });
  assert.deepStrictEqual(gradeAnswer(tfng, 'A'), { isCorrect: false, score: 0 });

  const completion = {
    type: 'COMPLETION', points: 1,
    options: [
      { label: 'A', text: 'greenhouse gases', isCorrect: true },
      { label: 'B', text: 'greenhouse gas', isCorrect: true },
    ],
  };
  assert.deepStrictEqual(gradeAnswer(completion, '  Greenhouse Gases '), { isCorrect: true, score: 1 });
  assert.deepStrictEqual(gradeAnswer(completion, 'carbon'), { isCorrect: false, score: 0 });

  const matching = {
    type: 'MATCHING', points: 1,
    options: [
      { label: 'I', text: 'Heading one', isCorrect: false },
      { label: 'II', text: 'Heading two', isCorrect: true },
      { label: 'III', text: 'Heading three', isCorrect: false },
    ],
  };
  assert.deepStrictEqual(gradeAnswer(matching, 'ii'), { isCorrect: true, score: 1 });
});

test('validateQuestionShape enforces the new IELTS type shapes', () => {
  const opts = (n, correct = 1) => Array.from({ length: n }, (_, i) => ({
    label: String.fromCharCode(65 + i), text: `t${i}`, isCorrect: i < correct, order: i,
  }));
  assert.strictEqual(validateQuestionShape({ type: 'TFNG', options: opts(3), followUps: [] }), null);
  assert.match(validateQuestionShape({ type: 'TFNG', options: opts(2), followUps: [] }), /exactly 3 options/);
  assert.match(validateQuestionShape({ type: 'MATCHING', options: opts(3, 2), followUps: [] }), /exactly 1 correct/);
  assert.match(validateQuestionShape({ type: 'SHORT_ANSWER', options: opts(1, 0), followUps: [] }), /accepted answers/);
});

// ---- M4: cross-system level resolution + band aggregation ----------------
const { resolveLevel } = require('../src/constants/systems');
const aiGraderInternal = require('../src/services/aiGrader')._internal;
const b2Fixture = require('node:fs').readFileSync(
  require('node:path').join(__dirname, 'fixtures', 'peSystemPrompt.txt'), 'utf8'
);

test('resolveLevel finds IELTS_AC and keeps the B2 fallback for legacy keys', () => {
  assert.strictEqual(resolveLevel('IELTS_AC').key, 'IELTS_AC');
  assert.strictEqual(resolveLevel('A2').key, 'A2');
  assert.strictEqual(resolveLevel(undefined).key, 'B2');
  assert.strictEqual(resolveLevel('C1').key, 'B2');
});

test('B2 PE system prompt is STILL byte-identical after the fullPrompt override hook', () => {
  assert.strictEqual(aiGraderInternal.getSystemPrompt('B2'), b2Fixture);
});

test('IELTS_AC PE system prompt is the English full prompt, not the French skeleton', () => {
  const p = aiGraderInternal.getSystemPrompt('IELTS_AC');
  assert.match(p, /certified IELTS examiner/);
  assert.match(p, /task_achievement/);
  assert.doesNotMatch(p, /GRILLE D'ÉVALUATION/);
  // tool defs carry English descriptions and the 4 IELTS criteria keys
  const defs = aiGraderInternal.getToolDefs('IELTS_AC');
  assert.match(defs.scores.description, /IELTS Academic Writing/);
  assert.deepStrictEqual(
    defs.scores.parameters.properties.dimensions.items.properties.key.enum,
    ['task_achievement', 'coherence_cohesion', 'lexical_resource', 'grammatical_range_accuracy']
  );
});

test('IELTS band aggregation: mean of criteria, quarters round UP to 0.5', () => {
  const lvl = resolveLevel('IELTS_AC');
  const dims = (scores) => scores.map((s, i) => ({ key: `d${i}`, score: s, max: 9 }));
  assert.strictEqual(lvl.pe.aggregateScore(dims([7, 6, 6.5, 6])), 6.5);   // mean 6.375
  assert.strictEqual(lvl.pe.aggregateScore(dims([6, 6.5, 6.5, 6])), 6.5); // mean 6.25 → up
  assert.strictEqual(lvl.pe.aggregateScore(dims([7, 7, 6.5, 6.5])), 7);   // mean 6.75 → up
  assert.strictEqual(lvl.pe.aggregateScore(dims([6, 6, 6, 6])), 6);
  assert.strictEqual(lvl.po.aggregateScore(dims([7, 6, 6])), 6.5);        // 3 speaking criteria, mean 6.33
});

test('IELTS toPublicLevel strips prompt fragments and transcript functions', () => {
  const pub = toPublicSystem(SYSTEMS.IELTS).levels[0];
  assert.strictEqual(pub.pePrompt, undefined);
  assert.strictEqual(pub.poPrompt, undefined);
  const json = JSON.stringify(pub);
  assert.doesNotMatch(json, /certified IELTS examiner/);
  assert.strictEqual(pub.pe.minWords, 120);
  assert.strictEqual(pub.po.parts.length, 2);
  assert.strictEqual(pub.po.parts[0].prepSec, 60); // Part 2 cue card: 1 min prep
});
