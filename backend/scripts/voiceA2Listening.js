// Voice the AI-generated A2 listening sets (AI question/A2/CO/*.import.json):
//   distinct question passages → ElevenLabs → one WAV per exercice →
//   upload to R2 → write the public URL back into each question's `audioUrl`.
//
// Passage format differs from the B2 sets: speaker turns are inline labels
// ("La cliente : … Le serveur : …"), monologues open with "Annonce : …" /
// "Message : …". Labels are stripped from the spoken text.
//
// Default model is eleven_turbo_v2.5 (0.5 credit/char) to fit a 10k-credit
// budget — the 10 sets total ~15.5k chars (~7.8k credits).
//
// Usage (run from backend/):
//   node scripts/voiceA2Listening.js --dry-run              # split preview only, no credits spent
//   node scripts/voiceA2Listening.js --only a2-co-01-gare   # one set
//   node scripts/voiceA2Listening.js                        # all sets
//   node scripts/voiceA2Listening.js --no-upload            # local WAV only (audition)
//
// Idempotent: passages whose questions already carry an audioUrl are skipped
// (use --force to re-voice); re-running overwrites the same R2 key.

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { putObject } = require('./lib/r2');

const ELEVEN_BASE = 'https://api.elevenlabs.io/v1';
const GAP_MS = 350;

const DEFAULTS = {
  voiceA: 'EXAVITQu4vr4xnSDxMaL', // Bella — female
  voiceB: 'pNInz6obpgDQGcFmaJgB', // Adam — male
  narrator: 'ErXwobaYiN019PkySvjV', // Antoni — male, neutral narrator
};
// OpenAI gpt-4o-mini-tts voices (used when --provider openai)
const OPENAI_DEFAULTS = { voiceA: 'nova', voiceB: 'onyx', narrator: 'alloy' };
const OPENAI_INSTRUCTIONS = 'Parle en français natif avec un ton naturel et conversationnel, débit modéré et articulation claire, comme dans un document sonore d\'examen DELF.';

function parseArgs(argv) {
  const a = {
    dir: path.join(__dirname, '../../AI question/A2/CO'),
    only: null, noUpload: false, dryRun: false, force: false,
    provider: 'eleven',
    voiceA: DEFAULTS.voiceA, voiceB: DEFAULTS.voiceB, narrator: DEFAULTS.narrator,
    model: 'eleven_turbo_v2_5', format: 'pcm_24000',
    // A2: higher stability than B2 (0.35) → calmer, clearer delivery
    stability: 0.5, similarity: 0.8, style: 0.3,
  };
  for (let i = 2; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--dir') a.dir = argv[++i];
    else if (v === '--provider') a.provider = argv[++i];
    else if (v === '--only') a.only = argv[++i];
    else if (v === '--no-upload') a.noUpload = true;
    else if (v === '--dry-run') a.dryRun = true;
    else if (v === '--force') a.force = true;
    else if (v === '--voiceA') a.voiceA = argv[++i];
    else if (v === '--voiceB') a.voiceB = argv[++i];
    else if (v === '--narrator') a.narrator = argv[++i];
    else if (v === '--model') a.model = argv[++i];
    else if (v === '--stability') a.stability = parseFloat(argv[++i]);
    else if (v === '--style') a.style = parseFloat(argv[++i]);
  }
  if (a.provider === 'openai') {
    // Swap in OpenAI defaults unless explicitly overridden on the CLI
    if (a.model === 'eleven_turbo_v2_5') a.model = 'gpt-4o-mini-tts';
    if (a.voiceA === DEFAULTS.voiceA) a.voiceA = OPENAI_DEFAULTS.voiceA;
    if (a.voiceB === DEFAULTS.voiceB) a.voiceB = OPENAI_DEFAULTS.voiceB;
    if (a.narrator === DEFAULTS.narrator) a.narrator = OPENAI_DEFAULTS.narrator;
  }
  return a;
}

// ---- WAV (raw PCM → WAV, no ffmpeg) — same as voiceListeningSets.js ------
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

