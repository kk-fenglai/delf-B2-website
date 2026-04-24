const express = require('express');
const prisma = require('../../prisma');
const { requireAuth } = require('../../middleware/auth');
const env = require('../../config/env');
const { applyPurchaseToUser } = require('../../services/billing');

const router = express.Router();

// GET /api/pay/orders — current user's order list
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(50, parseInt(req.query.pageSize || '20', 10));

    const [orders, total] = await Promise.all([
      prisma.paymentOrder.findMany({
        where: { userId: req.userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          provider: true,
          product: true,
          plan: true,
          months: true,
          currency: true,
          amountCents: true,
          refundedCents: true,
          status: true,
          paidAt: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
      prisma.paymentOrder.count({ where: { userId: req.userId } }),
    ]);

    res.json({ orders, page, pageSize, total });
  } catch (e) { next(e); }
});

// GET /api/pay/orders/:id — owner-only single order
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const order = await prisma.paymentOrder.findUnique({ where: { id: req.params.id } });
    if (!order || order.userId !== req.userId) return res.status(404).json({ error: 'Order not found' });
    res.json({
      order: {
        id: order.id,
        provider: order.provider,
        product: order.product,
        plan: order.plan,
        months: order.months,
        currency: order.currency,
        amountCents: order.amountCents,
        refundedCents: order.refundedCents,
        status: order.status,
        codeUrl: order.codeUrl,
        redirectUrl: order.redirectUrl,
        paidAt: order.paidAt,
        expiresAt: order.expiresAt,
        createdAt: order.createdAt,
      },
    });
  } catch (e) { next(e); }
});

// DEV ONLY: simulate payment success. Guarded by PAY_MOCK_ENABLED + non-prod.
router.post('/:id/mock-pay', requireAuth, async (req, res, next) => {
  try {
    if (env.IS_PROD || !env.PAY_MOCK_ENABLED) return res.status(404).json({ error: 'Not found' });
    const order = await prisma.paymentOrder.findUnique({ where: { id: req.params.id } });
    if (!order || order.userId !== req.userId) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'PAID') return res.json({ ok: true, alreadyPaid: true });

    const claim = await prisma.paymentOrder.updateMany({
      where: { id: order.id, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date(), externalTradeNo: `mock_${Date.now()}` },
    });
    if (claim.count === 0) return res.json({ ok: true, alreadyPaid: true });

    await applyPurchaseToUser({
      userId: order.userId,
      plan: order.plan,
      months: order.months,
      sourceOrderId: order.id,
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
