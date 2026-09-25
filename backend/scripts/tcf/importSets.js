/* eslint-disable no-console */
// TCF pipeline step 4 — import content/tcf-sets/*.import.json into the DB
// through the same validation + transaction path as POST /api/admin/exams/import
// (mirrors scripts/importA2Sets.js).
//
// Idempotent: sets whose title already exists are skipped, safe to re-run.
//
// Usage:
//   cd backend
//   node scripts/tcf/importSets.js                 # dry-run
//   node scripts/tcf/importSets.js --apply         # import as drafts
//   node scripts/tcf/importSets.js --apply --publish   # import as published
//   node scripts/tcf/importSets.js --apply 1 2 3   # selected booklets
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../../src/prisma');
const { validateSystemLevel } = require('../../src/constants/systems');
const {
  bulkImportSchema,
  validateQuestionShape,
  validateQuestionForSystem,
  createExamSetWithQuestions,
} = require('../../src/services/examImport');

const APPLY = process.argv.includes('--apply');
const PUBLISH = process.argv.includes('--publish');
const only = process.argv.slice(2).map(Number).filter(Boolean);
const DIR = path.join(__dirname, '..', '..', 'content', 'tcf-sets');

(async () => {
  const files = fs.readdirSync(DIR)
    .filter((f) => /^tcf-(\d+)(-\w+)?\.import\.json$/.test(f))
    .filter((f) => !only.length || only.includes(Number(f.match(/^tcf-(\d+)/)[1])))
    .sort();
  const existing = new Set((await prisma.examSet.findMany({ where: { system: 'TCF' }, select: { title: true } })).map((s) => s.title));
  let ok = 0; let skip = 0; let fail = 0;
  for (const f of files) {
    let data;
    try {
      data = bulkImportSchema.parse(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
      const sysErr = validateSystemLevel(data.system, data.level);
      if (sysErr) throw new Error(sysErr);
      for (const [i, q] of data.questions.entries()) {
        const err = validateQuestionShape(q) || validateQuestionForSystem(q, data.system);
        if (err) throw new Error(`Q${i + 1}: ${err}`);
      }
    } catch (e) {
      console.error(`✗ ${f} 校验失败: ${e.message}`);
      fail++;
      continue;
    }
    if (existing.has(data.title)) { console.log(`- 跳过（同名已存在）: ${f}`); skip++; continue; }
    if (!APPLY) { console.log(`dry-run 将导入: ${f} -> ${data.title} (${data.questions.length} 题)`); ok++; continue; }
    try {
      const created = await prisma.$transaction(
        (tx) => createExamSetWithQuestions(tx, { ...data, isPublished: PUBLISH, questions: data.questions }),
        { maxWait: 10000, timeout: 30000 },
      );
      existing.add(data.title);
      console.log(`✓ ${f} -> ${created.id}（${data.questions.length} 题, ${PUBLISH ? '已发布' : '草稿'}）`);
      ok++;
    } catch (e) {
      console.error(`✗ ${f} 导入失败: ${e.message}`);
      fail++;
    }
  }
  console.log(`\n${APPLY ? '导入' : 'dry-run'} 完成：成功 ${ok}，跳过 ${skip}，失败 ${fail}`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})();
