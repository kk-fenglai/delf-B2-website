// One-off production fix for listening (CO) audio.
//
// A) For PUBLISHED CO sets whose questions point at /api/audio/fei/<real>.<ext>
//    (the dead Fly mount), rewrite audioUrl -> the R2 base, then create one
//    AudioDocument per distinct audioUrl and link Question.audioDocumentId so
//    the runner (which serves CO audio from audioDocuments[] only) can play it.
// B) Delete redundant DRAFT sets whose CO audioUrl already points at the R2 base
//    (duplicates of the A-group, re-imported earlier). examSession rows are
//    cleared first to satisfy the FK, matching adminExams.js delete.
//
// Idempotent: re-running skips questions that already have audioDocumentId and
// reuses AudioDocuments matched by audioUrl. Dry-run by default; --apply to write.
//
// Usage:
//   cd backend
//   node scripts/fixProdListeningAudio.js          # dry-run
//   node scripts/fixProdListeningAudio.js --apply

const prisma = require('../src/prisma');

const APPLY = process.argv.includes('--apply');
const R2_BASE = 'https://pub-72b0969c5978483fb68d6403d707896a.r2.dev';
const FEI_PREFIX = '/api/audio/fei/';

// The 9 genuine listening recordings (basename incl. extension). Anything else
// behind /api/audio/fei/ (e.g. co-demo-*.wav test clips) is left untouched.
const REAL_FILES = new Set([
  'long-2021-05-cn.m4a', 'long-2021-11-cn.m4a', 'long-2022-03-cn.mp3',
  'long-2023-11-cn.m4a', 'long-2024-03-fr.m4a',
  'short-2021-11-cn.m4a', 'short-2022-03-cn.m4a',
  'short-2023-11-cn.m4a', 'short-2024-01-fr.m4a',
]);

function feiToR2(url) {
  if (typeof url !== 'string' || !url.startsWith(FEI_PREFIX)) return null;
  const file = url.slice(FEI_PREFIX.length).split('?')[0];
  if (!REAL_FILES.has(file)) return null;
  return `${R2_BASE}/${file}`;
}

async function main() {
  const sets = await prisma.examSet.findMany({
    include: {
      questions: { where: { skill: 'CO' }, orderBy: { order: 'asc' } },
      audioDocuments: { orderBy: { order: 'asc' } },
    },
  });

  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — scanning ${sets.length} sets\n`);

  let urlsRewritten = 0, docsCreated = 0, qsLinked = 0;
  const deletes = [];

  for (const set of sets) {
    const coQs = set.questions;
    if (coQs.length === 0) continue;

    // ---- B group: draft + already on R2 → delete as redundant duplicate ----
    const isDraftR2 = !set.isPublished
      && coQs.some((q) => typeof q.audioUrl === 'string' && q.audioUrl.startsWith(R2_BASE));
    if (isDraftR2) {
      deletes.push(set);
      console.log(`DEL  [draft] ${set.title}  (CO=${coQs.length})`);
      continue;
    }

    // ---- A group: published + /api/audio/fei/<real> → rewrite + backfill ----
    const targets = coQs.filter((q) => feiToR2(q.audioUrl));
    if (!set.isPublished || targets.length === 0) continue;

    console.log(`FIX  ${set.title}  (CO=${coQs.length}, fei->R2=${targets.length})`);

    // 1) rewrite audioUrl on the questions
    for (const q of targets) {
      const newUrl = feiToR2(q.audioUrl);
      console.log(`       url: ${q.audioUrl} -> ${newUrl}`);
      if (APPLY) await prisma.question.update({ where: { id: q.id }, data: { audioUrl: newUrl } });
      q.audioUrl = newUrl;
      urlsRewritten++;
    }

    // 2) group CO questions (now on R2) into AudioDocuments, link audioDocumentId
    const existingByUrl = new Map(
      set.audioDocuments.filter((d) => d.audioUrl).map((d) => [d.audioUrl, d])
    );
    const buckets = new Map();
    for (const q of coQs) {
      if (q.audioDocumentId) continue; // already linked → idempotent skip
      const key = q.audioUrl || '__no_audio__';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(q);
    }

    let nextOrder = set.audioDocuments.length;
    for (const [url, qs] of buckets.entries()) {
      const audioUrl = url === '__no_audio__' ? null : url;
      let doc = audioUrl ? existingByUrl.get(audioUrl) : null;
      if (!doc) {
        const data = {
          examSetId: set.id,
          order: nextOrder++,
          title: `Document ${nextOrder}`,
          audioUrl,
          maxPlays: 2, prepSeconds: 60, gapSeconds: 180, answerSeconds: 0,
        };
        if (APPLY) doc = await prisma.audioDocument.create({ data });
        else doc = { id: `(new-${nextOrder})`, ...data };
        docsCreated++;
        console.log(`       +doc ${doc.id} url=${audioUrl} qs=${qs.length}`);
      }
      for (const q of qs) {
        if (APPLY) await prisma.question.update({ where: { id: q.id }, data: { audioDocumentId: doc.id } });
        qsLinked++;
      }
    }
  }

  // Perform B-group deletes (sessions first, then the set)
  for (const set of deletes) {
    if (APPLY) {
      await prisma.$transaction([
        prisma.examSession.deleteMany({ where: { examSetId: set.id } }),
        prisma.examSet.delete({ where: { id: set.id } }),
      ]);
    }
  }

  console.log(`\nSummary: urlsRewritten=${urlsRewritten}, docsCreated=${docsCreated}, qsLinked=${qsLinked}, draftSetsDeleted=${deletes.length}`);
  if (!APPLY) console.log('(dry-run; re-run with --apply to write)');
  await prisma.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
