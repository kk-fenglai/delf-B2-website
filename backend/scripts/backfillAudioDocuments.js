// One-shot backfill: for each ExamSet, group existing CO Questions by their
// per-question audioUrl into AudioDocument rows, then point Question.audioDocumentId
// at the right doc.
//
// Idempotent: re-running won't duplicate AudioDocuments — it skips questions
// that already have audioDocumentId set.
//
// Usage:
//   cd backend
//   node scripts/backfillAudioDocuments.js          # dry-run
//   node scripts/backfillAudioDocuments.js --apply  # actually write

const prisma = require('../src/prisma');

const APPLY = process.argv.includes('--apply');

async function main() {
  const sets = await prisma.examSet.findMany({
    include: {
      questions: {
        where: { skill: 'CO' },
        orderBy: { order: 'asc' },
      },
      audioDocuments: { orderBy: { order: 'asc' } },
    },
  });

  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — scanning ${sets.length} exam sets`);

  let docsCreated = 0;
  let questionsLinked = 0;

  for (const set of sets) {
    const coQs = set.questions.filter((q) => !q.audioDocumentId);
    if (coQs.length === 0) continue;

    // Bucket questions by their existing audioUrl (null becomes a single
    // "no-audio" bucket so admins can later attach the same MP3 to all of
    // them in one click). Order within a bucket is preserved.
    const buckets = new Map();
    for (const q of coQs) {
      const key = q.audioUrl || '__no_audio__';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(q);
    }

    // Reuse existing AudioDocuments where audioUrl matches, so re-runs don't
    // duplicate.
    const existingByUrl = new Map(
      set.audioDocuments
        .filter((d) => d.audioUrl)
        .map((d) => [d.audioUrl, d])
    );

    let nextOrder = set.audioDocuments.length;
    for (const [audioUrl, qs] of buckets.entries()) {
      const url = audioUrl === '__no_audio__' ? null : audioUrl;

      let doc = url ? existingByUrl.get(url) : null;
      if (!doc) {
        const data = {
          examSetId: set.id,
          order: nextOrder++,
          title: url ? `Document ${nextOrder}` : `Document ${nextOrder} (no audio)`,
          audioUrl: url,
          // Conservative defaults — admins can edit per DELF rules (Ex.1: 2/180s,
          // Ex.2: 1/0s). We default to "long doc" because that's the more
          // common shape for legacy single-audio imports.
          maxPlays: 2,
          prepSeconds: 60,
          gapSeconds: 180,
          answerSeconds: 0,
        };
        if (APPLY) {
          doc = await prisma.audioDocument.create({ data });
        } else {
          doc = { id: `(new-${nextOrder})`, ...data };
        }
        docsCreated++;
        console.log(`  + set=${set.title}  doc=${doc.id}  url=${url || '<none>'}  qs=${qs.length}`);
      }

      for (const q of qs) {
        if (APPLY) {
          await prisma.question.update({
            where: { id: q.id },
            data: { audioDocumentId: doc.id },
          });
        }
        questionsLinked++;
      }
    }
  }

  console.log(`\nSummary: docs created=${docsCreated}, questions linked=${questionsLinked}`);
  if (!APPLY) console.log('(dry-run; re-run with --apply to write)');
  await prisma.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
