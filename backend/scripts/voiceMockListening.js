// Voice a full-mock's listening (CO) section end-to-end:
//   DB transcripts → TTS (multi-voice WAV) → upload to R2 →
//   create one AudioDocument per CO passage (with DELF play rules) and link
//   each CO question to it.
//
// The AI-generated mocks ship with CO transcripts but no audio, so their
// listening section is silent / unusable. This script makes them playable.
//
// TTS provider (--provider):
//   openai  (default) — gpt-4o-mini-tts, voices nova/onyx/alloy. Cheap but
//                       sounds like a news anchor ("太AI").
//   eleven            — ElevenLabs eleven_multilingual_v2 with native French
//                       voices; far more natural / conversational. Needs
//                       ELEVENLABS_API_KEY. Pick voice IDs via --list-voices.
//
// Usage:
//   node scripts/voiceMockListening.js --provider eleven --list-voices       # discover FR voice IDs
//   node scripts/voiceMockListening.js --set <examSetId>            # one set
//   node scripts/voiceMockListening.js --title "DELF B2 ... Série 1"
//   node scripts/voiceMockListening.js --all-ai                     # all AI mocks
//   node scripts/voiceMockListening.js --set <id> --no-db           # audio only, no DB wiring
//   node scripts/voiceMockListening.js --provider eleven --set <id> --no-db \
//        --voiceA <id> --voiceB <id> --narrator <id>                # try ElevenLabs locally
//
// Re-running a set replaces its CO AudioDocuments (idempotent).

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const OpenAI = require('openai');
const { PrismaClient } = require('@prisma/client');
const { putObject } = require('./lib/r2');

const prisma = new PrismaClient();
const GAP_MS = 350;
const ELEVEN_BASE = 'https://api.elevenlabs.io/v1';

// Default native-French ElevenLabs premade voices (available to all accounts).
// Override with --voiceA/--voiceB/--narrator after running --list-voices.
const ELEVEN_DEFAULTS = {
  voiceA: 'XB0fDUnXU5powFXDhCwa',   // Charlotte — warm female, good French
  voiceB: 'IKne3meq5aSn9XLyUdCD',   // Charlie — natural male
  narrator: 'XrExE9yKIg1WjnnlVkGX', // Matilda — clear neutral narrator
};

function parseArgs(argv) {
  const a = { set: null, title: null, allAi: false, noDb: false, slug: null,
    provider: 'openai', listVoices: false,
    voiceA: null, voiceB: null, narrator: null, model: 'gpt-4o-mini-tts',
    // ElevenLabs knobs: lower stability + some style = more conversational.
    elevenModel: 'eleven_multilingual_v2', elevenFormat: 'pcm_24000',
    stability: 0.35, similarity: 0.8, style: 0.4 };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--set') a.set = argv[++i];
    else if (v === '--title') a.title = argv[++i];
    else if (v === '--all-ai') a.allAi = true;
    else if (v === '--all-unvoiced') a.allUnvoiced = true;
    else if (v === '--no-db') a.noDb = true;
    else if (v === '--slug') a.slug = argv[++i];
    else if (v === '--provider') a.provider = argv[++i];
    else if (v === '--list-voices') a.listVoices = true;
    else if (v === '--voiceA') a.voiceA = argv[++i];
    else if (v === '--voiceB') a.voiceB = argv[++i];
    else if (v === '--narrator') a.narrator = argv[++i];
    else if (v === '--model') a.model = argv[++i];
    else if (v === '--eleven-model') a.elevenModel = argv[++i];
    else if (v === '--eleven-format') a.elevenFormat = argv[++i];
    else if (v === '--stability') a.stability = parseFloat(argv[++i]);
    else if (v === '--similarity') a.similarity = parseFloat(argv[++i]);
    else if (v === '--style') a.style = parseFloat(argv[++i]);
  }
  // Fill voice defaults per provider unless the user supplied them.
  const def = a.provider === 'eleven'
    ? ELEVEN_DEFAULTS
    : { voiceA: 'nova', voiceB: 'onyx', narrator: 'alloy' };
  a.voiceA = a.voiceA || def.voiceA;
  a.voiceB = a.voiceB || def.voiceB;
  a.narrator = a.narrator || def.narrator;
  return a;
}

// ---- WAV helpers (PCM-level splice, no ffmpeg) --------------------------
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

// ---- passage → speaker turns --------------------------------------------
function splitTurns(passage) {
  const body = passage.replace(/^\[[^\]]*\]\s*/, '').trim();
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

