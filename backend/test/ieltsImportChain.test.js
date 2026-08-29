// End-to-end chain proof for IELTS content: generator expand() output must
// pass BOTH the corpus validator AND the real admin import validation
// (bulkImportSchema + validateQuestionShape + validateQuestionForSystem) —
// i.e. what generateIelts.js writes is importable without manual edits.
const test = require('node:test');
const assert = require('node:assert');

const { expand } = require('../scripts/corpus/generateIelts');
const { validateIeltsSet } = require('../scripts/corpus/validateIelts');
const {
  bulkImportSchema, validateQuestionShape, validateQuestionForSystem,
} = require('../src/services/examImport');
const { gradeAnswer } = require('../src/services/grader');

// Simulated compact model outputs (the shapes promptsIelts.js requests).
const RAW_READING = {
  title: 'IELTS 阅读 · The History of Tea',
  passages: ['Tea has been consumed for millennia... (passage text)'],
  questions: [
    { passageIndex: 0, type: 'TFNG', prompt: 'Tea was first grown in India.', answer: 'FALSE', explanation: 'The passage says China.' },
    { passageIndex: 0, type: 'TFNG', prompt: 'The author drinks tea daily.', answer: 'NOT GIVEN', explanation: 'Not stated.' },
    {
      passageIndex: 0, type: 'SINGLE', prompt: 'What made tea popular in Europe?',
      options: [
        { label: 'A', text: 'Trade routes', isCorrect: true },
        { label: 'B', text: 'Royal decree', isCorrect: false },
        { label: 'C', text: 'Medical advice', isCorrect: false },
      ],
      explanation: 'Answer: A',
    },
    { passageIndex: 0, type: 'COMPLETION', prompt: 'Tea reached Europe via ______.', answers: ['trade routes', 'the trade routes'], explanation: 'Stated in paragraph 2.' },
  ],
};

const RAW_LISTENING = {
  title: 'IELTS 听力 · Campus Library Tour',
  passages: ['Welcome to the campus library... (monologue transcript)'],
  questions: [
    { passageIndex: 0, type: 'COMPLETION', prompt: 'The library opens at ______ on weekdays.', answers: ['8 am', '8am'], explanation: 'Stated at the start.' },
    {
      passageIndex: 0, type: 'SINGLE', prompt: 'Where is the quiet zone?',
      options: [
        { label: 'A', text: 'Ground floor', isCorrect: false },
        { label: 'B', text: 'Second floor', isCorrect: true },
        { label: 'C', text: 'Basement', isCorrect: false },
      ],
      explanation: 'Answer: B',
    },
  ],
};

const RAW_WRITING = {
  title: 'IELTS 写作 · Task 2 Remote Work',
  prompt: 'Some believe remote work benefits both employers and employees. To what extent do you agree or disagree? ... Write at least 250 words.',
  modelEssay: 'In recent years, remote work has ... (model answer)',
};

const RAW_SPEAKING = {
  title: 'IELTS 口语 · A Memorable Journey',
  cueCard: 'Describe a memorable journey you have made. You should say: where you went...',
  followUps: [
    { part: 1, text: 'Do you like travelling?', expectedAngle: '流利度与日常词汇' },
    { part: 3, text: 'How has tourism changed your country?', expectedAngle: '抽象话题展开与复杂句' },
  ],
};

function assertImportable(set) {
  // Corpus-side validation
  const v = validateIeltsSet(set);
  assert.deepStrictEqual(v.errors, [], `corpus validator: ${v.errors.join('; ')}`);
  // Real import channel validation (Zod + shape + system cross-checks)
  const parsed = bulkImportSchema.parse(set);
  for (const q of parsed.questions) {
    assert.strictEqual(validateQuestionShape(q), null, `shape: ${q.prompt}`);
    assert.strictEqual(validateQuestionForSystem(q, parsed.system), null, `system: ${q.prompt}`);
  }
  return parsed;
}

test('generated READING set passes the full import chain and grades correctly', () => {
  const set = expand('READING', RAW_READING);
  const parsed = assertImportable(set);
  assert.strictEqual(parsed.system, 'IELTS');
  assert.strictEqual(parsed.level, 'IELTS_AC');
  // TFNG expands to the fixed three options with the right one marked
  const tfng = parsed.questions[0];
  assert.deepStrictEqual(tfng.options.map((o) => o.text), ['TRUE', 'FALSE', 'NOT GIVEN']);
  assert.deepStrictEqual(gradeAnswer(tfng, 'B'), { isCorrect: true, score: 1 }); // B = FALSE
  // COMPLETION grades case-insensitively against accepted answers
  const comp = parsed.questions[3];
  assert.deepStrictEqual(gradeAnswer(comp, 'Trade Routes'), { isCorrect: true, score: 1 });
});

test('generated LISTENING / WRITING / SPEAKING sets pass the full import chain', () => {
  assertImportable(expand('LISTENING', RAW_LISTENING));
  const w = assertImportable(expand('WRITING_T2', RAW_WRITING));
  assert.strictEqual(w.questions[0].skill, 'WRITING');
  assert.strictEqual(w.questions[0].type, 'ESSAY');
  const s = assertImportable(expand('SPEAKING', RAW_SPEAKING));
  assert.strictEqual(s.questions[0].followUps.length, 2);
});
