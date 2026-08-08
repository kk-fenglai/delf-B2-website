// Full-mock generator for DELF B2 (format rénové).
//
// Each mock = one ExamSet combining all skills, composed from several smaller
// LLM calls (token-safe) then assembled + answer-rebalanced + validated:
//   CO : 2 documents longs (écoute ×2) + 1 exercice de 3 documents courts (×1)
//   CE : 3 textes
//   PE : 1 sujet + copie modèle
//   PO : 3 sujets au choix (le candidat en traite UN)
//
// Output: "AI question/mocks/mock-NN.import.json"
//
// Usage:
//   node scripts/corpus/generateMock.js --count 10 --concurrency 4
//
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const OpenAI = require('openai');
const { buildPrompt } = require('./prompts');
const { rebalanceSet } = require('./shuffle');

const OUT_DIR = path.join(__dirname, '../../../AI question/mocks');
const LABELS = ['A', 'B', 'C'];
const PROVIDERS = {
  deepseek: { baseURL: 'https://api.deepseek.com', keyEnv: 'DEEPSEEK_API_KEY', model: 'deepseek-chat' },
  openai: { baseURL: undefined, keyEnv: 'OPENAI_API_KEY', model: 'gpt-4o-mini' },
};
const THEMES = [
  'environnement', 'travail', 'éducation', 'technologie', 'santé', 'médias',
  'consommation', 'ville et transports', 'culture', 'voyage', 'alimentation',
  'sciences', 'réseaux sociaux', 'égalité', 'sport',
];
// Slots composing one mock; kind = prompt builder key.
const SLOTS = [
  { slot: 'co-long-1', kind: 'CO' }, { slot: 'co-long-2', kind: 'CO' },
  { slot: 'co-short', kind: 'CO_SHORT' },
  { slot: 'ce-1', kind: 'CE' }, { slot: 'ce-2', kind: 'CE' }, { slot: 'ce-3', kind: 'CE' },
  { slot: 'pe', kind: 'PE' },
  { slot: 'po-1', kind: 'PO' }, { slot: 'po-2', kind: 'PO' }, { slot: 'po-3', kind: 'PO' },
];

function parseArgs(argv) {
  const a = { count: 10, provider: 'deepseek', model: null, concurrency: 4 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--count') a.count = parseInt(argv[++i], 10);
    else if (argv[i] === '--provider') a.provider = argv[++i];
    else if (argv[i] === '--model') a.model = argv[++i];
    else if (argv[i] === '--concurrency') a.concurrency = parseInt(argv[++i], 10);
  }
  return a;
}

function stripFences(s) { return String(s).replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim(); }
function distributePoints(count, total) {
  const base = Math.floor(total / count), rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}
function mkSingle(skill, q, passage) {
  return {
    skill, type: 'SINGLE', order: 0, prompt: q.prompt, passage, audioUrl: null,
    explanation: q.explanation || '', modelEssay: null, points: q.points || 1,
    options: (q.options || []).map((o, i) => ({ label: o.label || LABELS[i], text: o.text, isCorrect: !!o.isCorrect, order: i })),
    followUps: [],
  };
}

async function callSlot(client, model, kind, theme) {
  const { system, user } = buildPrompt(kind, theme);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await client.chat.completions.create({
        model, temperature: 0.8, max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      });
      return JSON.parse(stripFences(resp.choices[0].message.content || ''));
    } catch (e) {
      if (attempt === 3) throw e;
    }
  }
}

function assembleMock(n, parts) {
  const questions = [];
  // ---- CO : 2 longs + 3 shorts ----
  const coQ = [];
  [parts['co-long-1'], parts['co-long-2']].forEach((raw, li) => {
    const ptext = `[Exercice ${li + 1} — document long, à écouter deux fois]\n\n` + (raw.passages?.[0] || '');
    (raw.questions || []).forEach((q) => coQ.push(mkSingle('CO', q, ptext)));
  });
  const shortRaw = parts['co-short'];
  (shortRaw.questions || []).forEach((q) => {
    const di = q.passageIndex || 0;
    const ptext = `[Exercice 3 — document court n°${di + 1}, à écouter une fois]\n\n` + (shortRaw.passages?.[di] || '');
    coQ.push(mkSingle('CO', q, ptext));
  });
  distributePoints(coQ.length, 25).forEach((p, i) => { coQ[i].points = p; });
  questions.push(...coQ);
  // ---- CE : 3 textes ----
  const ceQ = [];
  ['ce-1', 'ce-2', 'ce-3'].forEach((slot, ti) => {
    const raw = parts[slot];
    const ptext = `[Texte ${ti + 1}]\n\n` + (raw.passages?.[0] || '');
    (raw.questions || []).forEach((q) => ceQ.push(mkSingle('CE', q, ptext)));
  });
  distributePoints(ceQ.length, 25).forEach((p, i) => { ceQ[i].points = p; });
  questions.push(...ceQ);
  // ---- PE ----
  const pe = parts.pe;
  questions.push({
    skill: 'PE', type: 'ESSAY', order: 0, prompt: pe.prompt, passage: '', audioUrl: null,
    explanation: '参考范文见 modelEssay。评分维度：审题/论证/连贯/词汇/语法。',
    modelEssay: pe.modelEssay || '', points: 25, options: [], followUps: [],
  });
  // ---- PO : 3 sujets au choix ----
  ['po-1', 'po-2', 'po-3'].forEach((slot, pi) => {
    const raw = parts[slot];
    const heading = String(raw.title || '').split('·').pop().trim();
    questions.push({
      skill: 'PO', type: 'SPEAKING', order: 0,
      prompt: `Sujet ${pi + 1} sur 3 (à traiter au choix) — « ${heading} »\n\nDégagez le problème soulevé par ce document, puis présentez votre opinion sur le sujet sous la forme d'un exposé personnel et construit. Vous pourrez ensuite débattre de votre point de vue avec l'examinateur.`,
      passage: raw.stimulus || '', explanation: 'Document support original généré par IA.',
      modelEssay: null, points: 25, options: [],
      followUps: (raw.followUps || []).map((f, i) => ({ order: i, text: f.text, expectedAngle: f.expectedAngle || '' })),
    });
  });
  questions.forEach((q, i) => { q.order = i + 1; });
  return {
    title: `DELF B2 Examen blanc complet · Série ${n}`,
    year: null,
    description: 'AI 原创整卷模拟（format rénové）：听力2长+3短 · 阅读3篇 · 写作1篇 · 口语3选1。口语为三选一，整卷按 CO25+CE25+PE25+PO25=100 计分（导入后请将口语未作答的两题设为不计分）。AI 原创，未涉及版权问题。',
    isPublished: false,
    isFreePreview: false,
    questions,
  };
}

