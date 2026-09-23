// TCF exam system (TV5Monde practice booklets): registry + import contract.
const test = require('node:test');
const assert = require('node:assert');

const {
  SYSTEMS, SYSTEM_KEYS, getSystem, validateSystemLevel, resolveLevelKey, resolveLevel, resolveSystem, toPublicSystem,
} = require('../src/constants/systems');
const {
  bulkImportSchema, validateQuestionForSystem, validateQuestionShape, ALL_SKILL_KEYS,
} = require('../src/services/examImport');

test('TCF is registered with CO / SL / CE and a single tout-public level', () => {
  assert.ok(SYSTEM_KEYS.includes('TCF'));
  const tcf = getSystem('tcf');
  assert.strictEqual(tcf.key, 'TCF');
  assert.deepStrictEqual(tcf.skills.map((s) => s.key), ['CO', 'SL', 'CE']);
  assert.deepStrictEqual(tcf.skills.map((s) => s.slug), ['listening', 'grammar', 'reading']);
  assert.deepStrictEqual(tcf.LEVEL_KEYS, ['TCF_TP']);
  assert.strictEqual(tcf.DEFAULT_LEVEL, 'TCF_TP');
  assert.ok(ALL_SKILL_KEYS.includes('SL'));
});

test('TCF level resolution: cross-system lookups and DELF fallback stay intact', () => {
  assert.strictEqual(validateSystemLevel('TCF', 'TCF_TP'), null);
  assert.match(validateSystemLevel('TCF', 'B2'), /not valid for system TCF/);
  assert.match(validateSystemLevel('DELF', 'TCF_TP'), /not valid for system DELF/);
  assert.strictEqual(resolveLevelKey('tcf_tp'), 'TCF_TP');
  assert.strictEqual(resolveLevel('TCF_TP').key, 'TCF_TP');
  assert.strictEqual(resolveSystem('TCF_TP').key, 'TCF');
  assert.strictEqual(resolveSystem('A2').key, 'DELF');
  assert.strictEqual(resolveSystem(undefined).key, 'DELF');
  assert.strictEqual(resolveSystem('IELTS_AC').key, 'IELTS');
});

test('TCF listening plays once, no prep/gap; section plan is CO→SL→CE', () => {
  const lvl = getSystem('TCF').getLevel('TCF_TP');
  assert.deepStrictEqual(lvl.co.playRules[lvl.co.defaultFormat], {
    maxPlays: 1, prepSeconds: 0, gapSeconds: 0, answerSeconds: 0,
  });
  assert.deepStrictEqual(lvl.sectionPlan.order, ['CO', 'SL', 'CE']);
  assert.strictEqual(lvl.sectionPlan.poSeparateSession, false);
  assert.strictEqual(lvl.pe, undefined);
  assert.strictEqual(lvl.po, undefined);
});

test('toPublicSystem: TCF exposes cefr scoring and no pe/po in the level projection', () => {
  const pub = toPublicSystem(SYSTEMS.TCF);
  assert.strictEqual(pub.scoring.kind, 'cefr');
  assert.strictEqual(pub.scoring.cefrBands[0].level, 'A1');
  assert.strictEqual(pub.scoring.cefrBands.at(-1).level, 'C2');
  assert.strictEqual(pub.levels.length, 1);
  const lvl = pub.levels[0];
  assert.strictEqual(lvl.key, 'TCF_TP');
  assert.deepStrictEqual(Object.keys(lvl).sort(), ['co', 'guide', 'key', 'sectionPlan', 'titlePrefix']);
  // Public payload must be JSON-serialisable (no functions).
  assert.doesNotThrow(() => JSON.stringify(pub));
});

test('TCF import contract: SINGLE on CO/SL/CE only', () => {
  assert.strictEqual(validateQuestionForSystem({ skill: 'SL', type: 'SINGLE' }, 'TCF'), null);
  assert.strictEqual(validateQuestionForSystem({ skill: 'CO', type: 'SINGLE' }, 'TCF'), null);
  assert.match(validateQuestionForSystem({ skill: 'PE', type: 'SINGLE' }, 'TCF'), /Skill PE is not valid for system TCF/);
  assert.match(validateQuestionForSystem({ skill: 'CE', type: 'ESSAY' }, 'TCF'), /Type ESSAY is not valid for system TCF/);
  assert.match(validateQuestionForSystem({ skill: 'SL', type: 'SINGLE' }, 'DELF'), /Skill SL is not valid for system DELF/);

  const opts = ['A', 'B', 'C', 'D'].map((l, i) => ({ label: l, text: `opt ${l}`, isCorrect: i === 1, order: i }));
  const parsed = bulkImportSchema.safeParse({
    title: 'TCF · Entraînement n°1',
    system: 'TCF',
    level: 'TCF_TP',
    questions: [
      { skill: 'CO', type: 'SINGLE', order: 1, prompt: 'Q1', audioUrl: 'https://cdn/x.mp3', options: opts },
      { skill: 'SL', type: 'SINGLE', order: 16, prompt: 'Tu veux que je … les courses ?', options: opts },
      { skill: 'CE', type: 'SINGLE', order: 26, prompt: 'Que présente ce texte ?', passage: 'Texte…', options: opts },
    ],
  });
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
  for (const q of parsed.data.questions) {
    assert.strictEqual(validateQuestionShape(q), null);
    assert.strictEqual(validateQuestionForSystem(q, parsed.data.system), null);
  }
});
