// Default catalog for first-time seed. After launch, admins maintain prices
// via the admin panel (Product/Price tables). This file is only a fallback /
// bootstrap source of truth.
//
// Anchor currency: EUR (matches STRIPE_ANCHOR_CURRENCY). Reference USD/CNY
// rows exist for the pricing-page currency selector when Adaptive Pricing is off;
// with Embedded Checkout + Adaptive Pricing, checkout converts from the EUR anchor.

const ANCHOR_CURRENCY = 'EUR';

// EUR anchor (canonical). Yearly = 10× monthly (2 months free).
const EUR_PRICES = {
  STANDARD: { monthly: 599, yearly: 5999 },       // €5.99 / €59.99
  AI: { monthly: 1199, yearly: 11999 },         // €11.99 / €119.99
  AI_UNLIMITED: { monthly: 1699, yearly: 16999 }, // €16.99 / €169.99
};

// Reference FX for optional USD/CNY catalog rows (≈ ECB mid 2026-Q2).
// Refresh quarterly via admin「定价审查」; do not auto-sync on seed.
const REFERENCE_FX = { EUR_TO_USD: 1.08, EUR_TO_CNY: 7.85 };

function refUsd(centsEur) {
  return Math.round((centsEur / 100) * REFERENCE_FX.EUR_TO_USD * 100);
}

function refCny(centsEur) {
  return Math.round((centsEur / 100) * REFERENCE_FX.EUR_TO_CNY) * 100;
}

const DEFAULT_PRODUCTS = [
  {
    code: 'STANDARD',
    name: 'Standard',
    plan: 'STANDARD',
    prices: [
      { code: 'STANDARD_1M', name: 'Standard · monthly', months: 1, currency: 'EUR', amountCents: EUR_PRICES.STANDARD.monthly, supportsAutoRenew: true, anchor: true },
      { code: 'STANDARD_12M', name: 'Standard · yearly', months: 12, currency: 'EUR', amountCents: EUR_PRICES.STANDARD.yearly, supportsAutoRenew: false, anchor: true },
      { code: 'STANDARD_1M_USD', name: 'Standard · monthly (USD)', months: 1, currency: 'USD', amountCents: refUsd(EUR_PRICES.STANDARD.monthly), supportsAutoRenew: true },
      { code: 'STANDARD_12M_USD', name: 'Standard · yearly (USD)', months: 12, currency: 'USD', amountCents: refUsd(EUR_PRICES.STANDARD.yearly), supportsAutoRenew: false },
      { code: 'STANDARD_1M_CNY', name: 'Standard · monthly (CNY)', months: 1, currency: 'CNY', amountCents: refCny(EUR_PRICES.STANDARD.monthly), supportsAutoRenew: true },
      { code: 'STANDARD_12M_CNY', name: 'Standard · yearly (CNY)', months: 12, currency: 'CNY', amountCents: refCny(EUR_PRICES.STANDARD.yearly), supportsAutoRenew: false },
    ],
  },
  {
    code: 'AI',
    name: 'AI',
    plan: 'AI',
    prices: [
      { code: 'AI_1M', name: 'AI · monthly', months: 1, currency: 'EUR', amountCents: EUR_PRICES.AI.monthly, supportsAutoRenew: true, anchor: true },
      { code: 'AI_12M', name: 'AI · yearly', months: 12, currency: 'EUR', amountCents: EUR_PRICES.AI.yearly, supportsAutoRenew: false, anchor: true },
      { code: 'AI_1M_USD', name: 'AI · monthly (USD)', months: 1, currency: 'USD', amountCents: refUsd(EUR_PRICES.AI.monthly), supportsAutoRenew: true },
      { code: 'AI_12M_USD', name: 'AI · yearly (USD)', months: 12, currency: 'USD', amountCents: refUsd(EUR_PRICES.AI.yearly), supportsAutoRenew: false },
      { code: 'AI_1M_CNY', name: 'AI · monthly (CNY)', months: 1, currency: 'CNY', amountCents: refCny(EUR_PRICES.AI.monthly), supportsAutoRenew: true },
      { code: 'AI_12M_CNY', name: 'AI · yearly (CNY)', months: 12, currency: 'CNY', amountCents: refCny(EUR_PRICES.AI.yearly), supportsAutoRenew: false },
    ],
  },
  {
    code: 'AI_UNLIMITED',
    name: 'AI Unlimited',
    plan: 'AI_UNLIMITED',
    prices: [
      { code: 'AI_UNLIMITED_1M', name: 'AI Unlimited · monthly', months: 1, currency: 'EUR', amountCents: EUR_PRICES.AI_UNLIMITED.monthly, supportsAutoRenew: true, anchor: true },
      { code: 'AI_UNLIMITED_12M', name: 'AI Unlimited · yearly', months: 12, currency: 'EUR', amountCents: EUR_PRICES.AI_UNLIMITED.yearly, supportsAutoRenew: false, anchor: true },
      { code: 'AI_UNLIMITED_1M_USD', name: 'AI Unlimited · monthly (USD)', months: 1, currency: 'USD', amountCents: refUsd(EUR_PRICES.AI_UNLIMITED.monthly), supportsAutoRenew: true },
      { code: 'AI_UNLIMITED_12M_USD', name: 'AI Unlimited · yearly (USD)', months: 12, currency: 'USD', amountCents: refUsd(EUR_PRICES.AI_UNLIMITED.yearly), supportsAutoRenew: false },
      { code: 'AI_UNLIMITED_1M_CNY', name: 'AI Unlimited · monthly (CNY)', months: 1, currency: 'CNY', amountCents: refCny(EUR_PRICES.AI_UNLIMITED.monthly), supportsAutoRenew: true },
      { code: 'AI_UNLIMITED_12M_CNY', name: 'AI Unlimited · yearly (CNY)', months: 12, currency: 'CNY', amountCents: refCny(EUR_PRICES.AI_UNLIMITED.yearly), supportsAutoRenew: false },
    ],
  },
];

module.exports = {
  ANCHOR_CURRENCY,
  EUR_PRICES,
  REFERENCE_FX,
  DEFAULT_PRODUCTS,
};