// ---- passage → labelled speaker turns ------------------------------------
// Matches "Label : " at passage start or right after sentence-ending
// punctuation. Label = short capitalised phrase without sentence punctuation.
const LABEL_RE = /(?:^|(?<=[.!?…»])\s+)((?:L'|D')?[A-ZÀ-Ý][\p{L}'’ .-]{0,28}?)\s?:\s+/gu;

// Stage directions — stripped, never spoken.
const STAGE_RE = /^(annonce|message|flash info|à la radio|publicité|répondeur|au haut-parleur|au téléphone|informations?|reportage|chronique( radio)?|micro-trottoir)$/i;
// Person-style labels ("La cliente", "M. Petit") — always a real speaker.
const PERSON_RE = /^(le |la |l'|un |une |m\. |mme |monsieur |madame )/i;
// Abstract-noun labels ("Le principe :", "Le programme :") — spoken content,
// never a speaker, even though they start with an article.
const ABSTRACT_RE = /(principe|programme|résultat|conseil|objectif|règle|idée|solution|raison|but|avantage|nouveauté|menu|tarif|horaire)/i;

function splitTurns(passage) {
  const text = String(passage || '').trim();
  const matches = [...text.matchAll(LABEL_RE)];
  if (!matches.length) return [{ label: null, text }];
  const raw = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const chunk = text.slice(start, end).replace(/\s+/g, ' ').trim();
    if (chunk) raw.push({ label: matches[i][1].trim(), text: chunk });
  }
  // Classify labels: stage directions are stripped; a label is a real speaker
  // if it recurs (dialogue turns alternate) or looks like a person; anything
  // else ("Attention :", "Bonne nouvelle :") is spoken content — merge it
  // back into the preceding turn, label included.
  const counts = new Map();
  raw.forEach((t) => counts.set(t.label, (counts.get(t.label) || 0) + 1));
  const out = [];
  for (const t of raw) {
    if (STAGE_RE.test(t.label)) { out.push({ label: null, text: t.text }); continue; }
    const abstract = ABSTRACT_RE.test(t.label) && counts.get(t.label) < 2;
    if (!abstract && (counts.get(t.label) >= 2 || PERSON_RE.test(t.label))) { out.push(t); continue; }
    const spoken = `${t.label} : ${t.text}`;
    if (out.length) out[out.length - 1].text += ' ' + spoken;
    else out.push({ label: null, text: spoken });
  }
  return out;
}

// Female if the label carries a feminine article/honorific; male for the
// masculine ones; null = undecided (fall back to appearance order).
function labelGender(label) {
  if (/^(la |une |mme|madame)/i.test(label)) return 'F';
  if (/^(le |un |m\. |monsieur)/i.test(label)) return 'M';
  return null;
}

// Map each distinct label to a voice. Mono passages rotate the narrator pool
// (so consecutive announcements don't all share one voice).
function assignVoices(args, turns, monoIdx) {
  const labels = [...new Set(turns.map((t) => t.label).filter(Boolean))];
  const monoPool = [args.narrator, args.voiceB, args.voiceA];
  if (labels.length <= 1) {
    const v = monoPool[monoIdx % monoPool.length];
    return { voiceOf: () => v, speakers: 1 };
  }
  const map = new Map();
  let fallback = 0;
  for (const l of labels) {
    const g = labelGender(l);
    if (g === 'F') map.set(l, args.voiceA);
    else if (g === 'M') map.set(l, args.voiceB);
    else map.set(l, fallback++ % 2 === 0 ? args.voiceA : args.voiceB);
  }
  // Two undecided/one-gender labels colliding on the same voice → split them.
  if (labels.length === 2 && map.get(labels[0]) === map.get(labels[1])) {
    map.set(labels[1], map.get(labels[1]) === args.voiceA ? args.voiceB : args.voiceA);
  }
  return { voiceOf: (t) => map.get(t.label), speakers: labels.length };
}

async function synth(args, voice, input) {
  if (args.provider === 'openai') {
    // gpt-4o-mini-tts, raw PCM out (24kHz 16-bit mono) — same splice pipeline
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: args.model, voice, input, response_format: 'pcm', instructions: OPENAI_INSTRUCTIONS,
      }),
    });
    if (!resp.ok) throw new Error(`OpenAI TTS HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`);
    return { fmt: { channels: 1, sampleRate: 24000, bitsPerSample: 16 }, pcm: Buffer.from(await resp.arrayBuffer()) };
  }
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

async function voicePassage(args, passage, monoIdx) {
  const turns = splitTurns(passage);
  const { voiceOf, speakers } = assignVoices(args, turns, monoIdx);
  let fmt = null;
  const chunks = [];
  for (const t of turns) {
    const { fmt: f, pcm } = await synth(args, voiceOf(t), t.text);
    if (!fmt) fmt = f;
    if (chunks.length) chunks.push(silence(fmt, GAP_MS));
    chunks.push(pcm);
  }
  const pcm = Buffer.concat(chunks);
  const sec = Math.round(pcm.length / (fmt.sampleRate * fmt.channels * fmt.bitsPerSample / 8));
  return { wav: buildWav(fmt, pcm), sec, speakers };
}

