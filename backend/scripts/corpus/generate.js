// Batch generator for original DELF B2 single-skill sets.
//
// Calls an OpenAI-compatible chat endpoint (DeepSeek by default) with the
// skill prompts in prompts.js, expands the compact model output into the
// site's import JSON, validates it, retries on failure, and writes the
// accepted sets to the repo-root "AI question/" folder.
//
// Setup: add DEEPSEEK_API_KEY to backend/.env (or use --provider openai with
// the existing OPENAI_API_KEY).
//
// Examples:
//   node scripts/corpus/generate.js --plan CO:2,CE:1            # quick test
//   node scripts/corpus/generate.js --plan CO:20,CE:15,PE:8,PO:7   # 50 sets
//   node scripts/corpus/generate.js --plan CO:50 --provider openai --model gpt-4o-mini
//
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const OpenAI = require('openai');
const { buildPrompt } = require('./prompts');
const { validateSet } = require('./validate');
const { rebalanceSet } = require('./shuffle');

const OUT_DIR = path.join(__dirname, '../../../AI question');
const REJECT_DIR = path.join(OUT_DIR, '_rejected');

const PROVIDERS = {
  deepseek: { baseURL: 'https://api.deepseek.com', keyEnv: 'DEEPSEEK_API_KEY', model: 'deepseek-chat' },
  openai: { baseURL: undefined, keyEnv: 'OPENAI_API_KEY', model: 'gpt-4o-mini' },
};

const THEMES = [
  'environnement', 'travail', 'éducation', 'technologie', 'santé', 'médias',
  'consommation', 'ville et transports', 'culture', 'voyage', 'alimentation',
  'sciences', 'réseaux sociaux', 'égalité', 'sport',
];

const SKILL_DIR_TAG = { CO: '听力', CO_SHORT: '听力', CE: '阅读', PE: '写作', PO: '口语' };

// Fixed descriptions per the requested policy: "AI 原创，未涉及版权问题"，无人工审核字样。
const DESCRIPTIONS = {
  CO: 'AI 原创长听力，未涉及版权问题。',
  CO_SHORT: 'AI 原创短听力（三段），未涉及版权问题。',
  CE: 'AI 原创阅读，未涉及版权问题。',
  PE: 'AI 原创写作（含参考范文），未涉及版权问题。',
  PO: 'AI 原创口语主题，未涉及版权问题。',
};

const FILE_PREFIX = { CO: 'co', CO_SHORT: 'co-short', CE: 'ce', PE: 'pe', PO: 'po' };

// Even integer split of `total` over `count` items (sums exactly to total).
function distributePoints(count, total) {
  const base = Math.floor(total / count), rem = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

function parseArgs(argv) {
  const args = { plan: 'CO:2,CE:1', provider: 'deepseek', model: null, concurrency: 3 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--plan') args.plan = argv[++i];
    else if (a === '--provider') args.provider = argv[++i];
    else if (a === '--model') args.model = argv[++i];
    else if (a === '--concurrency') args.concurrency = parseInt(argv[++i], 10);
  }
  return args;
}

// "CO:20,CE:15" → [{skill,theme,seq}, ...]
function buildJobs(planStr) {
  const jobs = [];
  for (const part of planStr.split(',')) {
    const [skill, nStr] = part.split(':');
    const n = parseInt(nStr, 10);
    if (!SKILL_DIR_TAG[skill] || !Number.isFinite(n)) throw new Error(`bad plan part: ${part}`);
    for (let i = 0; i < n; i++) {
      jobs.push({ skill, theme: THEMES[i % THEMES.length], seq: i + 1 });
    }
  }
  return jobs;
}

function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
}

