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
        prices: { orderBy: { months: 'asc' } },
      },
    });
    res.json({ products });
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
  months: z.number().int().min(1).max(36),
  currency: z.string().default('CNY'),
  amountCents: z.number().int().min(0),
  supportsAutoRenew: z.boolean().default(false),
  active: z.boolean().default(true),
});

router.post('/prices', async (req, res, next) => {
  try {
    const data = priceCreateSchema.parse(req.body);
    const product = await prisma.product.findUnique({ where: { id: data.productId } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const exists = await prisma.price.findUnique({ where: { code: data.code } });
    if (exists) return res.status(409).json({ error: 'Price code already exists' });
    const price = await prisma.price.create({ data });
    await writeAdminLog({
      adminId: req.admin.id, action: 'PRICE_CREATE',
      targetType: 'PRICE', targetId: price.id,
      payload: data, ip: clientIp(req),
    });
    res.status(201).json(price);
  } catch (e) { next(e); }
});

const priceUpdateSchema = z.object({
  amountCents: z.number().int().min(0).optional(),
  supportsAutoRenew: z.boolean().optional(),
  active: z.boolean().optional(),
});

router.patch('/prices/:id', async (req, res, next) => {
  try {
    const data = priceUpdateSchema.parse(req.body);
    const before = await prisma.price.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'Price not found' });
    const price = await prisma.price.update({ where: { id: before.id }, data });
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
