// Adds USD + EUR Price rows alongside the existing CNY prices for each paid
// Product (STANDARD / AI / AI_UNLIMITED). Yearly applies the same 17% off
// pattern as CNY ("10 months for the price of 12").
//
// Re-runnable: keyed by Price.code via upsert, so existing rows are updated
// (e.g. if you adjust the matrix below) and missing rows are created. Will
// NOT touch CNY rows — those keep their original codes (STANDARD_1M etc.).
//
// Usage:
//   cd backend
//   node scripts/seedMultiCurrencyPrices.js

const prisma = require('../src/prisma');

// amountCents per (plan, currency, months). Keep this matrix in one place
// so changing a price is a one-line edit. Numbers below were chosen to match
// the "minor unit" pricing implied by the existing i18n drafts.
const MATRIX = {
  STANDARD: {
    USD: { 1: 490,  12: 4900  }, // $4.90 / $49
    EUR: { 1: 450,  12: 4500  }, // €4.50 / €45
  },
  AI: {
    USD: { 1: 990,  12: 9900  }, // $9.90 / $99
    EUR: { 1: 890,  12: 8900  }, // €8.90 / €89
  },
  AI_UNLIMITED: {
    USD: { 1: 1490, 12: 14900 }, // $14.90 / $149
    EUR: { 1: 1390, 12: 13900 }, // €13.90 / €139
  },
};

async function main() {
  const products = await prisma.product.findMany({
    where: { plan: { in: Object.keys(MATRIX) } },
  });

  let upserts = 0;
  for (const product of products) {
    const rows = MATRIX[product.plan];
    if (!rows) continue;

    for (const [currency, monthsMap] of Object.entries(rows)) {
      for (const [monthsStr, amountCents] of Object.entries(monthsMap)) {
        const months = Number(monthsStr);
        const code = `${product.plan}_${months}M_${currency}`;
        const name = `${product.name} · ${months === 1 ? 'monthly' : 'yearly'} (${currency})`;

        await prisma.price.upsert({
          where: { code },
          update: {
            amountCents,
            name,
            active: true,
            // Don't override currency / months / supportsAutoRenew on update —
            // those are stable for a given code.
          },
          create: {
            productId: product.id,
            code,
            name,
            months,
            currency,
            amountCents,
            // Only monthly prices are auto-renewable; yearly is one-shot to
            // mirror the CNY rows.
            supportsAutoRenew: months === 1,
            active: true,
          },
        });
        upserts += 1;
      }
    }
  }

  console.log(`✅ upserted ${upserts} Price rows (USD + EUR for ${products.length} products)`);
  await prisma.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