function stripFences(s) {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

// Expand the compact model output into the site's import set.
function expand(skill, raw) {
  const base = {
    title: raw.title,
    year: null,
    description: DESCRIPTIONS[skill] || 'AI 原创，未涉及版权问题。',
    isPublished: false,
    isFreePreview: false,
    questions: [],
  };
  if (skill === 'CO' || skill === 'CO_SHORT' || skill === 'CE') {
    const passages = raw.passages || [];
    const qSkill = skill === 'CE' ? 'CE' : 'CO'; // 短听力题仍属 CO
    base.questions = (raw.questions || []).map((q, i) => ({
      skill: qSkill, type: 'SINGLE', order: i + 1, prompt: q.prompt,
      passage: passages[q.passageIndex || 0] || '',
      audioUrl: null, explanation: q.explanation || '', modelEssay: null,
      points: q.points || 1,
      options: (q.options || []).map((o, oi) => ({
        label: o.label || String.fromCharCode(65 + oi),
        text: o.text, isCorrect: !!o.isCorrect, order: oi,
      })),
      followUps: [],
    }));
    // Force the section to /25 regardless of what the model assigned.
    if (base.questions.length) {
      distributePoints(base.questions.length, 25).forEach((p, i) => { base.questions[i].points = p; });
    }
  } else if (skill === 'PE') {
    base.questions = [{
      skill: 'PE', type: 'ESSAY', order: 1, prompt: raw.prompt, passage: '',
      audioUrl: null, explanation: '参考范文见 modelEssay。评分维度：审题/论证/连贯/词汇/语法。',
      modelEssay: raw.modelEssay || '', points: 25, options: [], followUps: [],
    }];
  } else if (skill === 'PO') {
    const heading = (raw.title || '').split('·').pop().trim();
    base.questions = [{
      skill: 'PO', type: 'SPEAKING', order: 1,
      prompt: `« ${heading} »\n\nDégagez le problème soulevé par ce document, puis présentez votre opinion sur le sujet sous la forme d'un exposé personnel et construit. Vous pourrez ensuite débattre de votre point de vue avec l'examinateur.`,
      passage: raw.stimulus || '', explanation: 'Document support original généré par IA.',
      modelEssay: null, points: 25, options: [],
      followUps: (raw.followUps || []).map((f, i) => ({ order: i, text: f.text, expectedAngle: f.expectedAngle || '' })),
    }];
  }
  return base;
}

async function callModel(client, model, skill, theme) {
  const { system, user } = buildPrompt(skill, theme);
  const resp = await client.chat.completions.create({
    model,
    temperature: 0.8,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  const txt = stripFences(resp.choices[0].message.content || '');
  return JSON.parse(txt);
}

async function generateOne(client, model, job) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await callModel(client, model, job.skill, job.theme);
      const set = expand(job.skill, raw);
      rebalanceSet(set);
      const { ok, errors, warnings } = validateSet(set);
      if (ok) return { set, warnings };
      if (attempt === 3) return { set, errors };
    } catch (e) {
      if (attempt === 3) return { error: e.message };
    }
  }
}

async function runPool(jobs, worker, concurrency) {
  let idx = 0;
  const results = [];
  async function next() {
    while (idx < jobs.length) {
      const my = idx++;
      results[my] = await worker(jobs[my], my);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, next));
  return results;
}

async function main() {
  const args = parseArgs(process.argv);
  const prov = PROVIDERS[args.provider];
  if (!prov) throw new Error(`unknown provider ${args.provider}`);
  const apiKey = process.env[prov.keyEnv];
  if (!apiKey) {
    console.error(`\n✗ ${prov.keyEnv} 未配置。请在 backend/.env 中加入 ${prov.keyEnv}=<你的key> 后重试。`);
    process.exit(1);
  }
  const model = args.model || prov.model;
  const client = new OpenAI({ apiKey, baseURL: prov.baseURL });
  const jobs = buildJobs(args.plan);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`生成 ${jobs.length} 套 | provider=${args.provider} model=${model} concurrency=${args.concurrency}\n`);

  let okCount = 0, rejected = 0;
  const counters = {};
  await runPool(jobs, async (job, i) => {
    const r = await generateOne(client, model, job);
    counters[job.skill] = (counters[job.skill] || 0) + 1;
    const nn = String(counters[job.skill]).padStart(2, '0');
    const fname = `${FILE_PREFIX[job.skill]}-${slug(job.theme)}-${nn}.import.json`;
    if (r && r.set && !r.errors && !r.error) {
      fs.writeFileSync(path.join(OUT_DIR, fname), JSON.stringify(r.set, null, 2));
      okCount++;
      console.log(`✓ [${i + 1}/${jobs.length}] ${fname}${r.warnings && r.warnings.length ? `  (warn: ${r.warnings.join('; ')})` : ''}`);
    } else {
      rejected++;
      fs.mkdirSync(REJECT_DIR, { recursive: true });
      const why = r && (r.error || (r.errors && r.errors.join('; '))) || 'unknown';
      if (r && r.set) fs.writeFileSync(path.join(REJECT_DIR, fname), JSON.stringify(r.set, null, 2));
      console.log(`✗ [${i + 1}/${jobs.length}] ${fname} — ${why}`);
    }
  }, args.concurrency);

  console.log(`\n完成：${okCount} 套通过，${rejected} 套打回（见 _rejected/）。输出目录：AI question/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
