// Byte-equality proof for the B2 oral transcript shape. buildCombinedTranscript
// now takes its markers from the level config; for B2 the output must be
// EXACTLY what the pre-refactor hardcoded version produced — the LLM prompt's
// segment contract ([MONOLOGUE] / [DEBAT Qn] / [REPONSE n]) depends on it.

process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ||= 'a3f9c2e8b7d14056af92c3e1b8d70f4a2c6e9b1d5307f8a4';
process.env.JWT_REFRESH_SECRET ||= '7d21b6e4f0a93c85d1e7b2408fc63a9d5e08b4712c6fa93e';
process.env.FRONTEND_URL ||= 'http://localhost:5173';
process.env.DEEPSEEK_API_KEY ||= 'sk-test-0000000000000000000000000000';

const test = require('node:test');
const assert = require('node:assert');

const { buildCombinedTranscript } = require('../src/services/oralQueue');

const followUps = [
  { id: 'f1', order: 0, text: 'Question un ?' },
  { id: 'f2', order: 1, text: 'Question deux ?' },
];

test('B2 transcript: monologue + answered + missing follow-up (exact bytes)', () => {
  const out = buildCombinedTranscript({
    recordingsByRole: {
      monologue: { transcript: 'Bonjour, je vais parler de la ville.  ' },
      followUps: new Map([['f1', { transcript: ' Ma réponse une. ' }]]),
    },
    followUps,
    // no levelKey → default B2 path, same as every existing caller
  });

  assert.strictEqual(
    out,
    '[MONOLOGUE]\n' +
      'Bonjour, je vais parler de la ville.\n' +
      '\n' +
      '[DEBAT Q1] Question un ?\n' +
      '[REPONSE 1]\n' +
      'Ma réponse une.\n' +
      '\n' +
      '[DEBAT Q2] Question deux ?\n' +
      '[REPONSE 2]\n' +
      '(pas de réponse enregistrée)'
  );
});

test('B2 transcript: missing monologue emits no [MONOLOGUE] block', () => {
  const out = buildCombinedTranscript({
    recordingsByRole: { monologue: null, followUps: new Map() },
    followUps: [{ id: 'f1', order: 0, text: 'Q ?' }],
  });
  assert.strictEqual(out, '[DEBAT Q1] Q ?\n[REPONSE 1]\n(pas de réponse enregistrée)');
});

test('B2 transcript: no follow-ups leaves just the monologue', () => {
  const out = buildCombinedTranscript({
    recordingsByRole: { monologue: { transcript: 'Texte.' }, followUps: new Map() },
    followUps: [],
  });
  assert.strictEqual(out, '[MONOLOGUE]\nTexte.');
});

test('explicit B2 levelKey produces identical output to the default', () => {
  const args = {
    recordingsByRole: { monologue: { transcript: 'Texte.' }, followUps: new Map() },
    followUps,
  };
  assert.strictEqual(
    buildCombinedTranscript({ ...args, levelKey: 'B2' }),
    buildCombinedTranscript(args)
  );
});
