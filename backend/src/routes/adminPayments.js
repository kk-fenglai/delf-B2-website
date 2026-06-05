// Admin-only endpoints for the billing back office.
//
// Surface (mounted under /api/admin):
//   GET    /products                   — list all products with their prices
//   POST   /products                   — create product
//   PATCH  /products/:id               — update product (name/plan/active)
//   DELETE /products/:id               — soft-disable (set active=false)
//   POST   /prices                     — create price row
//   PATCH  /prices/:id                 — update price (amountCents/active/supportsAutoRenew)
//   DELETE /prices/:id                 — soft-disable price
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
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(requireAdmin);

const VALID_PLANS = ['FREE', 'STANDARD', 'AI', 'AI_UNLIMITED'];

// --------------------------------------------------------------------
// Products
// --------------------------------------------------------------------

router.get('/products', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        prices: { orderBy: { months: 'asc' }, include: { stripeMappings: true } },
      },
    });
    res.json({ products });
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
  // Frankfurter is ECB-backed, free, no API key. We ask for USD-base so
  // every reported rate is "1 USD = X (target)".
  const r = await fetch('https://api.frankfurter.app/latest?from=USD&to=CNY,EUR', {
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok) throw new Error(`Frankfurter ${r.status}`);
  const j = await r.json();
  fxCache = {
    fetchedAt: Date.now(),
    rates: { USD: 1, CNY: j.rates?.CNY, EUR: j.rates?.EUR, date: j.date },
  };
  return { ...fxCache, cached: false };
}

// GET /api/admin/pricing-report — read-only audit table: for each (product,
// price) row, show the listed price, what it converts to in USD at today's
// ECB rate, and the % drift versus the canonical USD price of the same
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

    // For each (product, months) group, pick the USD price as the anchor
    // and compute deviation of CNY/EUR prices against it (after FX).
    const report = products.map((p) => {
      const groups = new Map(); // months -> { USD, CNY, EUR }
      for (const pr of p.prices) {
        if (!groups.has(pr.months)) groups.set(pr.months, {});
        groups.get(pr.months)[pr.currency] = pr;
      }
      const rows = [];
      for (const [months, byCur] of groups) {
        const usdPrice = byCur.USD;
        const usdAnchor = usdPrice ? usdPrice.amountCents / 100 : null;
        for (const cur of ['CNY', 'USD', 'EUR']) {
          const pr = byCur[cur];
          if (!pr) continue;
          const local = pr.amountCents / 100;
          // Convert local → USD via FX. rate[cur] is "1 USD = X cur", so
          // local / rate[cur] is the USD-equivalent of the local price.
          const usdEquivalent = rates[cur] ? local / rates[cur] : null;
          const deviationPct = usdAnchor && usdEquivalent
            ? ((usdEquivalent - usdAnchor) / usdAnchor) * 100
            : null;
          rows.push({
            priceId: pr.id,
            priceCode: pr.code,
            months,
            currency: cur,
            amountCents: pr.amountCents,
            amountDisplay: local.toFixed(2),
            usdEquivalent: usdEquivalent != null ? Number(usdEquivalent.toFixed(2)) : null,
            usdAnchor,
            deviationPct: deviationPct != null ? Number(deviationPct.toFixed(1)) : null,
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
    const before = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Product not found' });
    // Soft disable — hard delete would cascade-delete prices/orders.
    const product = await prisma.product.update({
      where: { id: before.id },
      data: { active: false },
    });
    await writeAdminLog({
      adminId: req.admin.id, action: 'PRODUCT_DISABLE',
      targetType: 'PRODUCT', targetId: product.id,
      ip: clientIp(req),
    });
    res.json({ ok: true });
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
  currency: z.string().default('CNY'),
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
    const price = await prisma.price.create({ data, include: { stripeMappings: true } });
    await writeAdminLog({
      adminId: req.admin.id, action: 'PRICE_CREATE',
      targetType: 'PRICE', targetId: price.id,
      payload: data, ip: clientIp(req),
    });
    res.status(201).json(price);
  } catch (e) { next(e); }
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
    if (parsed.stripePriceId !== undefined) data.stripePriceId = parsed.stripePriceId;
    if (parsed.name !== undefined && parsed.name !== null) {
      data.name = parsed.name === '' ? null : parsed.name;
    } else if (parsed.name === null) {
      data.name = null;
    }
    const before = await prisma.price.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Price not found' });
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
  } catch (e) { next(e); }
});

router.delete('/prices/:id', async (req, res, next) => {
  try {
    const before = await prisma.price.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Price not found' });
    const price = await prisma.price.update({
      where: { id: before.id },
      data: { active: false },
    });
    await writeAdminLog({
      adminId: req.admin.id, action: 'PRICE_DISABLE',
      targetType: 'PRICE', targetId: price.id,
      ip: clientIp(req),
    });
    res.json({ ok: true });
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
