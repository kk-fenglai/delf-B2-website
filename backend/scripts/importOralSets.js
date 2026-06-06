// Bulk-import PO exam sets from content/oral-sets/*.import.json into the DB.
//
// Usage:
//   cd backend
//   node scripts/importOralSets.js          # import all oral-*.import.json
//   node scripts/importOralSets.js oral-01  # import one file (basename, no ext)
//
// Each file becomes one ExamSet with a single SPEAKING question + follow-ups.
// Sets are published (isPublished=true). First 3 sets are free preview by default.

const path = require('path');
const fs = require('fs');
const prisma = require('../src/prisma');
const { resolveExamSetYear } = require('../src/utils/examSetYear');
const { sanitizeExamTitle, sanitizeExamDescription } = require('../src/utils/examTitle');

const outDir = path.join(__dirname, '..', 'content', 'oral-sets');

function assert(cond, msg) {
  if (!cond) { console.error('❌ ' + msg); process.exit(1); }
}

async function importOne(filePath, { freePreview = false } = {}) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert(typeof data.title === 'string' && data.title.length > 0, `${filePath}: title required`);
  assert(Array.isArray(data.questions) && data.questions.length > 0, `${filePath}: questions[] required`);

  const q = data.questions[0];
  assert(q.skill === 'PO' && q.type === 'SPEAKING', `${filePath}: expected one PO SPEAKING question`);
  assert(Array.isArray(q.followUps) && q.followUps.length >= 1, `${filePath}: followUps required`);

  const existing = await prisma.examSet.findFirst({ where: { title: sanitizeExamTitle(data.title) } });

  const skills = ['PO'];
  const cleanTitle = sanitizeExamTitle(data.title);
  const cleanDesc = data.description != null ? sanitizeExamDescription(data.description) : null;
  const resolvedYear = resolveExamSetYear({ title: data.title, year: data.year, skills });

  if (existing) {
    await prisma.questionOption.deleteMany({
      where: { question: { examSetId: existing.id } },
    });
    await prisma.oralFollowUp.deleteMany({
      where: { question: { examSetId: existing.id } },
    });
    await prisma.question.deleteMany({ where: { examSetId: existing.id } });
    await prisma.examSet.update({
      where: { id: existing.id },
      data: {
        year: resolvedYear,
        description: cleanDesc,
        isPublished: true,
        isFreePreview: freePreview || !!data.isFreePreview,
      },
    });
  }

  const examSet = existing || await prisma.examSet.create({
    data: {
      title: cleanTitle,
      year: resolvedYear,
      description: cleanDesc,
      isPublished: true,
      isFreePreview: freePreview || !!data.isFreePreview,
    },
  });

  const created = await prisma.question.create({
    data: {
      examSetId: examSet.id,
      skill: q.skill,
      type: q.type,
      order: q.order ?? 1,
      prompt: q.prompt,
      passage: q.passage || null,
      audioUrl: q.audioUrl || null,
      explanation: q.explanation || null,
      points: q.points || 25,
    },
  });

  await prisma.oralFollowUp.createMany({
    data: q.followUps.map((f, fi) => ({
      questionId: created.id,
      order: f.order ?? fi,
      text: f.text,
      audioUrl: f.audioUrl || null,
      expectedAngle: f.expectedAngle || null,
    })),
  });

  return { title: data.title, examSetId: examSet.id, action: existing ? 'updated' : 'created' };
}

async function main() {
  assert(fs.existsSync(outDir), `Directory not found: ${outDir}`);

  const arg = process.argv[2];
  let files;
  if (arg) {
    const base = arg.endsWith('.import.json') ? arg : `${arg}.import.json`;
    const fp = path.join(outDir, base);
    assert(fs.existsSync(fp), `File not found: ${fp}`);
    files = [fp];
  } else {
    files = fs.readdirSync(outDir)
      .filter((f) => /^oral-\d+\.import\.json$/.test(f))
      .sort()
      .map((f) => path.join(outDir, f));
  }

  assert(files.length > 0, 'No oral-*.import.json files found');

  console.log(`📄 Importing ${files.length} oral set(s)...`);
  let created = 0;
  let updated = 0;

  for (let i = 0; i < files.length; i++) {
    const freePreview = i < 3;
    const result = await importOne(files[i], { freePreview });
    if (result.action === 'created') created += 1;
    else updated += 1;
    console.log(`   ${result.action === 'created' ? '+' : '↻'} ${result.title}`);
  }

  console.log(`\n✅ Done — ${created} created, ${updated} updated (${files.length} total)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
