const { test } = require('node:test');
const assert = require('node:assert');
const {
  planRank, planAtLeast, defaultModelForPlan, modelAllowedForPlan,
} = require('../src/constants/planMatrix');

test('planRank orders tiers and defaults unknown to 0', () => {
  assert.strictEqual(planRank('FREE'), 0);
  assert.ok(planRank('AI_UNLIMITED') > planRank('AI'));
  assert.ok(planRank('AI') > planRank('STANDARD'));
  assert.strictEqual(planRank('NOPE'), 0);
});

test('planAtLeast compares tiers', () => {
  assert.strictEqual(planAtLeast('AI', 'STANDARD'), true);
  assert.strictEqual(planAtLeast('STANDARD', 'STANDARD'), true);
  assert.strictEqual(planAtLeast('FREE', 'STANDARD'), false);
});

test('model availability follows the plan caps', () => {
  assert.strictEqual(modelAllowedForPlan('FREE', 'deepseek-chat'), false);
  assert.strictEqual(modelAllowedForPlan('STANDARD', 'deepseek-chat'), true);
  assert.strictEqual(defaultModelForPlan('AI_UNLIMITED'), 'deepseek-chat');
  assert.strictEqual(defaultModelForPlan('FREE'), null);
});
