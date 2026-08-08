// Voice the standalone DELF B2 listening sets (听力_CO/*.json) end-to-end:
//   JSON audioFiles[].transcript → ElevenLabs (native-FR, multi-voice) →
//   splice to one WAV per audio doc → upload to R2 → write the public URL
//   back into that audioFile's `ossUrl`.
//
// These sets are NOT in the database (unlike scripts/voiceMockListening.js,
// which reads CO transcripts from Prisma). This script works purely on the
// JSON files on disk, so it can run before any import.
//
// Why ElevenLabs: OpenAI gpt-4o-mini-tts sounds like a news anchor ("太AI");
// eleven_multilingual_v2 with native French voices gives conversational
// intonation. Needs ELEVENLABS_API_KEY in backend/.env.
//
// Usage (run from backend/):
//   node scripts/voiceListeningSets.js --only CO-L1 --no-upload   # 1 file, local WAV only (audition)
//   node scripts/voiceListeningSets.js --only CO-L1               # 1 file, upload R2 + write ossUrl
//   node scripts/voiceListeningSets.js                            # all 12 CO files
//   node scripts/voiceListeningSets.js --voiceA <id> --voiceB <id> --narrator <id>
//   node scripts/voiceListeningSets.js --stability 0.3 --style 0.5   # more expressive
//
// Re-running overwrites the R2 object (same key) and the ossUrl (idempotent).

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { putObject } = require('./lib/r2');

const ELEVEN_BASE = 'https://api.elevenlabs.io/v1';
const GAP_MS = 350; // pause between turns, matches the mock pipeline

// Voices usable on the ElevenLabs FREE API tier (library voices like
// Charlotte/Charlie require a paid plan). These are English-origin premade
// voices; eleven_multilingual_v2 makes them speak French with a slight
// non-native accent. For native-French voices, upgrade and pass --voiceA etc.
const DEFAULTS = {
  voiceA: 'EXAVITQu4vr4xnSDxMaL', // Bella — female
  voiceB: 'pNInz6obpgDQGcFmaJgB', // Adam — male
  narrator: 'ErXwobaYiN019PkySvjV', // Antoni — male, neutral narrator
};

function parseArgs(argv) {
  const a = {
    dir: path.join(__dirname, '../../DELF_B2_题库_按类型/题库_按类型/听力_CO'),
    only: null, limit: 0, noUpload: false, listVoices: false,
    voiceA: DEFAULTS.voiceA, voiceB: DEFAULTS.voiceB, narrator: DEFAULTS.narrator,
    model: 'eleven_multilingual_v2', format: 'pcm_24000',
    // lower stability + some style = more conversational, less flat
    stability: 0.35, similarity: 0.8, style: 0.45,
  };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--dir') a.dir = argv[++i];
    else if (v === '--only') a.only = argv[++i];
    else if (v === '--limit') a.limit = parseInt(argv[++i], 10) || 0;
    else if (v === '--no-upload') a.noUpload = true;
    else if (v === '--list-voices') a.listVoices = true;
    else if (v === '--voiceA') a.voiceA = argv[++i];
    else if (v === '--voiceB') a.voiceB = argv[++i];
    else if (v === '--narrator') a.narrator = argv[++i];
    else if (v === '--model') a.model = argv[++i];
    else if (v === '--format') a.format = argv[++i];
    else if (v === '--stability') a.stability = parseFloat(argv[++i]);
    else if (v === '--similarity') a.similarity = parseFloat(argv[++i]);
    else if (v === '--style') a.style = parseFloat(argv[++i]);
  }
  return a;
}

// ---- WAV (raw PCM → WAV, no ffmpeg) --------------------------------------
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

