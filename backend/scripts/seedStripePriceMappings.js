// Wires Stripe Price IDs into the PriceStripeMapping table.
//
// Run AFTER you have created the recurring (monthly) and one-time (yearly,
// if you want it routed through a Stripe Price) Prices in the Stripe
// Dashboard. The Dashboard gives you a `price_xxxxxxxxx` ID for each; map
// those IDs to your local Price.code values below.
//
// Why this table at all: Stripe `mode: 'subscription'` checkout REQUIRES
// a pre-created Price ID (it rejects inline `price_data`). One-time
// `mode: 'payment'` checkout uses inline price_data so a Stripe Price is
// optional there, but having it mapped lets the customer portal recognise
// the product. See backend/src/services/payments/stripe.js.
//
// Mapping format:
//   STRIPE_PRICE_IDS = {
//     'STANDARD_1M':      'price_aaaaa', // CNY monthly
//     'STANDARD_1M_USD':  'price_bbbbb',
//     'STANDARD_1M_EUR':  'price_ccccc',
//     ...
//   }
// The local Price.code → currency comes from the Price row itself; we
// just bind the right Stripe ID to it.
//
// Re-runnable: upsert by (priceId, currency). To remove a mapping, set its
// value to null / undefined and the script will delete the row.
//
// Usage:
//   cd backend
//   STRIPE_MAPPINGS=path/to/mappings.json node scripts/seedStripePriceMappings.js
//   (or edit STRIPE_PRICE_IDS below and just run the script)

const fs = require('fs');
const path = require('path');
const prisma = require('../src/prisma');

// ============================================================
// EDIT HERE: paste the price_xxx values from the Stripe Dashboard.
// Keys must match the Price.code values in your DB. Leave a value as
// empty string / null to skip / remove a mapping.
// ============================================================
const STRIPE_PRICE_IDS = {
  // CNY (China-domestic users via Stripe China-direct integration)
  STANDARD_1M:           '', // e.g. 'price_1QabcCNYstandardMo'
  STANDARD_12M:          '',
  AI_1M:                 '',
  AI_12M:                '',
  AI_UNLIMITED_1M:       '',
  AI_UNLIMITED_12M:      '',

  // USD
  STANDARD_1M_USD:       '',
  STANDARD_12M_USD:      '',
  AI_1M_USD:             '',
  AI_12M_USD:            '',
  AI_UNLIMITED_1M_USD:   '',
  AI_UNLIMITED_12M_USD:  '',

  // EUR
  STANDARD_1M_EUR:       '',
  STANDARD_12M_EUR:      '',
  AI_1M_EUR:             '',
  AI_12M_EUR:            '',
  AI_UNLIMITED_1M_EUR:   '',
  AI_UNLIMITED_12M_EUR:  '',
};

function loadMappings() {
  // Optional JSON file override: lets you keep Stripe IDs out of git.
  const file = process.env.STRIPE_MAPPINGS;
  if (!file) return STRIPE_PRICE_IDS;
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error(`STRIPE_MAPPINGS file not found: ${abs}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

async function main() {
  const mappings = loadMappings();

  let upserts = 0;
  let deletes = 0;
  let skipped = 0;
  const missingCodes = [];

  for (const [code, rawId] of Object.entries(mappings)) {
    const stripeId = String(rawId || '').trim();
    const price = await prisma.price.findUnique({ where: { code } });
    if (!price) {
      missingCodes.push(code);
      continue;
    }

    if (!stripeId) {
      // Empty/null → remove any existing mapping for this (priceId, currency).
      const existing = await prisma.priceStripeMapping.findUnique({
        where: { priceId_currency: { priceId: price.id, currency: price.currency } },
      });
      if (existing) {
        await prisma.priceStripeMapping.delete({ where: { id: existing.id } });
        deletes += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    await prisma.priceStripeMapping.upsert({
      where: { priceId_currency: { priceId: price.id, currency: price.currency } },
      update: { stripePriceId: stripeId },
      create: {
        priceId: price.id,
        currency: price.currency,
        stripePriceId: stripeId,
      },
    });
    upserts += 1;
  }

  console.log(`✅ upserted ${upserts}  · removed ${deletes}  · skipped (already empty) ${skipped}`);
  if (missingCodes.length) {
    console.log(`⚠️  ${missingCodes.length} mapping keys had no matching Price.code in DB:`);
    missingCodes.forEach((c) => console.log('   -', c));
  }
  await prisma.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