// Ordered distinct passages of a set, with the question indexes sharing each.
function collectPassages(set) {
  const out = [];
  const byText = new Map();
  set.questions.forEach((q, qi) => {
    if (!q.passage) return;
    if (!byText.has(q.passage)) { byText.set(q.passage, out.length); out.push({ text: q.passage, qIdx: [] }); }
    out[byText.get(q.passage)].qIdx.push(qi);
  });
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const keyName = args.provider === 'openai' ? 'OPENAI_API_KEY' : 'ELEVENLABS_API_KEY';
  if (!args.dryRun && !process.env[keyName]) {
    console.error(`✗ ${keyName} 未配置（加到 backend/.env）。`);
    process.exit(1);
  }
  let files = fs.readdirSync(args.dir).filter((f) => f.endsWith('.import.json')).sort()
    .map((f) => path.join(args.dir, f));
  if (args.only) files = files.filter((f) => path.basename(f, '.import.json') === args.only);
  if (!files.length) { console.error('✗ 没有匹配的 import.json。'); process.exit(1); }

  console.log(`TTS: ${args.provider === 'openai' ? 'OpenAI' : 'ElevenLabs'} ${args.model}${args.dryRun ? ' [dry-run]' : ''}`);
  let monoIdx = 0;
  let totalChars = 0;
  const failed = [];
  for (const file of files) {
    const base = path.basename(file, '.import.json');
    const set = JSON.parse(fs.readFileSync(file, 'utf8'));
    const passages = collectPassages(set);
    console.log(`\n=== ${base} (${passages.length} 段) ===`);
    const localDir = path.join(__dirname, '_listening-audio', base);
    let changed = false;
    for (let i = 0; i < passages.length; i++) {
      const p = passages[i];
      const done = p.qIdx.every((qi) => set.questions[qi].audioUrl);
      if (done && !args.force) { console.log(`  · ex${i + 1}: 已有 audioUrl，跳过`); continue; }
      const turns = splitTurns(p.text);
      totalChars += p.text.length;
      if (args.dryRun) {
        const labels = [...new Set(turns.map((t) => t.label).filter(Boolean))];
        console.log(`  · ex${i + 1}: ${p.text.length} 字符, ${turns.length} 轮, 说话人: ${labels.length ? labels.join(' / ') : '(无标签,整段单人)'}`);
        turns.forEach((t) => console.log(`      [${t.label || '—'}] ${t.text.slice(0, 60)}…`));
        continue;
      }
      try {
        process.stdout.write(`  · ex${i + 1} (${p.text.length} 字符)… `);
        const { wav, sec, speakers } = await voicePassage(args, p.text, monoIdx);
        monoIdx++;
        fs.mkdirSync(localDir, { recursive: true });
        fs.writeFileSync(path.join(localDir, `ex${i + 1}.wav`), wav);
        if (args.noUpload) { console.log(`${speakers > 1 ? speakers + '人对话' : '单人'} ~${sec}s → 本地 ex${i + 1}.wav (未上传)`); continue; }
        const url = await putObject(`listening-sets/${base.split('-')[0]}/${base}/ex${i + 1}.wav`, wav, 'audio/wav');
        p.qIdx.forEach((qi) => { set.questions[qi].audioUrl = url; });
        changed = true;
        console.log(`${speakers > 1 ? speakers + '人对话' : '单人'} ~${sec}s → ${url}`);
      } catch (e) {
        failed.push(`${base} ex${i + 1}`);
        console.log(`✗ 失败: ${e.message}`);
      }
    }
    if (changed) {
      fs.writeFileSync(file, JSON.stringify(set, null, 2), 'utf8');
      console.log(`  ✓ audioUrl 已写回 ${base}.import.json`);
    }
  }
  console.log(`\n${args.dryRun ? '预演' : '完成'}：合计 ${totalChars} 字符（${args.model.includes('turbo') || args.model.includes('flash') ? '≈' + Math.ceil(totalChars / 2) : '=' + totalChars} credits）。本地试听: backend/scripts/_listening-audio/<set>/`);
  if (failed.length) { console.log('失败：\n  ' + failed.join('\n  ')); process.exit(1); }
}

main().catch((e) => { console.error('✗', e); process.exit(1); });
