// Re-queue orals that failed because a dev worker could not read Fly-stored audio.
// Usage: cd backend && node scripts/requeueOralSttErrors.js

const prisma = require('../src/prisma');

(async () => {
  const rows = await prisma.oral.findMany({
    where: {
      status: 'error',
      OR: [
        { errorMessage: { contains: 'STT_BAD_AUDIO' } },
        { errorMessage: { contains: 'STT_FILE_MISSING' } },
        { errorMessage: { contains: 'Audio file not found' } },
      ],
    },
    select: { id: true, errorMessage: true },
  });
  if (rows.length === 0) {
    console.log('No orals to re-queue');
    return;
  }
  const res = await prisma.oral.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { status: 'queued', errorMessage: null },
  });
  console.log(`Re-queued ${res.count} oral(s):`);
  rows.forEach((r) => console.log(`  ${r.id} — ${r.errorMessage?.slice(0, 80)}`));
})()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
