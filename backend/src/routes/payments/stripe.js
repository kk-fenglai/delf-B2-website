const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');

const prisma = require('../../prisma');
const { requireAuth } = require('../../middleware/auth');
const env = require('../../config/env');
const stripePay = require('../../services/payments/stripe');
const { resolvePriceOrThrow, applyPurchaseToUser } = require('../../services/billing');
const { writeAdminLog } = require('../../middleware/admin');
const { logger } = require('../../utils/logger');

const router = express.Router();

const checkoutSchema = z.object({
  priceId: z.string().min(1),
});

function frontendUrl(path) {
  const base = env.FRONTEND_URL || 'http://localhost:5173';
  return `${base}${path}`;
}

function successUrlForOrder(orderId) {
  if (env.STRIPE?.CHECKOUT_SUCCESS_URL) return env.STRIPE.CHECKOUT_SUCCESS_URL.replace('{ORDER_ID}', orderId);
  return frontendUrl(`/checkout/stripe/success?orderId=${encodeURIComponent(orderId)}`);
}

function cancelUrlForOrder(orderId) {
  if (env.STRIPE?.CHECKOUT_CANCEL_URL) return env.STRIPE.CHECKOUT_CANCEL_URL.replace('{ORDER_ID}', orderId);
  return frontendUrl(`/checkout/stripe/cancel?orderId=${encodeURIComponent(orderId)}`);
}

function randomProviderOrderNo(prefix = 'cs') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

// POST /api/pay/stripe/checkout — create a Stripe Checkout session and return redirect URL
router.post('/checkout', requireAuth, async (req, res, next) => {
  try {
    if (!stripePay.isEnabled()) {
      return res.status(503).json({ error: 'Stripe not configured', code: 'PAY_NOT_CONFIGURED' });
    }
    const { priceId } = checkoutSchema.parse(req.body);
    const price = await resolvePriceOrThrow(priceId);

    // Stripe is mainly for overseas; keep DB intent identical to other providers.
    const providerOrderNo = randomProviderOrderNo('cs');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const order = await prisma.paymentOrder.create({
      data: {
        userId: req.userId,
        provider: 'stripe',
        product: 'checkout',
        plan: price.product.plan,
        months: price.months,
        priceId: price.id,
        currency: price.currency,
        amountCents: price.amountCents,
        status: 'PENDING',
        providerOrderNo, // will be overwritten to session.id after creation
        expiresAt,
      },
    });

    const { sessionId, url } = await stripePay.createCheckoutSession({
      orderId: order.id,
      userId: req.userId,
      price,
      successUrl: successUrlForOrder(order.id),
      cancelUrl: cancelUrlForOrder(order.id),
    });

    // Ensure providerOrderNo is the Stripe session id so it matches our unique constraint.
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { providerOrderNo: sessionId, redirectUrl: url },
    });

    res.status(201).json({ orderId: order.id, provider: 'stripe', redirectUrl: url });
  } catch (e) { next(e); }
});

// POST /api/pay/stripe/webhook — signed webhook, uses raw body bytes
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.header('Stripe-Signature');
    const event = stripePay.verifyWebhookEvent({ rawBodyBuffer: req.rawBodyBuffer, signature });
    if (!event) {
      logger.warn('[stripe.webhook] signature invalid');
      return res.status(401).send('invalid signature');
    }

    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data?.object;
      const sessionId = session?.id;
      const orderId = session?.metadata?.orderId || session?.client_reference_id;
      const amountTotal = session?.amount_total;
      const currency = session?.currency ? String(session.currency).toUpperCase() : null;

      if (sessionId) {
        await settleOrder({
          sessionId,
          orderId,
          externalTradeNo: session?.payment_intent || sessionId,
          paidCents: typeof amountTotal === 'number' ? amountTotal : null,
          currency,
        });
      }
    } else {
      logger.info({ type: event.type }, '[stripe.webhook] ignored event');
    }

    res.type('text').send('ok');
  } catch (err) {
    logger.error({ err: err.message }, '[stripe.webhook] handler error');
    res.status(500).send('error');
  }
});

async function settleOrder({ sessionId, orderId, externalTradeNo, paidCents, currency }) {
  let order = null;

  if (sessionId) {
    order = await prisma.paymentOrder.findUnique({
      where: { provider_providerOrderNo: { provider: 'stripe', providerOrderNo: sessionId } },
    });
  }
  if (!order && orderId) {
    order = await prisma.paymentOrder.findUnique({ where: { id: String(orderId) } });
    if (order && order.provider !== 'stripe') order = null;
  }

  if (!order) return { claimed: false, reason: 'order_not_found' };
  if (order.status === 'PAID') return { claimed: false, reason: 'already_paid' };

  if (paidCents && paidCents !== order.amountCents) {
    logger.error({ sessionId, expected: order.amountCents, got: paidCents }, '[stripe.settle] amount mismatch');
    await writeAdminLog({
      adminId: order.userId,
      action: 'PAYMENT_FAILED',
      targetType: 'PAYMENT',
      targetId: order.id,
      payload: { reason: 'AMOUNT_MISMATCH', expected: order.amountCents, got: paidCents, currency },
    });
    return { claimed: false, reason: 'amount_mismatch' };
  }

  const claim = await prisma.paymentOrder.updateMany({
    where: { id: order.id, status: 'PENDING' },
    data: { status: 'PAID', paidAt: new Date(), externalTradeNo: externalTradeNo || null },
  });
  if (claim.count === 0) return { claimed: false, reason: 'race_lost' };

  await applyPurchaseToUser({
    userId: order.userId,
    plan: order.plan,
    months: order.months,
    sourceOrderId: order.id,
    provider: order.provider,
    contractId: order.contractId,
  });

  await writeAdminLog({
    adminId: order.userId,
    action: 'PAYMENT_COMPLETED',
    targetType: 'PAYMENT',
    targetId: order.id,
    payload: { provider: 'stripe', amountCents: order.amountCents, sessionId, externalTradeNo, currency },
  });

  return { claimed: true };
}

module.exports = router;
module.exports.settleOrder = settleOrder;

