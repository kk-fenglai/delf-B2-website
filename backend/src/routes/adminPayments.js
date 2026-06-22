// Admin-only endpoints for the billing back office.
//
// Surface (mounted under /api/admin):
//   GET    /products                   — list all products with their prices
//   POST   /products                   — create product
//   PATCH  /products/:id               — update product (name/plan/active)
//   DELETE /products/:id               — soft-disable (set active=false); ?hard=true permanent delete
//   POST   /prices                     — create price row
//   PATCH  /prices/:id                 — update price (amountCents/active/supportsAutoRenew)
//   DELETE /prices/:id                 — soft-disable price; ?hard=true permanent delete
//
//   GET    /payment-orders             — paginated order list with filters
//   GET    /payment-orders/:id         — single order + its refunds
//   POST   /payment-orders/:id/refund  — manual refund (X-Admin-Password guarded)
//
//   GET    /contracts                  — paginated contract list
//   POST   /contracts/:id/terminate    — force-terminate (best-effort channel call)

const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma');
const {
  requireAdmin, requirePasswordReconfirm, writeAdminLog, clientIp,
} = require('../middleware/admin');
const { refundOrder } = require('../services/billing');
const wechat = require('../services/payments/wechat');
const alipay = require('../services/payments/alipay');
const stripePay = require('../services/payments/stripe');
const env = require('../config/env');
const { trialConfig } = require('../services/trial');
const {
  getBillingPolicy,
  saveBillingPolicy,
  TEST_PHASE_PRESET,
} = require('../services/billingPolicy');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(requireAdmin);

const VALID_PLANS = ['FREE', 'STANDARD', 'AI', 'AI_UNLIMITED'];

async function countPriceReferences(priceIds) {
  if (!priceIds.length) return { orderCount: 0, contractCount: 0 };
  const [orderCount, contractCount] = await Promise.all([
    prisma.paymentOrder.count({ where: { priceId: { in: priceIds } } }),
    prisma.payContract.count({ where: { priceId: { in: priceIds } } }),
  ]);
  return { orderCount, contractCount };
}

/** One price row per (product, billing cycle, currency). */
async function assertUniquePriceSlot({ productId, months, currency, excludePriceId }) {
  const cur = String(currency || '').toUpperCase();
  const conflict = await prisma.price.findFirst({
    where: {
      productId,
      months,
      currency: cur,
      ...(excludePriceId ? { id: { not: excludePriceId } } : {}),
    },
    select: { id: true, code: true },
  });
  if (conflict) {
    const e = new Error(
      `This product already has a price for ${months} month(s) in ${cur} (${conflict.code})`,
    );
    e.status = 409;
    e.code = 'PRICE_SLOT_TAKEN';
    e.existingCode = conflict.code;
    throw e;
  }
}

function priceSlotErrorResponse(err, res) {
  if (err.code === 'PRICE_SLOT_TAKEN') {
    return res.status(409).json({
      error: err.message,
      code: err.code,
      existingCode: err.existingCode,
    });
  }
  return null;
}

// GET /api/admin/trial-config — trial settings for admin UI banners.
router.get('/trial-config', async (_req, res, next) => {
  try {
    const cfg = await trialConfig();
    res.json({
      enabled: cfg.enabled,
      days: cfg.days,
      plan: cfg.plan,
      autoGrantOnVerify: cfg.enabled,
    });
  } catch (e) { next(e); }
});

const billingPolicySchema = z.object({
  trialEnabled: z.boolean().optional(),
  trialDays: z.number().int().min(1).max(365).optional(),
  trialPlan: z.enum(['STANDARD', 'AI', 'AI_UNLIMITED']).optional(),
  paymentsEnabled: z.boolean().optional(),
  freeCountries: z.array(z.string().max(2)).max(250).optional(),
  paymentsDisabledMessage: z.object({
    zh: z.string().max(500).optional(),
    en: z.string().max(500).optional(),
    fr: z.string().max(500).optional(),
  }).optional(),
});