function validateMock(set) {
  const errors = [];
  const sum = (s) => set.questions.filter((q) => q.skill === s).reduce((a, q) => a + (q.points || 0), 0);
  set.questions.forEach((q) => {
    if (q.type === 'SINGLE') {
      if (!Array.isArray(q.options) || q.options.length !== 3) errors.push(`${q.skill} q${q.order}: !=3 options`);
      else if (q.options.filter((o) => o.isCorrect).length !== 1) errors.push(`${q.skill} q${q.order}: !=1 correct`);
    }
  });
  if (sum('CO') !== 25) errors.push(`CO points=${sum('CO')}`);
  if (sum('CE') !== 25) errors.push(`CE points=${sum('CE')}`);
  if (set.questions.filter((q) => q.skill === 'PE').length !== 1) errors.push('PE != 1');
  if (set.questions.filter((q) => q.skill === 'PO').length !== 3) errors.push('PO != 3');
  return errors;
}

async function runPool(items, worker, concurrency) {
  let idx = 0;
  async function next() { while (idx < items.length) { const my = idx++; await worker(items[my], my); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
}

async function main() {
  const args = parseArgs(process.argv);
  const prov = PROVIDERS[args.provider];
  const apiKey = process.env[prov.keyEnv];
  if (!apiKey) { console.error(`✗ ${prov.keyEnv} 未配置`); process.exit(1); }
  const model = args.model || prov.model;
  const client = new OpenAI({ apiKey, baseURL: prov.baseURL });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Build all sub-jobs across all mocks for max concurrency.
  const jobs = [];
  for (let n = 1; n <= args.count; n++) {
    SLOTS.forEach((s, si) => jobs.push({ mock: n, slot: s.slot, kind: s.kind, theme: THEMES[(n * 7 + si) % THEMES.length] }));
  }
  const parts = {}; // parts[mock][slot] = raw
  let done = 0, failed = 0;
  console.log(`生成 ${args.count} 套整卷（${jobs.length} 次调用）| ${args.provider}/${model} concurrency=${args.concurrency}\n`);
  await runPool(jobs, async (job) => {
    try {
      const raw = await callSlot(client, model, job.kind, job.theme);
      (parts[job.mock] ||= {})[job.slot] = raw;
    } catch (e) {
      failed++;
      console.log(`  ! 调用失败 mock${job.mock}/${job.slot}: ${e.message}`);
    }
    done++;
    if (done % 10 === 0) console.log(`  …已完成 ${done}/${jobs.length} 次调用`);
  }, args.concurrency);

  let ok = 0, bad = 0;
  for (let n = 1; n <= args.count; n++) {
    const p = parts[n] || {};
    const missing = SLOTS.filter((s) => !p[s.slot]).map((s) => s.slot);
    if (missing.length) { bad++; console.log(`✗ mock-${String(n).padStart(2, '0')} 缺失: ${missing.join(',')}`); continue; }
    const set = assembleMock(n, p);
    rebalanceSet(set);
    const errs = validateMock(set);
    const fname = `mock-${String(n).padStart(2, '0')}.import.json`;
    if (errs.length) { bad++; console.log(`✗ ${fname}: ${errs.join('; ')}`); continue; }
    fs.writeFileSync(path.join(OUT_DIR, fname), JSON.stringify(set, null, 2));
    ok++;
    const nQ = set.questions.length;
    console.log(`✓ ${fname}  (${nQ} 题：CO ${set.questions.filter(q=>q.skill==='CO').length} / CE ${set.questions.filter(q=>q.skill==='CE').length} / PE 1 / PO 3)`);
  }
  console.log(`\n完成：${ok} 套整卷通过，${bad} 套失败。调用失败 ${failed} 次。输出：AI question/mocks/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
