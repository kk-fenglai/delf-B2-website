// Text-to-speech for DELF B2 listening (CO) passages.
//
// Generates one WAV per CO audio document (Exercice 1 long, Exercice 2 long,
// Exercice 3 short ×3). Dialogue passages ("Speaker : text" paragraphs) are
// voiced with alternating voices per speaker and concatenated in pure Node
// (no ffmpeg) — OpenAI TTS emits WAV, which we splice at the PCM level with a
// short silence between turns. Monologues use a single narrator voice.
//
// Usage:
//   node scripts/corpus/tts.js "../AI question/mocks/mock-01.import.json"
//   node scripts/corpus/tts.js "<file>" --voiceA nova --voiceB onyx --model gpt-4o-mini-tts
//
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const OpenAI = require('openai');

const GAP_MS = 350; // silence between speaker turns

function parseArgs(argv) {
  const a = { file: null, voiceA: 'nova', voiceB: 'onyx', narrator: 'alloy', model: 'gpt-4o-mini-tts' };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--voiceA') a.voiceA = argv[++i];
    else if (v === '--voiceB') a.voiceB = argv[++i];
    else if (v === '--narrator') a.narrator = argv[++i];
    else if (v === '--model') a.model = argv[++i];
    else if (!a.file) a.file = v;
  }
  if (!a.file) throw new Error('Usage: node tts.js <import.json> [--voiceA nova --voiceB onyx]');
  return a;
}

// ---- WAV helpers (PCM-level splice) -------------------------------------
function parseWav(buf) {
  let off = 12, fmt = null, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') fmt = { channels: buf.readUInt16LE(body + 2), sampleRate: buf.readUInt32LE(body + 4), bitsPerSample: buf.readUInt16LE(body + 14) };
    if (id === 'data') data = buf.subarray(body, body + size);
    off = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV parse failed');
  return { fmt, data };
}
function buildWav(fmt, pcm) {
  const blockAlign = (fmt.channels * fmt.bitsPerSample) / 8;
  const byteRate = fmt.sampleRate * blockAlign;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(fmt.channels, 22); h.writeUInt32LE(fmt.sampleRate, 24);
  h.writeUInt32LE(byteRate, 28); h.writeUInt16LE(blockAlign, 32); h.writeUInt16LE(fmt.bitsPerSample, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}
function silence(fmt, ms) {
  const n = Math.floor((fmt.sampleRate * ms) / 1000) * ((fmt.channels * fmt.bitsPerSample) / 8);
  return Buffer.alloc(n);
}

// ---- Passage → speaker turns --------------------------------------------
// Returns { turns: [{speaker, text}], multi: bool }
function splitTurns(passage) {
  const body = passage.replace(/^\[[^\]]*\]\s*/, '').trim(); // drop [Exercice ...]
  const paras = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const turns = [];
  let last = null;
  for (const p of paras) {
    const m = p.match(/^([A-ZÀ-Ÿ][\wÀ-ÿ''.\-’ ]{0,38}?)\s*:\s*([\s\S]+)$/);
    if (m) { last = m[1].trim(); turns.push({ speaker: last, text: m[2].trim() }); }
    else turns.push({ speaker: last, text: p });
  }
  const speakers = new Set(turns.map((t) => t.speaker).filter(Boolean));
  return { turns, multi: speakers.size >= 2 };
}

function docLabel(passage, idx) {
  const head = passage.split('\n')[0];
  const mLong = head.match(/Exercice\s*(\d)\s*—\s*document long/i);
  if (mLong) return `ex${mLong[1]}-long`;
  const mShort = head.match(/document court n°?\s*(\d)/i);
  if (mShort) return `ex3-court${mShort[1]}`;
  return `doc${idx + 1}`;
}

async function tts(client, model, voice, input) {
  const r = await client.audio.speech.create({ model, voice, input, response_format: 'wav' });
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  const args = parseArgs(process.argv);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.error('✗ OPENAI_API_KEY 未配置'); process.exit(1); }
  const client = new OpenAI({ apiKey });
  const set = JSON.parse(fs.readFileSync(args.file, 'utf8'));

  // distinct CO passages, in order
  const seen = new Set();
  const passages = [];
  for (const q of set.questions) {
    if (q.skill !== 'CO' || !q.passage) continue;
    const key = q.passage.slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key); passages.push(q.passage);
  }
  if (!passages.length) { console.log('该套没有 CO 听力文稿。'); return; }

  const base = path.basename(args.file).replace(/\.import\.json$/, '');
  const outDir = path.join(path.dirname(args.file), 'audio', base);
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`配音 ${passages.length} 段听力 → ${path.relative(process.cwd(), outDir)}\n`);

  for (let i = 0; i < passages.length; i++) {
    const passage = passages[i];
    const { turns, multi } = splitTurns(passage);
    const label = docLabel(passage, i);
    const voiceMap = {};
    let voiceIdx = 0;
    let fmt = null;
    const chunks = [];
    for (let t = 0; t < turns.length; t++) {
      const turn = turns[t];
      let voice;
      if (multi && turn.speaker) {
        if (!voiceMap[turn.speaker]) { voiceMap[turn.speaker] = voiceIdx++ % 2 === 0 ? args.voiceA : args.voiceB; }
        voice = voiceMap[turn.speaker];
      } else voice = args.narrator;
      const wav = await tts(client, args.model, voice, turn.text);
      const parsed = parseWav(wav);
      if (!fmt) fmt = parsed.fmt;
      if (chunks.length) chunks.push(silence(fmt, GAP_MS));
      chunks.push(parsed.data);
    }
    const out = buildWav(fmt, Buffer.concat(chunks));
    const fpath = path.join(outDir, `${label}.wav`);
    fs.writeFileSync(fpath, out);
    const sec = (Buffer.concat(chunks).length / (fmt.sampleRate * fmt.channels * fmt.bitsPerSample / 8)).toFixed(0);
    console.log(`✓ ${label}.wav  (${multi ? `${Object.keys(voiceMap).length} 人对话` : '单人'}, ~${sec}s, ${turns.length} 段)`);
  }
  console.log('\n完成。试听后如满意，可批量给其余套配音。');
}

main().catch((e) => { console.error(e); process.exit(1); });