// ---- per-passage metadata -----------------------------------------------
// Full mocks tag each passage with a DELF header ("[Exercice 1 — document
// long…]"); standalone AI listening sets don't. When the header is missing we
// infer the document type from the set's shape: a lone passage = one long
// document (2 plays); several passages = short documents (1 play each).
function passageMeta(passage, idx, totalGroups) {
  const head = (passage.split('\n')[0] || '').trim();
  const hasHeader = /^\[/.test(head);
  const isLong = hasHeader ? /document long/i.test(head) : totalGroups <= 1;
  const mShort = head.match(/document court n°?\s*(\d)/i);

  let title, fileLabel;
  if (hasHeader) {
    const inside = (head.match(/\[([^\]]*)\]/) || [, head])[1];
    title = inside.split(',')[0].trim(); // "Exercice 1 — document long"
    fileLabel = isLong
      ? `ex${(head.match(/Exercice\s*(\d)/i) || [, idx + 1])[1]}-long`
      : mShort ? `ex3-court${mShort[1]}` : `doc${idx + 1}`;
  } else if (isLong) {
    title = 'Document long';
    fileLabel = 'long';
  } else {
    const lead = head.split(/[:：]/)[0].trim(); // "Flash info", "Micro-trottoir"…
    title = lead && lead.length <= 30 ? lead : `Document n°${idx + 1}`;
    fileLabel = `court${idx + 1}`;
  }

  const rule = isLong
    ? { maxPlays: 2, prepSeconds: 60, gapSeconds: 180, answerSeconds: 0 }
    : { maxPlays: 1, prepSeconds: 30, gapSeconds: 0, answerSeconds: 30 };
  return { title, fileLabel, ...rule };
}

function slugify(s) {
  return String(s).toLowerCase()
    .replace(/série\s*0*(\d+)/i, 'serie-$1')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'set';
}

