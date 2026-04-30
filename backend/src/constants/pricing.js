// Default catalog for first-time seed. After launch, admins maintain prices
// via the admin panel (Product/Price tables). This file is only a fallback /
// bootstrap source of truth.

const DEFAULT_PRODUCTS = [
  {
    code: 'STANDARD',
    name: 'Standard',
    plan: 'STANDARD',
    prices: [
      { code: 'STANDARD_1M', name: 'Standard · monthly', months: 1, amountCents: 2900, supportsAutoRenew: true },
      { code: 'STANDARD_12M', name: 'Standard · yearly', months: 12, amountCents: 29000, supportsAutoRenew: false },
    ],
  },
  {
    code: 'AI',
    name: 'AI',
    plan: 'AI',
    prices: [
      { code: 'AI_1M', name: 'AI · monthly', months: 1, amountCents: 6900, supportsAutoRenew: true },
      { code: 'AI_12M', name: 'AI · yearly', months: 12, amountCents: 69000, supportsAutoRenew: false },
    ],
  },
  {
    code: 'AI_UNLIMITED',
    name: 'AI Unlimited',
    plan: 'AI_UNLIMITED',
    prices: [
      { code: 'AI_UNLIMITED_1M', name: 'AI Unlimited · monthly', months: 1, amountCents: 9900, supportsAutoRenew: true },
      { code: 'AI_UNLIMITED_12M', name: 'AI Unlimited · yearly', months: 12, amountCents: 99000, supportsAutoRenew: false },
    ],
  },
];

module.exports = { DEFAULT_PRODUCTS };
