// One-off: normalize ExamSet.year — drop bogus 2024 on PO topic cards;
// keep year when title contains a date (2021年3月, 2024-01, etc.).
//
// Usage: cd backend && node scripts/fixExamSetYears.js

const prisma = require('../src/prisma');
const { resolveExamSetYear } = require('../src/utils/examSetYear');

async function main() {
  const sets = await prisma.examSet.findMany({
    include: { questions: { select: { skill: true } } },
  });

  let updated = 0;
  for (const s of sets) {
    const skills = [...new Set(s.questions.map((q) => q.skill))];
    const next = resolveExamSetYear({ title: s.title, year: s.year, skills });
    if (next !== s.year) {
      await prisma.examSet.update({ where: { id: s.id }, data: { year: next } });
      updated += 1;
      console.log(`  ${s.year ?? 'null'} → ${next ?? 'null'} | ${s.title.slice(0, 70)}`);
    }
  }
  console.log(`\n✅ Updated ${updated} / ${sets.length} exam sets`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
