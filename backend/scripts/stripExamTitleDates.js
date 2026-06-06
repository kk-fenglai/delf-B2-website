// Remove exam session year/month/region from ExamSet titles (and learner-facing descriptions).
//
// Usage: cd backend && node scripts/stripExamTitleDates.js
//        node scripts/stripExamTitleDates.js --dry-run

const prisma = require('../src/prisma');
const { sanitizeExamTitle, sanitizeExamDescription } = require('../src/utils/examTitle');

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const sets = await prisma.examSet.findMany({
    select: { id: true, title: true, description: true },
  });

  let titleUpdates = 0;
  let descUpdates = 0;

  for (const s of sets) {
    const nextTitle = sanitizeExamTitle(s.title);
    const nextDesc = s.description ? sanitizeExamDescription(s.description) : s.description;
    const titleChanged = nextTitle !== s.title;
    const descChanged = nextDesc !== s.description;

    if (titleChanged || descChanged) {
      if (titleChanged) {
        console.log(`TITLE:\n  - ${s.title}\n  + ${nextTitle}`);
        titleUpdates += 1;
      }
      if (descChanged) {
        console.log(`DESC:  ${s.description?.slice(0, 60)}… → ${nextDesc?.slice(0, 60)}…`);
        descUpdates += 1;
      }
      if (!dryRun) {
        await prisma.examSet.update({
          where: { id: s.id },
          data: {
            ...(titleChanged ? { title: nextTitle } : {}),
            ...(descChanged ? { description: nextDesc } : {}),
          },
        });
      }
    }
  }

  console.log(`\n${dryRun ? '[dry-run] ' : ''}Titles updated: ${titleUpdates}, descriptions: ${descUpdates}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
