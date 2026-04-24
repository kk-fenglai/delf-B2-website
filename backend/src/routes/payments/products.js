const express = require('express');
const prisma = require('../../prisma');

const router = express.Router();

// GET /api/pay/products — public catalog for the Pricing page.
router.get('/', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { active: true },
      include: {
        prices: {
          where: { active: true },
          orderBy: { months: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      products: products.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        plan: p.plan,
        prices: p.prices.map((pr) => ({
          id: pr.id,
          code: pr.code,
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
