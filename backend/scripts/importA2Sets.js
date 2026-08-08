// Import AI-generated A2 sets (AI question/A2/<skill>/*.import.json) into the DB
// through the same validation + transaction path as the admin import API.
//
// Idempotent: sets whose title already exists in the DB are skipped, safe to re-run.
//
// Usage:
//   cd backend
//   node scripts/importA2Sets.js --skills=CE,PE,PO           # dry-run
//   node scripts/importA2Sets.js --skills=CE,PE,PO --apply   # actually import (as drafts)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../src/prisma');
const {
  bulkImportSchema,
  validateQuestionShape,
  createExamSetWithQuestions,
} = require('../src/services/examImport');

const APPLY = process.argv.includes('--apply');
const skillsArg = (process.argv.find((a) => a.startsWith('--skills=')) || '--skills=CE,PE,PO').split('=')[1];
const skills = skillsArg.split(',').map((s) => s.trim().toUpperCase());
const levelArg = (process.argv.find((a) => a.startsWith('--level=')) || '--level=A2').split('=')[1].toUpperCase();
const baseDir = path.join(__dirname, '..', '..', 'AI question', levelArg);

(async () => {
  const existing = new Set((await prisma.examSet.findMany({ select: { title: true } })).map((s) => s.title));
  let ok = 0; let skip = 0; let fail = 0;
  for (const skill of skills) {
    const dir = path.join(baseDir, skill);
    if (!fs.existsSync(dir)) { console.error(`目录不存在: ${dir}`); continue; }
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.import.json')).sort()) {
      let data;
      try {
        data = bulkImportSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
        for (const [i, q] of data.questions.entries()) {
          const err = validateQuestionShape(q);
          if (err) throw new Error(`Q${i + 1}: ${err}`);
        }
      } catch (e) {
        console.error(`✗ ${skill}/${f} 校验失败: ${e.message}`);
        fail++;
        continue;
      }
      if (existing.has(data.title)) { console.log(`- 跳过（同名已存在）: ${skill}/${f}`); skip++; continue; }
      if (!APPLY) { console.log(`dry-run 将导入: ${skill}/${f} -> ${data.title} [${data.level}]`); ok++; continue; }
      try {
        // 与 POST /api/admin/exams/import 相同的事务路径（含标题清洗、createMany 批量插入）
        const created = await prisma.$transaction(
          (tx) => createExamSetWithQuestions(tx, { ...data, questions: data.questions }),
          { maxWait: 10000, timeout: 30000 },
        );
        existing.add(data.title);
        console.log(`✓ ${skill}/${f} -> ${created.id}（${data.questions.length} 题, level=${created.level}, 草稿）`);
        ok++;
      } catch (e) {
        console.error(`✗ ${skill}/${f} 导入失败: ${e.message}`);
        fail++;
      }
    }
  }
  console.log(`\n${APPLY ? '导入' : 'dry-run'} 完成：成功 ${ok}，跳过 ${skip}，失败 ${fail}`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
})();
