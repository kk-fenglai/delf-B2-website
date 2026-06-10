// Copy all data from the current Neon DB (us-east-1) to a new Neon project in
// another region (ap-southeast-1, co-located with Fly sin) to kill the ~200ms
// cross-region query latency.
//
// Prereqs:
//   1. Create the new Neon project in the target region; run schema on it:
//        DATABASE_URL="<NEW_URL>" npx prisma migrate deploy
//   2. Then run this copy (reads OLD, writes NEW):
//        OLD_DATABASE_URL="<OLD>" NEW_DATABASE_URL="<NEW>" node scripts/migrateNeonRegion.js
//      Add --verify to only compare row counts without copying.
//
// Models are listed in FK-dependency order (parents first). createMany keeps
// explicit ids so foreign keys line up; skipDuplicates makes re-runs safe.

const { PrismaClient } = require('@prisma/client');

const OLD = process.env.OLD_DATABASE_URL;
const NEW = process.env.NEW_DATABASE_URL;
const VERIFY_ONLY = process.argv.includes('--verify');

if (!OLD || !NEW) {
  console.error('Set OLD_DATABASE_URL and NEW_DATABASE_URL env vars.');
  process.exit(1);
}

// Prisma delegate names in topological (parents-before-children) order.
const MODELS = [
  'user', 'product', 'price', 'priceStripeMapping',
  'examSet', 'readingPassage', 'audioDocument', 'question', 'questionOption',
  'payContract', 'paymentOrder', 'refundOrder',
  'subscription', 'refreshToken', 'emailVerificationToken', 'adminLog',
  'loginHistory', 'passwordResetToken', 'twoFactorToken',
  'examSession', 'userAttempt', 'essay', 'oralFollowUp',
  'recording', 'oral', 'essayTemplate',
];

const CHUNK = 1000;

async function main() {
  const oldDb = new PrismaClient({ datasources: { db: { url: OLD } } });
  const newDb = new PrismaClient({ datasources: { db: { url: NEW } } });

  let mismatches = 0;
  for (const m of MODELS) {
    const rows = await oldDb[m].findMany();
    if (!VERIFY_ONLY && rows.length) {
      for (let i = 0; i < rows.length; i += CHUNK) {
        await newDb[m].createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true });
      }
    }
    const got = await newDb[m].count();
    const ok = got === rows.length;
    if (!ok) mismatches++;
    console.log(`${ok ? 'OK ' : '!! '} ${m.padEnd(24)} old=${rows.length} new=${got}`);
  }

  console.log(VERIFY_ONLY ? `\nverify done. mismatches=${mismatches}` : `\ncopy done. mismatches=${mismatches}`);
  await oldDb.$disconnect();
  await newDb.$disconnect();
  if (mismatches) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
