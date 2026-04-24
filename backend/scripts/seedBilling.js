// Seed default Product/Price catalog. Idempotent: uses upsert by code.
// Run:  node scripts/seedBilling.js

const { PrismaClient } = require('@prisma/client');
const { DEFAULT_PRODUCTS } = require('../src/constants/pricing');

const prisma = new PrismaClient();

async function main() {
  for (const p of DEFAULT_PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { code: p.code },
      create: { code: p.code, name: p.name, plan: p.plan, active: true },
      update: { name: p.name, plan: p.plan, active: true },
    });

    for (const pr of p.prices) {
      await prisma.price.upsert({
        where: { code: pr.code },
        create: {
          code: pr.code,
          productId: product.id,
          months: pr.months,
          currency: 'CNY',
          amountCents: pr.amountCents,
          supportsAutoRenew: pr.supportsAutoRenew,
          active: true,
        },
        update: {
          productId: product.id,
          months: pr.months,
          amountCents: pr.amountCents,
          supportsAutoRenew: pr.supportsAutoRenew,
          active: true,
        },
      });
    }
    console.log(`[seed-billing] upserted ${p.code} with ${p.prices.length} price(s)`);
  }
}

main()
  .catch((e) => {
    console.error('[seed-billing] failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
