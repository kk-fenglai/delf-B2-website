// bulkCreateQuestions must derive CO AudioDocument play params from the
// level config (co.playRules), not the pre-refactor hardcoded 2/60/180.
const test = require('node:test');
const assert = require('node:assert');

const { bulkCreateQuestions } = require('../src/services/examImport');
const { getLevel } = require('../src/constants/levels');

function fakeTx() {
  const created = { audioDocument: [], question: [], questionOption: [], oralFollowUp: [] };
  const table = (name) => ({ createMany: async ({ data }) => { created[name].push(...data); } });
  return {
    created,
    audioDocument: table('audioDocument'),
    question: table('question'),
    questionOption: table('questionOption'),
    oralFollowUp: table('oralFollowUp'),
  };
}

const coQuestion = (audioUrl) => ({
  skill: 'CO', type: 'SINGLE', order: 1, prompt: 'Q?', audioUrl,
  points: 1,
  options: [
    { label: 'A', text: 'a', isCorrect: true, order: 0 },
    { label: 'B', text: 'b', isCorrect: false, order: 1 },
  ],
  followUps: [],
});

async function importedDocParams({ level, coFormat }) {
  const tx = fakeTx();
  await bulkCreateQuestions(tx, 'set-1', [coQuestion('https://cdn/x.mp3')], { level, coFormat });
  assert.strictEqual(tx.created.audioDocument.length, 1);
  const { maxPlays, prepSeconds, gapSeconds, answerSeconds } = tx.created.audioDocument[0];
  return { maxPlays, prepSeconds, gapSeconds, answerSeconds };
}

test('CO import uses each level\'s playRules (defaultFormat when coFormat is null)', async () => {
  for (const key of ['A2', 'B1', 'B2']) {
    const co = getLevel(key).co;
    assert.deepStrictEqual(
      await importedDocParams({ level: key, coFormat: null }),
      co.playRules[co.defaultFormat],
      `level ${key}`
    );
  }
});

test('CO import honours an explicit coFormat override', async () => {
  assert.deepStrictEqual(
    await importedDocParams({ level: 'B2', coFormat: 'short' }),
    getLevel('B2').co.playRules.short
  );
});

test('IELTS listening import creates single-play AudioDocuments (maxPlays 1, no gaps)', async () => {
  const tx = fakeTx();
  const q = { ...coQuestion('https://cdn/ielts.mp3'), skill: 'LISTENING' };
  await bulkCreateQuestions(tx, 'set-1', [q], { system: 'IELTS', level: 'IELTS_AC', coFormat: null });
  assert.strictEqual(tx.created.audioDocument.length, 1);
  const d = tx.created.audioDocument[0];
  assert.deepStrictEqual(
    { maxPlays: d.maxPlays, prepSeconds: d.prepSeconds, gapSeconds: d.gapSeconds, answerSeconds: d.answerSeconds },
    { maxPlays: 1, prepSeconds: 0, gapSeconds: 0, answerSeconds: 0 }
  );
  // 且题目挂上了该文档（IELTS 的听力 skill 键是 LISTENING 而不是 CO）
  assert.strictEqual(tx.created.question[0].audioDocumentId, d.id);
});

test('CO import without opts keeps the legacy B2 long defaults (2/60/180)', async () => {
  const tx = fakeTx();
  await bulkCreateQuestions(tx, 'set-1', [coQuestion('https://cdn/x.mp3')]);
  const d = tx.created.audioDocument[0];
  assert.deepStrictEqual(
    { maxPlays: d.maxPlays, prepSeconds: d.prepSeconds, gapSeconds: d.gapSeconds, answerSeconds: d.answerSeconds },
    { maxPlays: 2, prepSeconds: 60, gapSeconds: 180, answerSeconds: 0 }
  );
});