// GET /api/admin/billing-policy
router.get('/billing-policy', async (_req, res, next) => {
  try {
    const policy = await getBillingPolicy();
    res.json({ policy });
  } catch (e) { next(e); }
});

// PATCH /api/admin/billing-policy
router.patch('/billing-policy', async (req, res, next) => {
  try {
    const data = billingPolicySchema.parse(req.body);
    const saved = await saveBillingPolicy(data, { adminId: req.adminId });
    await writeAdminLog({
      adminId: req.adminId,
      action: 'BILLING_POLICY_UPDATED',
      targetType: 'APP_SETTING',
      targetId: 'billing_policy',
      payload: data,
      ip: clientIp(req),
    });
    res.json({ policy: await getBillingPolicy() });
  } catch (e) { next(e); }
});

// POST /api/admin/billing-policy/test-phase — one-click beta preset
router.post('/billing-policy/test-phase', async (req, res, next) => {
  try {
    await saveBillingPolicy(TEST_PHASE_PRESET, { adminId: req.adminId });
    await writeAdminLog({
      adminId: req.adminId,
      action: 'BILLING_POLICY_TEST_PHASE',
      targetType: 'APP_SETTING',
      targetId: 'billing_policy',
      payload: TEST_PHASE_PRESET,
      ip: clientIp(req),
    });
    res.json({ policy: await getBillingPolicy() });
  } catch (e) { next(e); }
});

// --------------------------------------------------------------------
// Products
// --------------------------------------------------------------------

router.get('/products', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        prices: { orderBy: [{ months: 'asc' }, { currency: 'asc' }, { code: 'asc' }], include: { stripeMappings: true } },
      },
    });
    res.json({
      billing: {
        adaptivePricing: Boolean(env.STRIPE?.ADAPTIVE_PRICING),
        anchorCurrency: env.STRIPE?.ANCHOR_CURRENCY || 'EUR',
        checkoutMode: stripePay.useEmbeddedCheckout() ? 'embedded' : 'hosted',
      },
      products,
    });
  } catch (e) { next(e); }
});

// In-memory FX cache so the admin page doesn't hammer Frankfurter when
// reloaded repeatedly. 6h matches how often ECB publishes; admins reviewing
// prices don't need fresher data than that.
let fxCache = { fetchedAt: 0, rates: null };
const FX_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchFxRates() {
  if (fxCache.rates && Date.now() - fxCache.fetchedAt < FX_TTL_MS) {
    return { ...fxCache, cached: true };
  }
  // Frankfurter is ECB-backed. EUR-base: "1 EUR = X (target)".
  const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD,CNY', {
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`Frankfurter ${r.status}`);
  const j = await r.json();
  fxCache = {
    fetchedAt: Date.now(),
    rates: { EUR: 1, USD: j.rates?.USD, CNY: j.rates?.CNY, date: j.date },
  };
  return { ...fxCache, cached: false };
}

