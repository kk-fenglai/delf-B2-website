const { test } = require('node:test');
const assert = require('node:assert');
const { sanitizeExamTitle, sanitizeExamDescription } = require('../src/utils/examTitle');

test('strips PE date/region from learner title', () => {
  assert.strictEqual(
    sanitizeExamTitle('DELF B2 写作真题 · 2021年3月（法国） — 抗议取消法语培训'),
    'DELF B2 写作 · 抗议取消法语培训',
  );
});

test('leaves an already-clean title unchanged', () => {
  const clean = 'DELF B2 听力 · 长听力：濒危物种保护 (CITES)';
  assert.strictEqual(sanitizeExamTitle(clean), clean);
});

test('drops stray 真题 marker', () => {
  assert.ok(!sanitizeExamTitle('DELF B2 写作真题 · 主题').includes('真题'));
});

test('handles non-string input gracefully', () => {
  assert.strictEqual(sanitizeExamTitle(null), null);
  assert.strictEqual(sanitizeExamTitle(undefined), undefined);
});

test('description drops 来源 provenance after first sentence', () => {
  const out = sanitizeExamDescription('抗议取消法语培训。来源：2021年3月（法国） DELF B2 写作考试回忆题。');
  assert.ok(!out.includes('来源'));
  assert.ok(out.includes('抗议取消法语培训'));
});
