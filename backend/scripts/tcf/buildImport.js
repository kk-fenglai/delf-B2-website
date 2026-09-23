/* eslint-disable no-console */
// TCF pipeline step 3 — turn the proofread items.json of each booklet into
// import JSON for POST /api/admin/exams/import (bulkImportSchema, system TCF).
//
// Per booklet N it writes FOUR sets (mirrors the DELF layout: full mock set +
// pure single-skill sets, because GET /api/exams?skill= only lists sets that
// contain exactly one skill):
//   tcf-NN.import.json      CO 1–15 + SL 16–25 + CE 26–40  (全真模拟)
//   tcf-NN-co.import.json   CO only
//   tcf-NN-sl.import.json   SL only
//   tcf-NN-ce.import.json   CE only
//
// Asset URLs (audio, pictures) point at R2: <R2_PUBLIC_BASE>/tcf/audio/tcfN.mp3
// and <R2_PUBLIC_BASE>/tcf/img/tcfN-<file>. Run uploadAssets.js to put them there.
//
// Usage:
//   cd backend
//   node scripts/tcf/buildImport.js            # all booklets with items.json
//   node scripts/tcf/buildImport.js 1 2 3      # selected
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { bulkImportSchema, validateQuestionShape, validateQuestionForSystem } = require('../../src/services/examImport');

const WORK = path.join(__dirname, '..', '..', 'content', 'tcf-sets', '_work');
const OUT = path.join(__dirname, '..', '..', 'content', 'tcf-sets');
const BASE = (process.env.R2_PUBLIC_BASE || 'https://R2_PUBLIC_BASE').replace(/\/+$/, '');

const SECTION_FR = { CO: 'Compréhension orale', SL: 'Structures de la langue', CE: 'Compréhension écrite' };
const SECTION_ZH = { CO: '听力', SL: '语法结构', CE: '阅读' };

const audioUrl = (n) => `${BASE}/tcf/audio/tcf${n}.mp3`;
const imageUrl = (n, file) => `${BASE}/tcf/img/tcf${n}-${file}`;

function toQuestion(n, it) {
  const img = it.image ? `![Image](${imageUrl(n, it.image)})` : null;
  const opts = it.options.map((o, j) => ({
    label: o.label,
    // Picture / audio-only items print bare letters; the schema needs text.
    text: o.text && o.text.trim() ? o.text.trim() : `Proposition ${o.label}`,
    isCorrect: o.label === it.answer,
    order: j,
  }));
  const q = {
    skill: it.section,
    type: 'SINGLE',
    order: it.n,
    prompt: it.prompt.trim(),
    passage: null,
    explanation: null,
    points: 1,
    options: opts,
  };
  if (it.section === 'CO') {
    // Picture in the prompt (CO passage is scrubbed client-side, prompt is not).
    if (img) q.prompt = `${img}\n${q.prompt}`;
    q.audioUrl = audioUrl(n);
    // Transcript lives in `passage` like the DELF CO sets (hidden during the
    // exam, available for review); spoken options go to the explanation.
    q.passage = it.transcript || null;
    if (it.spokenOptions && it.spokenOptions.length) {
      q.explanation = `Propositions entendues :\n${it.spokenOptions.join('\n')}`;
    }
  } else if (it.section === 'CE') {
    q.passage = [it.needsImage && img ? img : null, it.passage || null].filter(Boolean).join('\n\n') || null;
  }
  return q;
}

function buildSet(n, items, sections) {
  const num = String(n).padStart(2, '0');
  const label = sections.length === 3 ? 'Test complet' : SECTION_FR[sections[0]];
  const zh = sections.length === 3 ? '听力 + 语法 + 阅读 全卷' : SECTION_ZH[sections[0]];
  const questions = items.filter((it) => sections.includes(it.section)).map((it) => toQuestion(n, it));
  return {
    title: `TCF · Entraînement ${num} · ${label}`,
    year: null,
    description: `TCF 训练卷 ${num} · ${zh}（${questions.length} 题，四选一，每题 1 分）。素材：TV5MONDE « Livret d’entraînement n°${n} » (France Éducation International)。`,
    isPublished: false,
    isFreePreview: false,
    system: 'TCF',
    level: 'TCF_TP',
    questions,
  };
}

function main() {
  const only = process.argv.slice(2).map(Number).filter(Boolean);
  const dirs = fs.readdirSync(WORK).filter((d) => /^tcf\d+$/.test(d) && fs.existsSync(path.join(WORK, d, 'items.json')));
  const ns = dirs.map((d) => Number(d.slice(3))).filter((n) => !only.length || only.includes(n)).sort((a, b) => a - b);
  let bad = 0;
  for (const n of ns) {
    const data = JSON.parse(fs.readFileSync(path.join(WORK, `tcf${n}`, 'items.json'), 'utf8'));
    const items = data.items.slice().sort((a, b) => a.n - b.n);
    const problems = [];
    if (items.length !== 40) problems.push(`expected 40 items, got ${items.length}`);
    items.forEach((it, i) => {
      if (it.n !== i + 1) problems.push(`item numbering gap at ${it.n}`);
      if (!it.prompt || !it.prompt.trim()) problems.push(`item ${it.n}: empty prompt`);
      if (!Array.isArray(it.options) || it.options.length !== 4) problems.push(`item ${it.n}: needs 4 options`);
      if (!['A', 'B', 'C', 'D'].includes(it.answer)) problems.push(`item ${it.n}: bad answer ${it.answer}`);
      if (it.section === 'CE' && !it.passage && !it.image) problems.push(`item ${it.n}: CE without passage/image`);
    });
    const sets = [
      ['', ['CO', 'SL', 'CE']],
      ['-co', ['CO']],
      ['-sl', ['SL']],
      ['-ce', ['CE']],
    ];
    for (const [suffix, sections] of sets) {
      const set = buildSet(n, items, sections);
      const parsed = bulkImportSchema.safeParse(set);
      if (!parsed.success) {
        problems.push(`${suffix || 'full'}: ${JSON.stringify(parsed.error.issues[0])}`);
        continue;
      }
      for (const q of parsed.data.questions) {
        const e = validateQuestionShape(q) || validateQuestionForSystem(q, 'TCF');
        if (e) problems.push(`${suffix || 'full'} q${q.order}: ${e}`);
      }
      const file = path.join(OUT, `tcf-${String(n).padStart(2, '0')}${suffix}.import.json`);
      fs.writeFileSync(file, JSON.stringify(set, null, 2), 'utf8');
    }
    const notes = items.filter((it) => it.notes && it.notes.trim()).length;
    console.log(`tcf${n}: ${problems.length ? 'PROBLEMS ' + problems.join(' | ') : 'OK'} · notes=${notes} · issues=${(data.issues || []).length}`);
    if (problems.length) bad += 1;
  }
  console.log(`\n${ns.length} booklets → ${OUT}`);
  if (bad) process.exit(1);
}

main();