// GET /api/admin/pricing-report — read-only audit table: for each (product,
// price) row, show the listed price, what it converts to in EUR at today's
// ECB rate, and the % drift versus the canonical EUR price of the same
// product+cycle. Use it quarterly to spot prices that have drifted >10% off
// because of FX moves.
router.get('/pricing-report', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
      include: { prices: { where: { active: true }, orderBy: [{ months: 'asc' }, { currency: 'asc' }] } },
    });

    let fx;
    try { fx = await fetchFxRates(); }
    catch (err) {
      return res.status(503).json({
        error: 'Failed to fetch FX rates from Frankfurter',
        detail: String(err?.message || err),
      });
    }
    const rates = fx.rates;

    // For each (product, months) group, pick the EUR price as the anchor
    // and compute deviation of USD/CNY prices against it (after FX).
    const report = products.map((p) => {
      const groups = new Map(); // months -> { USD, CNY, EUR }
      for (const pr of p.prices) {
        if (!groups.has(pr.months)) groups.set(pr.months, {});
        groups.get(pr.months)[pr.currency] = pr;
      }
      const rows = [];
      for (const [months, byCur] of groups) {
        const eurPrice = byCur.EUR;
        const eurAnchor = eurPrice ? eurPrice.amountCents / 100 : null;
        for (const cur of ['CNY', 'USD', 'EUR']) {
          const pr = byCur[cur];
          if (!pr) continue;
          const local = pr.amountCents / 100;
          // rate[cur] is "1 EUR = X cur", so local / rate[cur] → EUR equivalent.
          const eurEquivalent = cur === 'EUR'
            ? local
            : (rates[cur] ? local / rates[cur] : null);
          const deviationPct = eurAnchor && eurEquivalent
            ? ((eurEquivalent - eurAnchor) / eurAnchor) * 100
            : null;
          rows.push({
            priceId: pr.id,
            priceCode: pr.code,
            months,
            currency: cur,
            amountCents: pr.amountCents,
            amountDisplay: local.toFixed(2),
            eurEquivalent: eurEquivalent != null ? Number(eurEquivalent.toFixed(2)) : null,
            eurAnchor,
            deviationPct: deviationPct != null ? Number(deviationPct.toFixed(1)) : null,
            // Legacy aliases for older admin UI builds
            usdEquivalent: eurEquivalent,
            usdAnchor: eurAnchor,
          });
        }
      }
      return {
        productCode: p.code,
        productName: p.name,
        plan: p.plan,
        rows,
      };
    });

    res.json({
      report,
      fx: { rates, fetchedAt: new Date(fx.fetchedAt).toISOString(), cached: fx.cached, source: 'frankfurter.app' },
    });
  } catch (e) { next(e); }
});

const productCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  plan: z.enum(VALID_PLANS),
  active: z.boolean().default(true),
});

router.post('/products', async (req, res, next) => {
  try {
    const data = productCreateSchema.parse(req.body);
    const exists = await prisma.product.findUnique({ where: { code: data.code } });
    if (exists) return res.status(409).json({ error: 'Product code already exists' });
    const product = await prisma.product.create({ data });
    await writeAdminLog({
      adminId: req.admin.id, action: 'PRODUCT_CREATE',
      targetType: 'PRODUCT', targetId: product.id,
      payload: data, ip: clientIp(req),
    });
    res.status(201).json(product);
  } catch (e) { next(e); }
});

const productUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  plan: z.enum(VALID_PLANS).optional(),
  active: z.boolean().optional(),
});

router.patch('/products/:id', async (req, res, next) => {
  try {
    const data = productUpdateSchema.parse(req.body);
    const before = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Product not found' });
    const product = await prisma.product.update({ where: { id: before.id }, data });
    await writeAdminLog({
      adminId: req.admin.id, action: 'PRODUCT_UPDATE',
      targetType: 'PRODUCT', targetId: product.id,
      payload: { before, after: data }, ip: clientIp(req),
    });
    res.json(product);
  } catch (e) { next(e); }
});

router.delete('/products/:id', async (req, res, next) => {
  try {
    const hard = String(req.query.hard || '') === 'true';
    const before = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { prices: { select: { id: true } } },
    });
    if (!before) return res.status(404).json({ error: 'Product not found' });

    if (!hard) {
      const product = await prisma.product.update({
        where: { id: before.id },
        data: { active: false },
      });
      await writeAdminLog({
        adminId: req.admin.id, action: 'PRODUCT_DISABLE',
        targetType: 'PRODUCT', targetId: product.id,
        ip: clientIp(req),
      });
      return res.json({ ok: true, soft: true });
    }

    const priceIds = before.prices.map((p) => p.id);
    const { orderCount, contractCount } = await countPriceReferences(priceIds);
    if (orderCount > 0 || contractCount > 0) {
      return res.status(409).json({
        error: 'Cannot delete product: linked payment orders or subscriptions exist',
        code: 'PRODUCT_IN_USE',
        orderCount,
        contractCount,
      });
    }

    await prisma.product.delete({ where: { id: before.id } });
    await writeAdminLog({
      adminId: req.admin.id, action: 'PRODUCT_DELETE',
      targetType: 'PRODUCT', targetId: before.id,
      payload: { code: before.code, priceCount: priceIds.length },
      ip: clientIp(req),
    });
    res.json({ ok: true, deleted: true });
  } catch (e) { next(e); }
});

