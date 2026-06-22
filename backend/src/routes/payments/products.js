const express = require('express');
const prisma = require('../../prisma');
const env = require('../../config/env');
const stripePay = require('../../services/payments/stripe');
const { trialConfig } = require('../../services/trial');
const { getBillingPolicy, isFreeCountry } = require('../../services/billingPolicy');

const router = express.Router();

// Country → preferred presentation currency. We only support three
// currencies; map the few hundred ISO codes into one of them with a
// pragmatic split: mainland China → CNY, eurozone → EUR, anywhere else
// → USD. Hong Kong / Macau / Taiwan default to USD since their actual
// local currencies (HKD / MOP / TWD) aren't on our price list.
const EUROZONE = new Set([
  'AT', 'BE', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES',
  // Non-EU but de-facto euro / accept euro pricing
  'AD', 'MC', 'SM', 'VA', 'ME', 'XK',
]);

function currencyForCountry(cc) {
  if (!cc) return 'USD';
  const c = String(cc).toUpperCase();
  if (c === 'CN') return 'CNY';
  if (EUROZONE.has(c)) return 'EUR';
  return 'USD';
}

// GET /api/pay/preferred-currency — suggest a default currency based on the
// CDN-provided country header. The frontend uses this as the initial value
// in the currency selector; users can still switch manually.
router.get('/preferred-currency', async (req, res, next) => {
  try {
    // Vercel sets x-vercel-ip-country; Cloudflare sets cf-ipcountry. Express
    // already lower-cases header names. We don't trust client-set values, but
    // these come from the edge proxy, not the browser.
    const cc =
      req.headers['x-vercel-ip-country'] ||
      req.headers['cf-ipcountry'] ||
      req.headers['x-country-code'] ||
      null;
    const currency = currencyForCountry(cc);
    const policy = await getBillingPolicy();
    // Cache briefly at the edge: same IP shouldn't keep regenerating.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ currency, country: cc || null, freeCountry: isFreeCountry(cc, policy) });
  } catch (e) { next(e); }
});

// GET /api/pay/products — public catalog for the Pricing page.
router.get('/products', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { active: true },
      include: {
        prices: {
          where: { active: true },
          orderBy: [{ months: 'asc' }, { currency: 'asc' }, { code: 'asc' }],
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const [cfg, policy] = await Promise.all([trialConfig(), getBillingPolicy()]);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json({
      adaptivePricing: Boolean(env.STRIPE?.ADAPTIVE_PRICING),
      anchorCurrency: env.STRIPE?.ANCHOR_CURRENCY || 'EUR',
      checkoutMode: stripePay.useEmbeddedCheckout() ? 'embedded' : 'hosted',
      trial: {
        enabled: cfg.enabled,
        days: cfg.days,
        plan: cfg.plan,
      },
      paymentsEnabled: policy.paymentsEnabled,
      paymentsDisabledMessage: policy.paymentsDisabledMessage,
      products: products.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        plan: p.plan,
        prices: p.prices.map((pr) => ({
          id: pr.id,
          code: pr.code,
          name: pr.name,
          months: pr.months,
          currency: pr.currency,
          amountCents: pr.amountCents,
          supportsAutoRenew: pr.supportsAutoRenew,
        })),
      })),
    });
  } catch (e) { next(e); }
});

module.exports = router;
