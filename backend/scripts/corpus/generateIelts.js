// Batch generator for original IELTS Academic single-skill sets.
//
// IELTS twin of generate.js — same provider/pool mechanics, English prompts
// (promptsIelts.js), IELTS validation (validateIelts.js). Output sets carry
// system: "IELTS" + level: "IELTS_AC" and import through the standard admin
// bulk-import channel unchanged.
//
// Examples:
//   node scripts/corpus/generateIelts.js --plan READING:2,LISTENING:1     # quick test
//   node scripts/corpus/generateIelts.js --plan LISTENING:10,READING:10,WRITING_T1:4,WRITING_T2:6,SPEAKING:8
//
// Listening audio afterwards (single narrator voice; rotate --narrator for
// accent variety across sets — e.g. alloy / onyx / nova / fable):
//   node scripts/corpus/tts.js "../AI question/ielts/li-<theme>-01.import.json" --narrator onyx
// then upload via the existing R2 + AudioDocument backfill flow.
//
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const OpenAI = require('openai');
const { buildPrompt } = require('./promptsIelts');
const { validateIeltsSet } = require('./validateIelts');

const OUT_DIR = path.join(__dirname, '../../../AI question/ielts');
const REJECT_DIR = path.join(OUT_DIR, '_rejected');

const PROVIDERS = {
  deepseek: { baseURL: 'https://api.deepseek.com', keyEnv: 'DEEPSEEK_API_KEY', model: 'deepseek-chat' },
  openai: { baseURL: undefined, keyEnv: 'OPENAI_API_KEY', model: 'gpt-4o-mini' },
};

const THEMES = [
  'environment', 'urban planning', 'education', 'technology', 'health', 'media',
  'work and careers', 'consumer behaviour', 'transport', 'culture', 'travel',
  'science and research', 'tourism', 'wildlife conservation', 'communication',
];

const SKILL_OF = {
  LISTENING: 'LISTENING', READING: 'READING',
  WRITING_T1: 'WRITING', WRITING_T2: 'WRITING', SPEAKING: 'SPEAKING',
};
const FILE_PREFIX = {
  LISTENING: 'li', READING: 'rd', WRITING_T1: 'w1', WRITING_T2: 'w2', SPEAKING: 'sp',
};
const DESCRIPTIONS = {
  LISTENING: 'AI 原创雅思听力（单段独白），未涉及版权问题。',
  READING: 'AI 原创雅思学术阅读（单篇），未涉及版权问题。',
  WRITING_T1: 'AI 原创雅思写作 Task 1（含参考范文），未涉及版权问题。',
  WRITING_T2: 'AI 原创雅思写作 Task 2（含参考范文），未涉及版权问题。',
  SPEAKING: 'AI 原创雅思口语话题卡（Part 1/2/3），未涉及版权问题。',
};

const TFNG_OPTIONS = (answer) => ['TRUE', 'FALSE', 'NOT GIVEN'].map((t, i) => ({
  label: String.fromCharCode(65 + i),
  text: t,
  isCorrect: t === String(answer || '').toUpperCase().trim(),
  order: i,
}));

function parseArgs(argv) {
  const args = { plan: 'READING:1', provider: 'deepseek', model: null, concurrency: 3 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--plan') args.plan = argv[++i];
    else if (a === '--provider') args.provider = argv[++i];
    else if (a === '--model') args.model = argv[++i];
    else if (a === '--concurrency') args.concurrency = parseInt(argv[++i], 10);
  }
  return args;
}

function buildJobs(planStr) {
  const jobs = [];
  for (const part of planStr.split(',')) {
    const [kind, nStr] = part.split(':');
    const n = parseInt(nStr, 10);
    if (!SKILL_OF[kind] || !Number.isFinite(n)) throw new Error(`bad plan part: ${part}`);
    for (let i = 0; i < n; i++) {
      jobs.push({ kind, theme: THEMES[i % THEMES.length], seq: i + 1 });
    }
  }
  return jobs;
}

function slug(s) {
  return s.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
}

function stripFences(s) {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

// Expand the compact model output into the site's import set.
function expand(kind, raw) {
  const skill = SKILL_OF[kind];
  const base = {
    title: raw.title,
    year: null,
    description: DESCRIPTIONS[kind],
    isPublished: false,
    isFreePreview: false,
    system: 'IELTS',
    level: 'IELTS_AC',
    questions: [],
  };
  if (kind === 'LISTENING' || kind === 'READING') {
    const passages = raw.passages || [];
    base.questions = (raw.questions || []).map((q, i) => {
      const type = String(q.type || 'SINGLE').toUpperCase();
      let options = [];
      if (type === 'TFNG') {
        options = TFNG_OPTIONS(q.answer);
      } else if (type === 'COMPLETION' || type === 'SHORT_ANSWER') {
        // Accepted answers live in correct options' text (grader FILL family).
        options = (q.answers || []).map((a, ai) => ({
          label: String.fromCharCode(65 + ai), text: String(a).trim(), isCorrect: true, order: ai,
        }));
      } else {
        options = (q.options || []).map((o, oi) => ({
          label: o.label || String.fromCharCode(65 + oi),
          text: o.text, isCorrect: !!o.isCorrect, order: oi,
        }));
      }
      return {
        skill, type, order: i + 1, prompt: q.prompt,
        passage: passages[q.passageIndex || 0] || '',
        audioUrl: null, explanation: q.explanation || '', modelEssay: null,
        points: 1, options, followUps: [],
      };
    });
  } else if (kind === 'WRITING_T1' || kind === 'WRITING_T2') {
    base.questions = [{
      skill: 'WRITING', type: 'ESSAY', order: 1, prompt: raw.prompt, passage: '',
      audioUrl: null,
      explanation: '参考范文见 modelEssay。评分标准：TA/TR、CC、LR、GRA 四项 band 等权。',
      modelEssay: raw.modelEssay || '', points: 9, options: [], followUps: [],
    }];
  } else if (kind === 'SPEAKING') {
    base.questions = [{
      skill: 'SPEAKING', type: 'SPEAKING', order: 1,
      prompt: raw.cueCard || '',
      passage: '',
      explanation: 'AI 原创话题卡。Part 1 问题在前，Part 3 在后。',
      modelEssay: null, points: 9, options: [],
      followUps: (raw.followUps || []).map((f, i) => ({
        order: i,
        text: f.text,
        expectedAngle: f.expectedAngle || '',
      })),
    }];
  }
  return base;
}

async function callModel(client, model, kind, theme) {
  const { system, user } = buildPrompt(kind, theme);
  const resp = await client.chat.completions.create({
    model,
    temperature: 0.8,
    max_tokens: 5000,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  return JSON.parse(stripFences(resp.choices[0].message.content || ''));
}

async function generateOne(client, model, job) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const raw = await callModel(client, model, job.kind, job.theme);
      const set = expand(job.kind, raw);
      const { ok, errors, warnings } = validateIeltsSet(set);
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

  console.log(`生成 ${jobs.length} 套 IELTS | provider=${args.provider} model=${model} concurrency=${args.concurrency}\n`);

  let okCount = 0, rejected = 0;
  const counters = {};
  await runPool(jobs, async (job, i) => {
    const r = await generateOne(client, model, job);
    counters[job.kind] = (counters[job.kind] || 0) + 1;
    const nn = String(counters[job.kind]).padStart(2, '0');
    const fname = `${FILE_PREFIX[job.kind]}-${slug(job.theme)}-${nn}.import.json`;
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

  console.log(`\n完成：${okCount} 套通过，${rejected} 套打回（见 _rejected/）。输出目录：AI question/ielts/`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { expand };