// --------------------------------------------------------------------
// Prices
// --------------------------------------------------------------------

const priceCreateSchema = z.object({
  productId: z.string().min(1),
  code: z.string().min(1).max(80),
  // Optional display label (FE often sends explicit null when cleared — needs nullish)
  name: z.string().trim().max(100).nullish(),
  months: z.number().int().min(1).max(36),
  currency: z.string().default('CNY').transform((s) => s.toUpperCase()),
  amountCents: z.number().int().min(0),
  supportsAutoRenew: z.boolean().default(false),
  active: z.boolean().default(true),
  // Stripe recurring Price ID (price_xxx) — required when supportsAutoRenew=true
  // because Stripe Subscription Checkout cannot use inline price_data.
  stripePriceId: z.string().trim().min(1).max(100).nullish(),
});

router.post('/prices', async (req, res, next) => {
  try {
    const parsed = priceCreateSchema.parse(req.body);
    const { name: rawName, ...rest } = parsed;
    const data = {
      ...rest,
      name: rawName && rawName.length > 0 ? rawName : null,
    };
    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const exists = await prisma.price.findUnique({ where: { code: data.code } });
    if (exists) return res.status(409).json({ error: 'Price code already exists' });
    await assertUniquePriceSlot({
      productId: data.productId,
      months: data.months,
      currency: data.currency,
    });
    const price = await prisma.price.create({ data, include: { stripeMappings: true } });
    await writeAdminLog({
      adminId: req.admin.id, action: 'PRICE_CREATE',
      targetType: 'PRICE', targetId: price.id,
      payload: data, ip: clientIp(req),
    });
    res.status(201).json(price);
  } catch (e) {
    const handled = priceSlotErrorResponse(e, res);
    if (handled) return handled;
    if (e.code === 'P2002') {
      return res.status(409).json({
        error: 'This product already has a price for that cycle and currency',
        code: 'PRICE_SLOT_TAKEN',
      });
    }
    next(e);
  }
});

const priceUpdateSchema = z.object({
  // Omit entirely to leave unchanged; pass null or empty string to clear.
  name: z.string().trim().max(100).nullish(),
  stripeMappings: z.array(z.object({
    currency: z.string().trim().min(1).max(10),
    stripePriceId: z.string().trim().min(1).max(100),
  })).optional(),
  amountCents: z.number().int().min(0).optional(),
  supportsAutoRenew: z.boolean().optional(),
  active: z.boolean().optional(),
  months: z.number().int().min(1).max(36).optional(),
  currency: z.string().transform((s) => s.toUpperCase()).optional(),
  // Pass null to clear; omit to leave unchanged.
  stripePriceId: z.string().trim().min(1).max(100).nullish(),
});

