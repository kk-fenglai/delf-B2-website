// Byte-equality proof for the AI grader system prompts + tool defs.
// The fixtures were captured BEFORE the per-level refactor; a byte of drift
// here means B2 grading behaviour changed AND DeepSeek's prefix cache was
// invalidated. Do NOT regenerate the fixtures to make this pass.

// The graders pull config/env, which hard-exits on missing vars. Provide
// harmless defaults so the suite runs without a .env (CI); a real .env
// overrides these via dotenv override:true.
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ||= 'a3f9c2e8b7d14056af92c3e1b8d70f4a2c6e9b1d5307f8a4';
process.env.JWT_REFRESH_SECRET ||= '7d21b6e4f0a93c85d1e7b2408fc63a9d5e08b4712c6fa93e';
process.env.FRONTEND_URL ||= 'http://localhost:5173';
process.env.DEEPSEEK_API_KEY ||= 'sk-test-0000000000000000000000000000';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const aiGrader = require('../src/services/aiGrader');
const oralGrader = require('../src/services/oralGrader');

const fx = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const toolFx = JSON.parse(fx('toolDefs.json'));

test('PE system prompt is byte-identical to the pre-refactor fixture', () => {
  assert.strictEqual(aiGrader._internal.getSystemPrompt('B2'), fx('peSystemPrompt.txt'));
});

test('PO system prompt is byte-identical to the pre-refactor fixture', () => {
  assert.strictEqual(oralGrader._internal.getSystemPrompt('B2'), fx('poSystemPrompt.txt'));
});

test('unknown level falls back to the B2 prompt (never throws)', () => {
  assert.strictEqual(aiGrader._internal.getSystemPrompt(), aiGrader._internal.getSystemPrompt('B2'));
  assert.strictEqual(aiGrader._internal.getSystemPrompt('nope'), aiGrader._internal.getSystemPrompt('B2'));
  assert.strictEqual(oralGrader._internal.getSystemPrompt('nope'), oralGrader._internal.getSystemPrompt('B2'));
});

test('PE tool defs match the pre-refactor fixture', () => {
  const norm = (o) => JSON.parse(JSON.stringify(o));
  assert.deepStrictEqual(norm(aiGrader._internal.SCORE_TOOL_DEF), toolFx.pe.score);
  assert.deepStrictEqual(norm(aiGrader._internal.CORRECTIONS_TOOL_DEF), toolFx.pe.corrections);
  assert.deepStrictEqual(norm(aiGrader._internal.SUMMARY_TOOL_DEF), toolFx.pe.summary);
});

test('PO tool defs match the pre-refactor fixture', () => {
  const norm = (o) => JSON.parse(JSON.stringify(o));
  assert.deepStrictEqual(norm(oralGrader._internal.SCORE_TOOL_DEF), toolFx.po.score);
  assert.deepStrictEqual(norm(oralGrader._internal.CORRECTIONS_TOOL_DEF), toolFx.po.corrections);
  assert.deepStrictEqual(norm(oralGrader._internal.SUMMARY_TOOL_DEF), toolFx.po.summary);
});

test('prompt memoisation returns the same string instance per level', () => {
  assert.strictEqual(
    aiGrader._internal.getSystemPrompt('B2'),
    aiGrader._internal.getSystemPrompt('B2')
  );
});