// ---- transcript → speaker turns ------------------------------------------
// Long interviews mark each turn with a leading em/en dash ("— …"); short
// announcements have no dash markers → a single speaker. The dash test
// requires a following space so hyphenated words (est-ce, rendez-vous) are
// never split.
function splitTurns(transcript) {
  const text = String(transcript || '').trim();
  const dialogue = /(^|\n)\s*[—–]\s+/.test(text);
  if (!dialogue) return { turns: [text], dialogue: false };
  const turns = text
    .split(/(?:^|\n)\s*[—–]\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return { turns, dialogue: turns.length >= 2 };
}

async function synth(args, voice, input) {
  const url = `${ELEVEN_BASE}/text-to-speech/${voice}?output_format=${args.format}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: input,
      model_id: args.model,
      voice_settings: { stability: args.stability, similarity_boost: args.similarity, style: args.style, use_speaker_boost: true },
    }),
  });
  if (!resp.ok) throw new Error(`ElevenLabs HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`);
  const sampleRate = parseInt(String(args.format).split('_')[1], 10) || 24000;
  return { fmt: { channels: 1, sampleRate, bitsPerSample: 16 }, pcm: Buffer.from(await resp.arrayBuffer()) };
}

// Synthesize one audio doc (transcript) into a single spliced WAV.
// `monoVoiceIdx` rotates the narrator across short docs so they differ.
async function voiceTranscript(args, transcript, monoVoiceIdx) {
  const { turns, dialogue } = splitTurns(transcript);
  const monoPool = [args.narrator, args.voiceB, args.voiceA];
  let fmt = null;
  const chunks = [];
  for (let i = 0; i < turns.length; i++) {
    const voice = dialogue
      ? (i % 2 === 0 ? args.voiceA : args.voiceB)
      : monoPool[monoVoiceIdx % monoPool.length];
    const { fmt: f, pcm } = await synth(args, voice, turns[i]);
    if (!fmt) fmt = f;
    if (chunks.length) chunks.push(silence(fmt, GAP_MS));
    chunks.push(pcm);
  }
  const pcm = Buffer.concat(chunks);
  const sec = Math.round(pcm.length / (fmt.sampleRate * fmt.channels * fmt.bitsPerSample / 8));
  return { wav: buildWav(fmt, pcm), sec, speakers: dialogue ? 2 : 1 };
}

async function processFile(args, file, monoCounter) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const code = (json.meta && json.meta.examPaperCode) || path.basename(file, '.json');
  const audios = Array.isArray(json.audioFiles) ? json.audioFiles : [];
  if (!audios.length) { console.log(`  ${code}: 无 audioFiles,跳过。`); return monoCounter; }
  console.log(`\n=== ${code}  (${audios.length} 段) ===`);

  const localDir = path.join(__dirname, '_listening-audio', code);
  fs.mkdirSync(localDir, { recursive: true });

  let changed = false;
  for (let i = 0; i < audios.length; i++) {
    const af = audios[i];
    const audioId = af.id || `${code}_${i + 1}`;
    process.stdout.write(`  · ${audioId} ${af.label ? '(' + af.label + ') ' : ''}… `);
    const { wav, sec, speakers } = await voiceTranscript(args, af.transcript, monoCounter);
    monoCounter++;
    fs.writeFileSync(path.join(localDir, `${audioId}.wav`), wav);
    if (args.noUpload) {
      console.log(`${speakers === 1 ? '单人' : '对话'} ~${sec}s → 本地 ${audioId}.wav (未上传)`);
      continue;
    }
    const key = `listening-sets/${code}/${audioId}.wav`;
    const ossUrl = await putObject(key, wav, 'audio/wav');
    af.ossUrl = ossUrl;
    changed = true;
    console.log(`${speakers === 1 ? '单人' : '对话'} ~${sec}s → ${ossUrl}`);
  }

  if (changed) {
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
    console.log(`  ✓ 已写回 ${audios.length} 个 ossUrl。`);
  }
  return monoCounter;
}

async function listVoices() {
  const resp = await fetch(`${ELEVEN_BASE}/voices`, { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY } });
  if (!resp.ok) throw new Error(`ElevenLabs /voices HTTP ${resp.status}`);
  const { voices } = await resp.json();
  console.log(`可用音色 ${voices.length} 个（挑法语/multilingual 的，记 voice_id 传给 --voiceA/--voiceB/--narrator）：\n`);
  for (const v of voices) {
    const lang = (v.labels && (v.labels.language || v.labels.accent)) || '';
    console.log(`  ${v.voice_id}  ${String(v.name).padEnd(16)} ${lang}`);
  }
}

function collectFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collectFiles(fp));
    else if (e.isFile() && e.name.endsWith('.json') && e.name !== '_index.json') out.push(fp);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('✗ ELEVENLABS_API_KEY 未配置（加到 backend/.env）。');
    process.exit(1);
  }
  if (args.listVoices) { await listVoices(); return; }

  if (!fs.existsSync(args.dir)) { console.error(`✗ 目录不存在: ${args.dir}`); process.exit(1); }
  let files = collectFiles(args.dir).sort();
  if (args.only) files = files.filter((f) => path.basename(f, '.json') === args.only);
  if (args.limit > 0) files = files.slice(0, args.limit);
  if (!files.length) { console.error('✗ 没有匹配的 CO JSON 文件。'); process.exit(1); }

  console.log(`TTS: ElevenLabs ${args.model} (stability=${args.stability}, style=${args.style})`);
  console.log(`将处理 ${files.length} 个文件${args.noUpload ? '（--no-upload：只生成本地 WAV）' : ''}：`);
  files.forEach((f) => console.log('  -', path.basename(f)));

  let monoCounter = 0;
  const failed = [];
  for (const f of files) {
    try { monoCounter = await processFile(args, f, monoCounter); }
    catch (e) { failed.push(path.basename(f)); console.log(`  ✗ ${path.basename(f)} 失败: ${e.message}`); }
  }
  console.log(`\n完成：${files.length - failed.length}/${files.length} 个文件。本地试听在 backend/scripts/_listening-audio/<code>/`);
  if (failed.length) console.log('失败：\n  ' + failed.join('\n  '));
}

main().catch((e) => { console.error('✗', e); process.exit(1); });