router.patch('/prices/:id', async (req, res, next) => {
  try {
    const parsed = priceUpdateSchema.parse(req.body);
    /** @type {Record<string, unknown>} */
    const data = {};
    if (parsed.amountCents !== undefined) data.amountCents = parsed.amountCents;
    if (parsed.supportsAutoRenew !== undefined) data.supportsAutoRenew = parsed.supportsAutoRenew;
    if (parsed.active !== undefined) data.active = parsed.active;
    if (parsed.months !== undefined) data.months = parsed.months;
    if (parsed.currency !== undefined) data.currency = parsed.currency;
    if (parsed.stripePriceId !== undefined) data.stripePriceId = parsed.stripePriceId;
    if (parsed.name !== undefined && parsed.name !== null) {
      data.name = parsed.name === '' ? null : parsed.name;
    } else if (parsed.name === null) {
      data.name = null;
    }
    const before = await prisma.price.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Price not found' });

    const slotMonths = parsed.months ?? before.months;
    const slotCurrency = parsed.currency ?? before.currency;
    if (parsed.months !== undefined || parsed.currency !== undefined) {
      await assertUniquePriceSlot({
        productId: before.productId,
        months: slotMonths,
        currency: slotCurrency,
        excludePriceId: before.id,
      });
    }

    const price = await prisma.$transaction(async (tx) => {
      const updated = await tx.price.update({ where: { id: before.id }, data });
      if (parsed.stripeMappings) {
        // Replace mappings for this priceId (simple, deterministic).
        await tx.priceStripeMapping.deleteMany({ where: { priceId: updated.id } });
        if (parsed.stripeMappings.length > 0) {
          await tx.priceStripeMapping.createMany({
            data: parsed.stripeMappings.map((m) => ({
              priceId: updated.id,
              currency: m.currency.toUpperCase(),
              stripePriceId: m.stripePriceId,
            })),
          });
        }
      }
      return tx.price.findUnique({
        where: { id: updated.id },
        include: { stripeMappings: true },
      });
    });
    await writeAdminLog({
      adminId: req.admin.id, action: 'PRICE_UPDATE',
      targetType: 'PRICE', targetId: price.id,
      payload: { before, after: data }, ip: clientIp(req),
    });
    res.json(price);
  } catch (e) {
    const handled = priceSlotErrorResponse(e, res);
    if (handled) return handled;
    if (e.code === 'P2002') {
      return res.status(409).json({
        error: 'This product already has a price for that cycle and currency',
        code: 'PRICE_SLOT_TAKEN',
      });
    }
    next(e);
  }
});

router.delete('/prices/:id', async (req, res, next) => {
  try {
    const hard = String(req.query.hard || '') === 'true';
    const before = await prisma.price.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Price not found' });

    if (!hard) {
      const price = await prisma.price.update({
        where: { id: before.id },
        data: { active: false },
      });
      await writeAdminLog({
        adminId: req.admin.id, action: 'PRICE_DISABLE',
        targetType: 'PRICE', targetId: price.id,
        ip: clientIp(req),
      });
      return res.json({ ok: true, soft: true });
    }

    const { orderCount, contractCount } = await countPriceReferences([before.id]);
    if (orderCount > 0 || contractCount > 0) {
      return res.status(409).json({
        error: 'Cannot delete price: linked payment orders or subscriptions exist',
        code: 'PRICE_IN_USE',
        orderCount,
        contractCount,
      });
    }

    await prisma.price.delete({ where: { id: before.id } });
    await writeAdminLog({
      adminId: req.admin.id, action: 'PRICE_DELETE',
      targetType: 'PRICE', targetId: before.id,
      payload: { code: before.code, currency: before.currency },
      ip: clientIp(req),
    });
    res.json({ ok: true, deleted: true });
  } catch (e) { next(e); }
});

// --------------------------------------------------------------------
// Payment orders (reconciliation table)
// --------------------------------------------------------------------

router.get('/payment-orders', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize, 10) || 20);

    const where = {};
    const { status, provider, userId, from, to, q } = req.query;
    if (status) where.status = String(status);
    if (provider) where.provider = String(provider);
    if (userId) where.userId = String(userId);
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) where.createdAt.lte = new Date(String(to));
    }
    if (q) {
      const term = String(q).trim();
      where.OR = [
        { id: { contains: term } },
        { providerOrderNo: { contains: term } },
        { externalTradeNo: { contains: term } },
        { user: { email: { contains: term } } },
      ];
    }

    const [total, orders] = await Promise.all([
      prisma.paymentOrder.count({ where }),
      prisma.paymentOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, email: true, name: true } },
          price: { select: { code: true, months: true, amountCents: true } },
        },
      }),
    ]);

    res.json({ total, page, pageSize, orders });
  } catch (e) { next(e); }
});

