// Level-config invariants + byte-equality proof that the levels refactor
// changed nothing for B2. The fixtures were captured BEFORE the refactor
// (see test/fixtures/) — regenerating them after a change defeats the test.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const peRubric = require('../src/constants/delfRubric');
const poRubric = require('../src/constants/delfOralRubric');
const { LEVELS, LEVEL_KEYS, DEFAULT_LEVEL, getLevel, toPublic } = require('../src/constants/levels');

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'rubrics.json'), 'utf8')
);

test('delfRubric re-export deep-equals the pre-refactor snapshot', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(peRubric)), fixture.pe);
});

test('delfOralRubric re-export deep-equals the pre-refactor snapshot', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(poRubric)), fixture.po);
});

test('getLevel never throws and defaults to B2', () => {
  assert.strictEqual(DEFAULT_LEVEL, 'B2');
  assert.strictEqual(getLevel().key, 'B2');
  assert.strictEqual(getLevel(undefined).key, 'B2');
  assert.strictEqual(getLevel(null).key, 'B2');
  assert.strictEqual(getLevel('b2').key, 'B2');
  assert.strictEqual(getLevel('nonsense').key, 'B2');
});

// The single highest-value assertion in the suite: a mis-transcribed grille
// (typo'd max, duplicated key) in ANY level fails here the moment it lands.
for (const key of LEVEL_KEYS) {
  const lvl = LEVELS[key];

  test(`${key}: PE grille sums to 25 with unique keys`, () => {
    const sum = lvl.pe.DIMENSIONS.reduce((s, d) => s + d.max, 0);
    assert.strictEqual(sum, 25, `PE dimensions sum to ${sum}, expected 25`);
    assert.strictEqual(lvl.pe.TOTAL_MAX, 25);
    const keys = lvl.pe.DIMENSIONS.map((d) => d.key);
    assert.strictEqual(new Set(keys).size, keys.length, 'duplicate PE dimension key');
    assert.deepStrictEqual(lvl.pe.DIMENSION_KEYS, keys);
  });

  test(`${key}: PO grille sums to 25 with unique keys`, () => {
    const sum = lvl.po.DIMENSIONS.reduce((s, d) => s + d.max, 0);
    assert.strictEqual(sum, 25, `PO dimensions sum to ${sum}, expected 25`);
    assert.strictEqual(lvl.po.TOTAL_MAX, 25);
    const keys = lvl.po.DIMENSIONS.map((d) => d.key);
    assert.strictEqual(new Set(keys).size, keys.length, 'duplicate PO dimension key');
    assert.deepStrictEqual(lvl.po.DIMENSION_KEYS, keys);
  });

  test(`${key}: word thresholds are ordered and PO parts are well-formed`, () => {
    assert.ok(lvl.pe.MIN_WORDS < lvl.pe.TARGET_WORDS && lvl.pe.TARGET_WORDS < lvl.pe.MAX_WORDS);
    assert.ok(lvl.po.MIN_WORDS < lvl.po.TARGET_WORDS && lvl.po.TARGET_WORDS < lvl.po.MAX_WORDS);
    assert.ok(Array.isArray(lvl.poPlan.parts) && lvl.poPlan.parts.length >= 1);
    const monologueParts = lvl.poPlan.parts.filter((p) => p.hasMonologue);
    assert.strictEqual(monologueParts.length, 1, 'exactly one part carries the monologue');
    lvl.poPlan.parts.forEach((p, i) => assert.strictEqual(p.order, i, 'parts ordered by index'));
  });

  test(`${key}: toPublic strips server-only prompt/transcript fragments`, () => {
    const pub = toPublic(lvl);
    const json = JSON.stringify(pub); // must be serialisable (no functions)
    assert.ok(!json.includes('examinateur'), 'prompt persona leaked to public payload');
    assert.strictEqual(pub.key, key);
    assert.strictEqual(typeof pub.pe.minWords, 'number');
    assert.strictEqual(typeof pub.po.prepDefaultSec, 'number');
  });
}