// Each provider returns raw PCM as { fmt, data } so the WAV splice below works
// identically. OpenAI hands back a full WAV; ElevenLabs hands back headerless
// PCM whose sample rate is encoded in the output_format (e.g. pcm_24000).
async function synth(client, args, voice, input) {
  if (args.provider === 'eleven') {
    const url = `${ELEVEN_BASE}/text-to-speech/${voice}?output_format=${args.elevenFormat}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: input,
        model_id: args.elevenModel,
        voice_settings: { stability: args.stability, similarity_boost: args.similarity, style: args.style, use_speaker_boost: true },
      }),
    });
    if (!resp.ok) throw new Error(`ElevenLabs TTS HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`);
    const sampleRate = parseInt(String(args.elevenFormat).split('_')[1], 10) || 24000;
    return { fmt: { channels: 1, sampleRate, bitsPerSample: 16 }, data: Buffer.from(await resp.arrayBuffer()) };
  }
  const r = await client.audio.speech.create({ model: args.model, voice, input, response_format: 'wav' });
  return parseWav(Buffer.from(await r.arrayBuffer()));
}

async function voicePassage(client, args, passage) {
  const { turns, multi } = splitTurns(passage);
  const voiceMap = {};
  let voiceIdx = 0, fmt = null;
  const chunks = [];
  for (const turn of turns) {
    let voice;
    if (multi && turn.speaker) {
      if (!voiceMap[turn.speaker]) voiceMap[turn.speaker] = voiceIdx++ % 2 === 0 ? args.voiceA : args.voiceB;
      voice = voiceMap[turn.speaker];
    } else voice = args.narrator;
    const parsed = await synth(client, args, voice, turn.text);
    if (!fmt) fmt = parsed.fmt;
    if (chunks.length) chunks.push(silence(fmt, GAP_MS));
    chunks.push(parsed.data);
  }
  const pcm = Buffer.concat(chunks);
  const sec = Math.round(pcm.length / (fmt.sampleRate * fmt.channels * fmt.bitsPerSample / 8));
  return { wav: buildWav(fmt, pcm), sec, speakers: multi ? Object.keys(voiceMap).length : 1 };
}

async function processSet(client, args, set) {
  const slug = args.slug || slugify(set.title);
  console.log(`\n=== ${set.title}  (slug: ${slug}) ===`);
  const co = await prisma.question.findMany({
    where: { examSetId: set.id, skill: 'CO' },
    select: { id: true, order: true, passage: true }, orderBy: { order: 'asc' },
  });
  if (!co.length) { console.log('  无 CO 题,跳过。'); return; }

  // Group questions by distinct passage, preserving order.
  const groups = [];
  const byHead = new Map();
  for (const q of co) {
    const key = (q.passage || '').slice(0, 80);
    if (!byHead.has(key)) { const g = { passage: q.passage || '', qIds: [] }; byHead.set(key, g); groups.push(g); }
    byHead.get(key).qIds.push(q.id);
  }
  console.log(`  CO 题 ${co.length} · 听力段落 ${groups.length}`);

  const localDir = path.join(__dirname, '../../AI question/mocks/audio', slug);
  fs.mkdirSync(localDir, { recursive: true });

  const docs = []; // { title, audioUrl, maxPlays, prepSeconds, gapSeconds, answerSeconds, order, qIds }
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const meta = passageMeta(g.passage, i, groups.length);
    process.stdout.write(`  · 配音 [${meta.fileLabel}] ${meta.title} … `);
    const { wav, sec, speakers } = await voicePassage(client, args, g.passage);
    fs.writeFileSync(path.join(localDir, `${meta.fileLabel}.wav`), wav);
    const key = `mocks/${slug}/${meta.fileLabel}.wav`;
    const url = await putObject(key, wav, 'audio/wav');
    console.log(`${speakers === 1 ? '单人' : speakers + '人'} ~${sec}s → ${url}`);
    docs.push({ title: meta.title, audioUrl: url, maxPlays: meta.maxPlays,
      prepSeconds: meta.prepSeconds, gapSeconds: meta.gapSeconds, answerSeconds: meta.answerSeconds,
      order: i, qIds: g.qIds });
  }

  if (args.noDb) { console.log('  (--no-db) 跳过数据库写入。'); return; }

  await prisma.$transaction(async (tx) => {
    // Reset: unlink CO questions, drop existing CO AudioDocuments for this set.
    await tx.question.updateMany({ where: { examSetId: set.id, skill: 'CO' }, data: { audioDocumentId: null } });
    await tx.audioDocument.deleteMany({ where: { examSetId: set.id } });
    for (const d of docs) {
      const created = await tx.audioDocument.create({
        data: {
          examSetId: set.id, title: d.title, audioUrl: d.audioUrl, order: d.order,
          maxPlays: d.maxPlays, prepSeconds: d.prepSeconds, gapSeconds: d.gapSeconds, answerSeconds: d.answerSeconds,
        },
      });
      await tx.question.updateMany({ where: { id: { in: d.qIds } }, data: { audioDocumentId: created.id, audioUrl: d.audioUrl } });
    }
  });
  console.log(`  ✓ 已建 ${docs.length} 个 AudioDocument 并关联听力题。`);
}

// Print the account's available ElevenLabs voices so the user can pick FR ones.
async function listElevenVoices() {
  const resp = await fetch(`${ELEVEN_BASE}/voices`, { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY } });
  if (!resp.ok) throw new Error(`ElevenLabs /voices HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`);
  const { voices } = await resp.json();
  console.log(`可用音色 ${voices.length} 个（挑法语/multilingual 的，记下 voice_id 传给 --voiceA/--voiceB/--narrator）：\n`);
  for (const v of voices) {
    const lang = (v.labels && (v.labels.language || v.labels.accent)) || '';
    const desc = (v.labels && v.labels.description) || '';
    console.log(`  ${v.voice_id}  ${v.name.padEnd(16)} ${lang} ${desc}`);
  }
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.provider === 'eleven') {
    if (!process.env.ELEVENLABS_API_KEY) { console.error('✗ ELEVENLABS_API_KEY 未配置（加到 backend/.env）'); process.exit(1); }
    if (args.listVoices) { await listElevenVoices(); await prisma.$disconnect(); return; }
  } else if (!process.env.OPENAI_API_KEY) {
    console.error('✗ OPENAI_API_KEY 未配置'); process.exit(1);
  }
  const client = args.provider === 'eleven' ? null : new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const engine = args.provider === 'eleven' ? `ElevenLabs (${args.elevenModel}, stability=${args.stability}, style=${args.style})`
    : `OpenAI (${args.model})`;
  console.log(`TTS 引擎: ${engine}`);

  let sets = [];
  if (args.set) sets = await prisma.examSet.findMany({ where: { id: args.set }, select: { id: true, title: true } });
  else if (args.title) sets = await prisma.examSet.findMany({ where: { title: args.title }, select: { id: true, title: true } });
  else if (args.allAi) sets = await prisma.examSet.findMany({ where: { title: { contains: 'Examen blanc' } }, select: { id: true, title: true }, orderBy: { createdAt: 'asc' } });
  else if (args.allUnvoiced) {
    // Every set that still has at least one CO question without audio.
    const all = await prisma.examSet.findMany({ select: { id: true, title: true }, orderBy: { createdAt: 'asc' } });
    for (const s of all) {
      const unvoiced = await prisma.question.count({ where: { examSetId: s.id, skill: 'CO', audioDocumentId: null } });
      if (unvoiced > 0) sets.push(s);
    }
  }
  else { console.error('用法: --set <id> | --title "<标题>" | --all-ai | --all-unvoiced'); process.exit(1); }

  if (!sets.length) { console.error('✗ 未找到匹配套题。'); process.exit(1); }
  console.log(`将处理 ${sets.length} 套：`); sets.forEach((s) => console.log('  -', s.title));

  const failed = [];
  for (const s of sets) {
    try { await processSet(client, args, s); }
    catch (e) { failed.push(s.title); console.log(`  ✗ ${s.title} 失败: ${e.message}`); }
  }
  console.log(`\n完成：${sets.length - failed.length}/${sets.length} 套成功。本地试听文件在 AI question/mocks/audio/<slug>/`);
  if (failed.length) console.log('失败套题（可单独重跑 --title）：\n  ' + failed.join('\n  '));
  await prisma.$disconnect();
}

main().catch((e) => { console.error('✗', e); prisma.$disconnect(); process.exit(1); });