router.get('/payment-orders/:id', async (req, res, next) => {
  try {
    const order = await prisma.paymentOrder.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, email: true, name: true, plan: true } },
        price: true,
        refunds: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ order });
  } catch (e) { next(e); }
});

const refundSchema = z.object({
  amountCents: z.number().int().min(1).optional(), // defaults to remaining refundable
  reason: z.string().max(200).optional(),
});

router.post('/payment-orders/:id/refund', requirePasswordReconfirm, async (req, res, next) => {
  try {
    const { amountCents, reason } = refundSchema.parse(req.body);
    const order = await prisma.paymentOrder.findUnique({
      where: { id: req.params.id },
      select: { amountCents: true, refundedCents: true },
    });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const fallback = order.amountCents - order.refundedCents;
    const amount = amountCents || fallback;

    const result = await refundOrder({
      orderId: req.params.id,
      amountCents: amount,
      reason,
      operatorAdminId: req.admin.id,
    });

    await writeAdminLog({
      adminId: req.admin.id,
      action: 'PAYMENT_REFUNDED',
      targetType: 'PAYMENT',
      targetId: req.params.id,
      payload: { amountCents: amount, reason: reason || null, result },
      ip: clientIp(req),
    });

    res.json(result);
  } catch (e) {
    if (e.code && !e.status) e.status = 400;
    next(e);
  }
});

// --------------------------------------------------------------------
// Contracts (auto-renew agreements)
// --------------------------------------------------------------------

router.get('/contracts', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize, 10) || 20);
    const where = {};
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.provider) where.provider = String(req.query.provider);

    const [total, contracts] = await Promise.all([
      prisma.payContract.count({ where }),
      prisma.payContract.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, email: true, name: true, plan: true } },
          price: { include: { product: { select: { code: true, name: true } } } },
        },
      }),
    ]);

    res.json({ total, page, pageSize, contracts });
  } catch (e) { next(e); }
});

// --------------------------------------------------------------------
// Overview (dashboard)
// --------------------------------------------------------------------
//
// Single read-only endpoint feeding the admin payment dashboard. All five
// queries run in parallel; raw SQL is used only for the 7-day daily series
// because Prisma's groupBy can't bucket by date(timestamp) without a server
// extension.

