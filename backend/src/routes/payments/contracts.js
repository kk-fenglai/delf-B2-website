// GET /api/pay/contracts — the current user's auto-renew contracts.
// Powers the Orders page "我的自动续费" block. Termination is not exposed
// here yet — channel sign/unsign routes live in payments/{wechat,alipay}.js.

const express = require('express');
const prisma = require('../../prisma');
const { requireAuth } = require('../../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const contracts = await prisma.payContract.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        price: {
          include: {
            product: { select: { code: true, name: true, plan: true } },
          },
        },
      },
    });
    res.json({
      contracts: contracts.map((c) => ({
        id: c.id,
        provider: c.provider,
        status: c.status,
        nextChargeAt: c.nextChargeAt,
        lastChargeAt: c.lastChargeAt,
        failedCount: c.failedCount,
        signedAt: c.signedAt,
        terminatedAt: c.terminatedAt,
        price: c.price && {
          id: c.price.id,
          code: c.price.code,
          months: c.price.months,
          amountCents: c.price.amountCents,
          currency: c.price.currency,
          productName: c.price.product?.name || null,
          plan: c.price.product?.plan || null,
        },
      })),
    });
  } catch (e) { next(e); }
});

module.exports = router;
