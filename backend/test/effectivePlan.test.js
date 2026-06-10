const { test } = require('node:test');
const assert = require('node:assert');
const { effectivePlan } = require('../src/middleware/requirePlan');

const future = new Date(Date.now() + 86400e3);
const past = new Date(Date.now() - 86400e3);

test('no user / FREE plan resolves to FREE', () => {
  assert.strictEqual(effectivePlan(null), 'FREE');
  assert.strictEqual(effectivePlan({ plan: 'FREE' }), 'FREE');
});

test('paid plan with no end date is treated as FREE (the subscriptionEnd bug class)', () => {
  assert.strictEqual(effectivePlan({ plan: 'AI_UNLIMITED', subscriptionEnd: null }), 'FREE');
});

test('paid plan with an expired end is FREE', () => {
  assert.strictEqual(effectivePlan({ plan: 'STANDARD', subscriptionEnd: past }), 'FREE');
});

test('paid plan with a live end keeps its tier', () => {
  assert.strictEqual(effectivePlan({ plan: 'AI_UNLIMITED', subscriptionEnd: future }), 'AI_UNLIMITED');
  assert.strictEqual(effectivePlan({ plan: 'AI', subscriptionEnd: future }), 'AI');
});