router.get('/payments/overview', async (_req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(todayStart.getTime() - 6 * 86400000);

    const [
      todayAgg,
      sevenDaysSeriesRaw,
      activeSubscriptions,
      providerAggRaw,
      recentFailedRenewals,
      mrrContracts,
    ] = await Promise.all([
      prisma.paymentOrder.aggregate({
        where: { status: 'PAID', paidAt: { gte: todayStart } },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      prisma.$queryRaw`
        SELECT DATE("paidAt") AS day,
               COUNT(*)::int AS cnt,
               COALESCE(SUM("amountCents"), 0)::bigint AS revenue
        FROM "PaymentOrder"
        WHERE "status" = 'PAID' AND "paidAt" >= ${sevenDaysAgo}
        GROUP BY DATE("paidAt")
        ORDER BY DATE("paidAt") ASC
      `,
      prisma.payContract.count({ where: { status: 'ACTIVE' } }),
      prisma.paymentOrder.groupBy({
        by: ['provider'],
        where: { status: 'PAID', paidAt: { gte: sevenDaysAgo } },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      prisma.payContract.findMany({
        where: { failedCount: { gt: 0 }, status: { not: 'TERMINATED' } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          user: { select: { id: true, email: true } },
          price: { select: { code: true, currency: true, amountCents: true } },
        },
      }),
      prisma.payContract.findMany({
        where: { status: 'ACTIVE' },
        select: { price: { select: { months: true, amountCents: true, currency: true } } },
      }),
    ]);

    // MRR: monthly contracts contribute amountCents directly; yearly contracts
    // contribute amountCents / months. Currencies are mixed; we expose a per-
    // currency breakdown plus a CNY-equivalent estimate is *not* provided
    // (the frontend can choose to display the dominant currency).
    const mrrByCurrency = {};
    for (const c of mrrContracts) {
      if (!c.price) continue;
      const months = Math.max(1, c.price.months || 1);
      const monthly = Math.round(c.price.amountCents / months);
      const cur = c.price.currency || 'CNY';
      mrrByCurrency[cur] = (mrrByCurrency[cur] || 0) + monthly;
    }

    // Normalise raw query result (BigInt -> Number for JSON safety).
    const sevenDaysSeries = sevenDaysSeriesRaw.map((row) => ({
      day: row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10),
      count: Number(row.cnt),
      revenueCents: Number(row.revenue),
    }));

    const providerBreakdown = providerAggRaw.map((row) => ({
      provider: row.provider,
      count: row._count._all,
      revenueCents: Number(row._sum.amountCents || 0),
    }));

    res.json({
      generatedAt: now.toISOString(),
      today: {
        revenueCents: Number(todayAgg._sum.amountCents || 0),
        orderCount: todayAgg._count._all,
      },
      activeSubscriptions,
      mrrByCurrency,
      sevenDaysSeries,
      providerBreakdown,
      recentFailedRenewals: recentFailedRenewals.map((c) => ({
        id: c.id,
        provider: c.provider,
        status: c.status,
        failedCount: c.failedCount,
        lastChargeAt: c.lastChargeAt,
        nextChargeAt: c.nextChargeAt,
        userEmail: c.user?.email || null,
        priceCode: c.price?.code || null,
        amountCents: c.price?.amountCents ?? null,
        currency: c.price?.currency ?? null,
      })),
    });
  } catch (e) { next(e); }
});

router.post('/contracts/:id/terminate', async (req, res, next) => {
  try {
    const contract = await prisma.payContract.findUnique({ where: { id: req.params.id } });
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    if (contract.status === 'TERMINATED') {
      return res.json({ ok: true, alreadyTerminated: true });
    }

    // Best-effort channel unsign. Failures don't block marking TERMINATED
    // locally — admins can always force the DB state.
    let channelError = null;
    try {
      if (contract.provider === 'wechat' && wechat.isEnabled() && contract.externalContractId) {
        await wechat.terminateContract({
          contractId: contract.externalContractId,
          remark: 'admin forced termination',
        });
      } else if (contract.provider === 'alipay' && alipay.isEnabled() && contract.externalContractId) {
        await alipay.unsignAgreement({ agreementNo: contract.externalContractId });
      } else if (contract.provider === 'stripe' && stripePay.isEnabled() && contract.stripeSubscriptionId) {
        await stripePay.cancelSubscription(contract.stripeSubscriptionId);
      }
    } catch (err) {
      channelError = err.message;
      logger.warn({ err: err.message, contractId: contract.id }, '[admin.contracts] channel unsign failed');
    }

    await prisma.payContract.update({
      where: { id: contract.id },
      data: { status: 'TERMINATED', terminatedAt: new Date() },
    });

    await writeAdminLog({
      adminId: req.admin.id,
      action: 'CONTRACT_TERMINATED',
      targetType: 'CONTRACT',
      targetId: contract.id,
      payload: { provider: contract.provider, forcedBy: 'admin', channelError },
      ip: clientIp(req),
    });

    res.json({ ok: true, channelError });
  } catch (e) { next(e); }
});

module.exports = router;
