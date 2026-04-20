// Import a FEI DELF B2 sample paper from a parsed.json file into the DB.
//
// Usage:
//   cd backend
//   unset DATABASE_URL   # see CLAUDE.md #1
//   node scripts/importFeiSample.js b2-tp-exemple1
//
// Reads:  content/fei-samples/<slug>/parsed.json
// Writes: Prisma ExamSet + Question + QuestionOption rows (upsert by title)
//
// Behaviour:
//   - If an ExamSet with the same title already exists, its questions and
//     options are wiped and re-inserted from parsed.json (idempotent).
//   - The description / year / isFreePreview are overwritten.
//   - explanation is auto-suffixed with FEI attribution if not already present.

const path = require('path');
const fs = require('fs');
const prisma = require('../src/prisma');

const FEI_ATTRIBUTION = '— 来源：France Éducation International (FEI 官方 DELF B2 sujet d\'exemple)';

const SKILLS = new Set(['CO', 'CE', 'PE', 'PO']);
const TYPES = new Set(['SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'FILL', 'ESSAY', 'SPEAKING']);

function assert(cond, msg) {
  if (!cond) { console.error('❌ ' + msg); process.exit(1); }
}

function validate(data) {
  assert(typeof data.title === 'string' && data.title.length > 0, 'parsed.json: title required');
  assert(Number.isInteger(data.year), 'parsed.json: year (int) required');
  assert(Array.isArray(data.questions) && data.questions.length > 0, 'parsed.json: questions[] required');
  data.questions.forEach((q, i) => {
    assert(SKILLS.has(q.skill), `q[${i}]: invalid skill "${q.skill}"`);
    assert(TYPES.has(q.type), `q[${i}]: invalid type "${q.type}"`);
    assert(typeof q.prompt === 'string' && q.prompt.length > 0, `q[${i}]: prompt required`);
    assert(Number.isInteger(q.points) && q.points > 0, `q[${i}]: points (positive int) required`);
    if (['SINGLE', 'MULTIPLE', 'TRUE_FALSE'].includes(q.type)) {
      assert(Array.isArray(q.options) && q.options.length >= 2, `q[${i}]: needs >= 2 options for ${q.type}`);
      const correctCount = q.options.filter((o) => o.isCorrect).length;
      if (q.type === 'SINGLE' || q.type === 'TRUE_FALSE') {
        assert(correctCount === 1, `q[${i}]: ${q.type} needs exactly 1 correct option`);
      } else {
        assert(correctCount >= 1, `q[${i}]: MULTIPLE needs >= 1 correct option`);
      }
    }
  });
}

function withAttribution(text) {
  if (!text) return FEI_ATTRIBUTION;
  return text.includes('France Éducation International') ? text : `${text}\n\n${FEI_ATTRIBUTION}`;
}

async function main() {
  const slug = process.argv[2];
  assert(slug, 'Usage: node scripts/importFeiSample.js <slug>  (e.g. b2-tp-exemple1)');

  const jsonPath = path.join(__dirname, '..', 'content', 'fei-samples', slug, 'parsed.json');
  assert(fs.existsSync(jsonPath), `parsed.json not found at ${jsonPath}`);

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  validate(data);

  console.log(`📄 Importing: ${data.title}  (${data.questions.length} questions)`);

  const existing = await prisma.examSet.findFirst({ where: { title: data.title } });

  if (existing) {
    console.log(`   ↻ ExamSet exists (${existing.id}) — wiping old questions/options`);
    await prisma.questionOption.deleteMany({
      where: { question: { examSetId: existing.id } },
    });
    await prisma.question.deleteMany({ where: { examSetId: existing.id } });
    await prisma.examSet.update({
      where: { id: existing.id },
      data: {
        year: data.year,
        description: data.description || null,
        isPublished: true,
        isFreePreview: data.isFreePreview !== false,
      },
    });
  } else {
    console.log('   + creating new ExamSet');
  }

  const examSet = existing || await prisma.examSet.create({
    data: {
      title: data.title,
      year: data.year,
      description: data.description || null,
      isPublished: true,
      isFreePreview: data.isFreePreview !== false,
    },
  });

  for (const [idx, q] of data.questions.entries()) {
    const created = await prisma.question.create({
      data: {
        examSetId: examSet.id,
        skill: q.skill,
        type: q.type,
        order: q.order ?? idx,
        prompt: q.prompt,
        passage: q.passage || null,
        audioUrl: q.audioUrl || null,
        explanation: withAttribution(q.explanation),
        points: q.points,
      },
    });
    if (Array.isArray(q.options) && q.options.length) {
      await prisma.questionOption.createMany({
        data: q.options.map((o, oi) => ({
          questionId: created.id,
          label: o.label,
          text: o.text,
          isCorrect: !!o.isCorrect,
          order: o.order ?? oi,
        })),
      });
    }
  }

  console.log(`✅ Done: ${examSet.title} (examSetId=${examSet.id})`);
  await prisma.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
