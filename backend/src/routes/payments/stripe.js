const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');

const prisma = require('../../prisma');
const { requireAuth } = require('../../middleware/auth');
const env = require('../../config/env');
const stripePay = require('../../services/payments/stripe');
const {
  resolvePriceOrThrow,
  resolveStripeAnchorPrice,
  applyPurchaseToUser,
  computeUpgradeQuote,
  applyUpgradeToUser,
} = require('../../services/billing');
const { writeAdminLog } = require('../../middleware/admin');
const { logger } = require('../../utils/logger');
const { assertPaymentsEnabled, paymentsDisabledResponse, getBillingPolicy, isFreeCountry } = require('../../services/billingPolicy');
const { requestCountry } = require('../../utils/requestCountry');

// Free-country visitors (e.g. mainland China) use the platform for free and
// must never be charged. Reject checkout attempts from those regions.
async function assertNotFreeCountry(req) {
  const policy = await getBillingPolicy();
  if (isFreeCountry(requestCountry(req), policy)) {
    const e = new Error('您所在地区当前免费使用，无需付费订阅。');
    e.status = 403;
    e.code = 'FREE_REGION';
    throw e;
  }
}

const router = express.Router();

const checkoutSchema = z.object({
  priceId: z.string().min(1),
  subscribe: z.boolean().optional(),
});

// 3 consecutive failed renewal charges → suspend. Mirrors the China-direct
// channel reconcile worker policy in services/payments/reconcile.js.
const MAX_RENEWAL_FAILURES = 3;

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

function returnUrlForOrder(orderId) {
  const base = frontendUrl('/checkout/stripe/complete');
  return `${base}?session_id={CHECKOUT_SESSION_ID}&orderId=${encodeURIComponent(orderId)}`;
}

function stripeBillingPublic() {
  const embedded = stripePay.useEmbeddedCheckout();
  return {
    adaptivePricing: Boolean(env.STRIPE?.ADAPTIVE_PRICING),
    anchorCurrency: env.STRIPE?.ANCHOR_CURRENCY || 'EUR',
    checkoutMode: embedded ? 'embedded' : 'hosted',
  };
}

// GET /api/pay/stripe/config — publishable key + billing mode for the frontend SDK.
router.get('/config', (_req, res) => {
  if (!stripePay.isEnabled()) {
    return res.status(503).json({ error: 'Stripe not configured', code: 'PAY_NOT_CONFIGURED' });
  }
  const publishableKey = env.STRIPE?.PUBLISHABLE_KEY || '';
  if (!publishableKey) {
    return res.status(503).json({ error: 'Stripe publishable key not configured', code: 'PAY_NOT_CONFIGURED' });
  }
  res.json({ publishableKey, ...stripeBillingPublic() });
});

// GET /api/pay/stripe/session-status?session_id= — poll after return_url redirect.
router.get('/session-status', requireAuth, async (req, res, next) => {
  try {
    if (!stripePay.isEnabled()) {
      return res.status(503).json({ error: 'Stripe not configured', code: 'PAY_NOT_CONFIGURED' });
    }
    const sessionId = String(req.query.session_id || '').trim();
    if (!sessionId) {
      return res.status(400).json({ error: 'session_id required', code: 'INVALID_REQUEST' });
    }
    const session = await stripePay.retrieveCheckoutSession(sessionId);
    res.json(stripePay.sessionStatusPayload(session));
  } catch (e) { next(e); }
});

// GET /api/pay/stripe/checkout/:orderId/client-secret — resume an open embedded session.
router.get('/checkout/:orderId/client-secret', requireAuth, async (req, res, next) => {
  try {
    if (!stripePay.isEnabled()) {
      return res.status(503).json({ error: 'Stripe not configured', code: 'PAY_NOT_CONFIGURED' });
    }
    const order = await prisma.paymentOrder.findFirst({
      where: { id: req.params.orderId, userId: req.userId, provider: 'stripe', status: 'PENDING' },
    });
    if (!order?.providerOrderNo) {
      return res.status(404).json({ error: 'Pending Stripe order not found', code: 'ORDER_NOT_FOUND' });
    }
    const session = await stripePay.retrieveCheckoutSession(order.providerOrderNo);
    if (session.status !== 'open' || !session.client_secret) {
      return res.status(409).json({ error: 'Checkout session expired', code: 'SESSION_EXPIRED' });
    }
    res.json({
      orderId: order.id,
      sessionId: session.id,
      clientSecret: session.client_secret,
      checkoutMode: 'embedded',
    });
  } catch (e) { next(e); }
});

function randomProviderOrderNo(prefix = 'cs') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

// POST /api/pay/stripe/checkout — create a Stripe Checkout session and return redirect URL.
// `subscribe: true` opens a recurring subscription Checkout (requires Price.stripePriceId);
// otherwise creates a one-time payment session (existing behavior).
router.post('/checkout', requireAuth, async (req, res, next) => {
  try {
    await assertPaymentsEnabled();
    await assertNotFreeCountry(req);
    if (!stripePay.isEnabled()) {
      return res.status(503).json({ error: 'Stripe not configured', code: 'PAY_NOT_CONFIGURED' });
    }
    const { priceId, subscribe } = checkoutSchema.parse(req.body);
    let price = await resolvePriceOrThrow(priceId);

    if (env.STRIPE?.ADAPTIVE_PRICING) {
      price = await resolveStripeAnchorPrice(price, {
        anchorCurrency: env.STRIPE.ANCHOR_CURRENCY,
      });
    }

    const wantsSubscription = Boolean(subscribe);
    if (wantsSubscription) {
      if (!price.supportsAutoRenew || price.months !== 1) {
        return res.status(400).json({ error: 'This price does not support auto-renew', code: 'PRICE_NOT_SUBSCRIBABLE' });
      }
      // Prefer per-currency mapping table; fall back to legacy price.stripePriceId.
      const mapping = await prisma.priceStripeMapping.findUnique({
        where: { priceId_currency: { priceId: price.id, currency: String(price.currency || 'CNY').toUpperCase() } },
      });
      const stripeRecurringPriceId = mapping?.stripePriceId || price.stripePriceId || null;
      if (!stripeRecurringPriceId) {
        return res.status(400).json({
          error: 'Stripe recurring Price ID not configured for this plan/currency',
          code: 'INVALID_PRICE',
        });
      }
      price.stripePriceId = stripeRecurringPriceId;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true },
    });

    const providerOrderNo = randomProviderOrderNo(wantsSubscription ? 'cs_sub' : 'cs');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const order = await prisma.paymentOrder.create({
      data: {
        userId: req.userId,
        provider: 'stripe',
        product: wantsSubscription ? 'stripe_subscription' : 'stripe_checkout',
        plan: price.product.plan,
        months: price.months,
        priceId: price.id,
        currency: price.currency,
        amountCents: price.amountCents,
        status: 'PENDING',
        providerOrderNo, // overwritten to session.id after creation
        expiresAt,
      },
    });

    let session;
    try {
      session = await stripePay.createCheckoutSession({
        orderId: order.id,
        userId: req.userId,
        price,
        successUrl: successUrlForOrder(order.id),
        cancelUrl: cancelUrlForOrder(order.id),
        returnUrl: returnUrlForOrder(order.id),
        subscribe: wantsSubscription,
        customerEmail: user?.email || undefined,
      });
    } catch (err) {
      // Avoid leaving a hanging PENDING order if Stripe rejects session creation.
      const stripeCode = err?.code || err?.raw?.code || err?.raw?.decline_code || null;
      const stripeType = err?.type || err?.raw?.type || null;
      const stripeMessage = err?.message || err?.raw?.message || 'Stripe checkout session create failed';
      try {
        await prisma.paymentOrder.update({
          where: { id: order.id },
          data: { status: 'FAILED', externalTradeNo: stripeCode ? String(stripeCode).slice(0, 120) : null },
        });
        await writeAdminLog({
          adminId: order.userId,
          action: 'PAYMENT_FAILED',
          targetType: 'PAYMENT',
          targetId: order.id,
          payload: {
            provider: 'stripe',
            stage: 'checkout_session_create',
            stripeType,
            stripeCode,
            message: String(stripeMessage).slice(0, 400),
          },
        });
      } catch (logErr) {
        logger.error({ err: logErr, orderId: order.id }, '[stripe.checkout] failed to mark order FAILED after Stripe error');
      }
      return res.status(502).json({
        error: 'Stripe checkout unavailable, please retry later',
        code: 'STRIPE_CHECKOUT_CREATE_FAILED',
      });
    }

    if (session.embedded) {
      if (!session.clientSecret) {
        try {
          await prisma.paymentOrder.update({
            where: { id: order.id },
            data: { status: 'FAILED', externalTradeNo: 'NO_CLIENT_SECRET' },
          });
        } catch (logErr) {
          logger.error({ err: logErr, orderId: order.id }, '[stripe.checkout] failed to mark order FAILED after missing client_secret');
        }
        return res.status(502).json({
          error: 'Stripe returned no client secret — check ui_mode=elements and Stripe API version.',
          code: 'STRIPE_CHECKOUT_NO_SECRET',
        });
      }

      await prisma.paymentOrder.update({
        where: { id: order.id },
        data: { providerOrderNo: session.sessionId, redirectUrl: null },
      });

      return res.status(201).json({
        orderId: order.id,
        provider: 'stripe',
        mode: session.mode,
        checkoutMode: 'embedded',
        sessionId: session.sessionId,
        clientSecret: session.clientSecret,
      });
    }

    if (!session.url) {
      try {
        await prisma.paymentOrder.update({
          where: { id: order.id },
          data: { status: 'FAILED', externalTradeNo: 'NO_CHECKOUT_URL' },
        });
      } catch (logErr) {
        logger.error({ err: logErr, orderId: order.id }, '[stripe.checkout] failed to mark order FAILED after missing session.url');
      }
      return res.status(502).json({
        error: 'Stripe returned no checkout URL — check server Stripe SDK/API version and ui_mode (hosted redirect).',
        code: 'STRIPE_CHECKOUT_NO_URL',
      });
    }

    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { providerOrderNo: session.sessionId, redirectUrl: session.url },
    });

    res.status(201).json({
      orderId: order.id,
      provider: 'stripe',
      mode: session.mode,
      checkoutMode: 'hosted',
      redirectUrl: session.url,
    });
  } catch (e) {
    if (e.code === 'PAYMENTS_DISABLED') return paymentsDisabledResponse(e, res);
    if (e.code === 'FREE_REGION') return res.status(403).json({ error: e.message, code: e.code });
    next(e);
  }
});

// Charge currency for a prorated upgrade. With Adaptive Pricing the actual
// settlement is the EUR anchor, so quote + charge must use that; otherwise the
// caller's requested currency (default CNY, matching the catalog default).
function upgradeCurrency(requested) {
  if (env.STRIPE?.ADAPTIVE_PRICING) return String(env.STRIPE.ANCHOR_CURRENCY || 'EUR').toUpperCase();
  return String(requested || 'CNY').toUpperCase();
}

// GET /api/pay/stripe/upgrade/quote?plan=AI&currency=CNY — prorated upgrade quote.
router.get('/upgrade/quote', requireAuth, async (req, res, next) => {
  try {
    if (!stripePay.isEnabled()) {
      return res.status(503).json({ error: 'Stripe not configured', code: 'PAY_NOT_CONFIGURED' });
    }
    const toPlan = String(req.query.plan || '').toUpperCase();
    if (!toPlan) return res.status(400).json({ error: 'plan required', code: 'INVALID_REQUEST' });
    const quote = await computeUpgradeQuote({
      userId: req.userId,
      toPlan,
      currency: upgradeCurrency(req.query.currency),
    });
    res.json(quote);
  } catch (e) { next(e); }
});

const upgradeSchema = z.object({
  plan: z.string().min(1),
  currency: z.string().optional(),
});

// POST /api/pay/stripe/upgrade-checkout — start a Stripe Checkout for the
// prorated difference. Settles via the normal webhook (product='stripe_upgrade'
// → applyUpgradeToUser keeps the end date, only bumps the plan).
router.post('/upgrade-checkout', requireAuth, async (req, res, next) => {
  try {
    await assertPaymentsEnabled();
    await assertNotFreeCountry(req);
    if (!stripePay.isEnabled()) {
      return res.status(503).json({ error: 'Stripe not configured', code: 'PAY_NOT_CONFIGURED' });
    }
    const { plan, currency } = upgradeSchema.parse(req.body);
    const toPlan = plan.toUpperCase();
    const cur = upgradeCurrency(currency);

    const quote = await computeUpgradeQuote({ userId: req.userId, toPlan, currency: cur });
    if (!quote.eligible) {
      return res.status(400).json({ error: 'Upgrade not available', code: quote.reason });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });
    const providerOrderNo = randomProviderOrderNo('cs_up');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const order = await prisma.paymentOrder.create({
      data: {
        userId: req.userId,
        provider: 'stripe',
        product: 'stripe_upgrade',
        plan: toPlan,
        months: 0, // an upgrade does not extend the period
        priceId: null,
        currency: cur,
        amountCents: quote.amountCents,
        status: 'PENDING',
        providerOrderNo,
        expiresAt,
      },
    });

    // Synthetic price-like object: createCheckoutSession only needs amount,
    // currency, months, product.{plan,name} for a one-time (price_data) charge.
    const syntheticPrice = {
      id: order.id,
      code: `UPGRADE_${quote.fromPlan}_${toPlan}`,
      currency: cur,
      amountCents: quote.amountCents,
      months: 0,
      stripePriceId: null,
      product: { plan: toPlan, name: `Upgrade ${quote.fromPlan}→${toPlan}` },
    };

    let session;
    try {
      session = await stripePay.createCheckoutSession({
        orderId: order.id,
        userId: req.userId,
        price: syntheticPrice,
        successUrl: successUrlForOrder(order.id),
        cancelUrl: cancelUrlForOrder(order.id),
        returnUrl: returnUrlForOrder(order.id),
        subscribe: false,
        customerEmail: user?.email || undefined,
      });
    } catch (err) {
      await prisma.paymentOrder.update({ where: { id: order.id }, data: { status: 'FAILED' } }).catch(() => {});
      logger.error({ err: err?.message, orderId: order.id }, '[stripe.upgrade] checkout session create failed');
      return res.status(502).json({ error: 'Stripe checkout unavailable, please retry later', code: 'STRIPE_CHECKOUT_CREATE_FAILED' });
    }

    if (session.embedded) {
      if (!session.clientSecret) {
        await prisma.paymentOrder.update({ where: { id: order.id }, data: { status: 'FAILED', externalTradeNo: 'NO_CLIENT_SECRET' } }).catch(() => {});
        return res.status(502).json({ error: 'Stripe returned no client secret', code: 'STRIPE_CHECKOUT_NO_SECRET' });
      }
      await prisma.paymentOrder.update({ where: { id: order.id }, data: { providerOrderNo: session.sessionId, redirectUrl: null } });
      return res.status(201).json({
        orderId: order.id, provider: 'stripe', mode: session.mode,
        checkoutMode: 'embedded', sessionId: session.sessionId, clientSecret: session.clientSecret, quote,
      });
    }

    if (!session.url) {
      await prisma.paymentOrder.update({ where: { id: order.id }, data: { status: 'FAILED', externalTradeNo: 'NO_CHECKOUT_URL' } }).catch(() => {});
      return res.status(502).json({ error: 'Stripe returned no checkout URL', code: 'STRIPE_CHECKOUT_NO_URL' });
    }
    await prisma.paymentOrder.update({ where: { id: order.id }, data: { providerOrderNo: session.sessionId, redirectUrl: session.url } });
    return res.status(201).json({
      orderId: order.id, provider: 'stripe', mode: session.mode,
      checkoutMode: 'hosted', redirectUrl: session.url, quote,
    });
  } catch (e) {
    if (e.code === 'PAYMENTS_DISABLED') return paymentsDisabledResponse(e, res);
    if (e.code === 'FREE_REGION') return res.status(403).json({ error: e.message, code: e.code });
    next(e);
  }
});

// POST /api/pay/stripe/portal — Customer Portal redirect for the logged-in user.
// Looks up the most recent ACTIVE Stripe contract; returns 404 if user has none.
router.post('/portal', requireAuth, async (req, res, next) => {
  try {
    if (!stripePay.isEnabled()) {
      return res.status(503).json({ error: 'Stripe not configured', code: 'PAY_NOT_CONFIGURED' });
    }
    const contract = await prisma.payContract.findFirst({
      where: { userId: req.userId, provider: 'stripe', status: { in: ['ACTIVE', 'SUSPENDED'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!contract || !contract.stripeCustomerId) {
      return res.status(404).json({ error: 'No active Stripe subscription found', code: 'NO_STRIPE_CONTRACT' });
    }
    const { url } = await stripePay.createPortalSession({
      stripeCustomerId: contract.stripeCustomerId,
      returnUrl: frontendUrl('/orders'),
    });
    res.json({ url });
  } catch (e) { next(e); }
});

// POST /api/pay/stripe/webhook — signed webhook, uses raw body bytes.
// Handles: checkout.session.completed (both modes), checkout.session.async_payment_succeeded,
//          invoice.paid, invoice.payment_failed,
//          customer.subscription.updated, customer.subscription.deleted.
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.header('Stripe-Signature');
    const event = stripePay.verifyWebhookEvent({ rawBodyBuffer: req.rawBodyBuffer, signature });
    if (!event) {
      logger.warn('[stripe.webhook] signature invalid');
      return res.status(401).send('invalid signature');
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data?.object;
        if (session?.mode === 'subscription') {
          await handleSubscriptionCheckoutCompleted(session);
        } else {
          await handleOneTimeCheckoutCompleted(session);
        }
        break;
      }
      case 'invoice.paid': {
        await handleInvoicePaid(event.data?.object);
        break;
      }
      case 'invoice.payment_failed': {
        await handleInvoicePaymentFailed(event.data?.object);
        break;
      }
      case 'customer.subscription.updated': {
        await handleSubscriptionUpdated(event.data?.object);
        break;
      }
      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(event.data?.object);
        break;
      }
      default:
        logger.info({ type: event.type }, '[stripe.webhook] ignored event');
    }

    res.type('text').send('ok');
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, '[stripe.webhook] handler error');
    res.status(500).send('error');
  }
});

// --- One-time Checkout settle (existing flow, kept verbatim aside from currency check) ---
async function handleOneTimeCheckoutCompleted(session) {
  if (!session?.id) return;
  if (session.payment_status && session.payment_status !== 'paid') return;
  const orderId = session?.metadata?.orderId || session?.client_reference_id;
  const amountTotal = session?.amount_total;
  const currency = session?.currency ? String(session.currency).toUpperCase() : null;

  await settleOrder({
    sessionId: session.id,
    orderId,
    externalTradeNo: session?.payment_intent || session.id,
    paidCents: typeof amountTotal === 'number' ? amountTotal : null,
    currency,
    presentment: env.STRIPE?.ADAPTIVE_PRICING ? { paidCents: amountTotal, currency } : null,
  });
}

async function settleOrder({
  sessionId,
  orderId,
  externalTradeNo,
  paidCents,
  currency,
  presentment = null,
}) {
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

  const adaptive = env.STRIPE?.ADAPTIVE_PRICING;

  if (!adaptive) {
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

    if (currency && order.currency && currency !== order.currency.toUpperCase()) {
      logger.error({ sessionId, expected: order.currency, got: currency }, '[stripe.settle] currency mismatch');
      await writeAdminLog({
        adminId: order.userId,
        action: 'PAYMENT_FAILED',
        targetType: 'PAYMENT',
        targetId: order.id,
        payload: { reason: 'CURRENCY_MISMATCH', expected: order.currency, got: currency, paidCents },
      });
      return { claimed: false, reason: 'currency_mismatch' };
    }
  } else if (presentment?.currency && presentment.currency !== order.currency?.toUpperCase()) {
    logger.info(
      {
        sessionId,
        anchorCents: order.amountCents,
        anchorCurrency: order.currency,
        presentmentCents: presentment.paidCents,
        presentmentCurrency: presentment.currency,
      },
      '[stripe.settle] adaptive pricing presentment'
    );
  }

  const claim = await prisma.paymentOrder.updateMany({
    where: { id: order.id, status: 'PENDING' },
    data: { status: 'PAID', paidAt: new Date(), externalTradeNo: externalTradeNo || null },
  });
  if (claim.count === 0) return { claimed: false, reason: 'race_lost' };

  if (order.product === 'stripe_upgrade') {
    // Prorated upgrade: keep the end date, only bump the plan tier.
    await applyUpgradeToUser({
      userId: order.userId,
      toPlan: order.plan,
      sourceOrderId: order.id,
      provider: 'stripe',
    });
  } else {
    await applyPurchaseToUser({
      userId: order.userId,
      plan: order.plan,
      months: order.months,
      sourceOrderId: order.id,
      provider: order.provider,
      contractId: order.contractId,
    });
  }

  await writeAdminLog({
    adminId: order.userId,
    action: 'PAYMENT_COMPLETED',
    targetType: 'PAYMENT',
    targetId: order.id,
    payload: {
      provider: 'stripe',
      upgrade: order.product === 'stripe_upgrade',
      amountCents: order.amountCents,
      sessionId,
      externalTradeNo,
      currency: order.currency,
      ...(adaptive && presentment
        ? { presentmentCents: presentment.paidCents, presentmentCurrency: presentment.currency }
        : {}),
    },
  });

  return { claimed: true };
}

// --- Subscription lifecycle handlers ---

// First webhook in a subscription flow. Stripe has the customer + subscription
// objects ready; the first invoice arrives separately as `invoice.paid`. We
// only create the PayContract here and stamp the originating PaymentOrder with
// the contractId. Entitlement + new PaymentOrder rows for periods come from
// `invoice.paid` so renewals reuse the same code path.
async function handleSubscriptionCheckoutCompleted(session) {
  const orderId = session?.metadata?.orderId || session?.client_reference_id;
  const subscriptionId = typeof session?.subscription === 'string' ? session.subscription : session?.subscription?.id;
  const customerId = typeof session?.customer === 'string' ? session.customer : session?.customer?.id;

  if (!orderId || !subscriptionId || !customerId) {
    logger.warn({ orderId, subscriptionId, customerId }, '[stripe.webhook] subscription session missing fields');
    return;
  }

  const order = await prisma.paymentOrder.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, priceId: true, provider: true, contractId: true },
  });
  if (!order || order.provider !== 'stripe' || !order.priceId) {
    logger.warn({ orderId }, '[stripe.webhook] sub checkout: order missing/wrong provider');
    return;
  }

  // Idempotent: if a contract already exists for this Stripe sub id, reuse it.
  const existing = await prisma.payContract.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
  });
  let contractId = existing?.id;

  if (!existing) {
    const created = await prisma.payContract.create({
      data: {
        userId: order.userId,
        priceId: order.priceId,
        provider: 'stripe',
        externalContractId: subscriptionId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        status: 'ACTIVE',
        signedAt: new Date(),
      },
    });
    contractId = created.id;
  }

  if (!order.contractId) {
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { contractId },
    });
  }

  await writeAdminLog({
    adminId: order.userId,
    action: 'CONTRACT_SIGNED',
    targetType: 'CONTRACT',
    targetId: contractId,
    payload: { provider: 'stripe', stripeSubscriptionId: subscriptionId, stripeCustomerId: customerId },
  });
}

// Recurring + first-period charge entitlement source. Each invoice creates a
// fresh PaymentOrder (audit trail). The first invoice for a brand-new sub may
// arrive *before* `checkout.session.completed` — handle that ordering by
// reading the contract via stripeSubscriptionId; if missing, skip and let
// the session handler create it (Stripe will redeliver).
async function handleInvoicePaid(invoice) {
  if (!invoice?.id) return;
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (!subscriptionId) {
    logger.info({ invoiceId: invoice.id }, '[stripe.webhook] invoice.paid: not subscription, skipping');
    return;
  }

  const contract = await prisma.payContract.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
    include: { price: { include: { product: true } } },
  });
  if (!contract) {
    logger.warn({ invoiceId: invoice.id, subscriptionId }, '[stripe.webhook] invoice.paid: contract not found yet, will retry on Stripe redelivery');
    return;
  }
  if (!contract.price) {
    logger.error({ contractId: contract.id }, '[stripe.webhook] invoice.paid: contract has no price');
    return;
  }

  const amountPaid = typeof invoice.amount_paid === 'number' ? invoice.amount_paid : contract.price.amountCents;
  const currency = invoice.currency ? String(invoice.currency).toUpperCase() : contract.price.currency;
  const paymentIntentId = typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id;
  const periodEnd = invoice.lines?.data?.[0]?.period?.end
    ? new Date(invoice.lines.data[0].period.end * 1000)
    : null;

  // Idempotent insert via (provider, providerOrderNo) unique. If a duplicate
  // webhook arrives, P2002 fires and we treat it as already settled.
  let order;
  try {
    order = await prisma.paymentOrder.create({
      data: {
        userId: contract.userId,
        provider: 'stripe',
        product: 'stripe_subscription',
        plan: contract.price.product.plan,
        months: contract.price.months,
        priceId: contract.priceId,
        contractId: contract.id,
        currency,
        amountCents: amountPaid,
        status: 'PAID',
        providerOrderNo: invoice.id,
        externalTradeNo: paymentIntentId || invoice.id,
        paidAt: new Date(),
      },
    });
  } catch (e) {
    if (e.code === 'P2002') {
      logger.info({ invoiceId: invoice.id }, '[stripe.webhook] invoice.paid: already settled');
      return;
    }
    throw e;
  }

  await applyPurchaseToUser({
    userId: contract.userId,
    plan: contract.price.product.plan,
    months: contract.price.months,
    sourceOrderId: order.id,
    provider: 'stripe',
    contractId: contract.id,
  });

  // applyPurchaseToUser already updates contract.lastChargeAt + nextChargeAt
  // to subscriptionEnd; if Stripe gave us an explicit period end use that as
  // the more authoritative value.
  if (periodEnd) {
    await prisma.payContract.update({
      where: { id: contract.id },
      data: { nextChargeAt: periodEnd, lastChargeAt: new Date(), failedCount: 0 },
    });
  }

  await writeAdminLog({
    adminId: contract.userId,
    action: 'PAYMENT_COMPLETED',
    targetType: 'PAYMENT',
    targetId: order.id,
    payload: { provider: 'stripe', invoiceId: invoice.id, amountCents: amountPaid, currency, contractId: contract.id },
  });
}

async function handleInvoicePaymentFailed(invoice) {
  if (!invoice?.id) return;
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (!subscriptionId) return;

  const contract = await prisma.payContract.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
  });
  if (!contract) return;

  const failedCount = (contract.failedCount || 0) + 1;
  const status = failedCount >= MAX_RENEWAL_FAILURES ? 'SUSPENDED' : contract.status;

  await prisma.payContract.update({
    where: { id: contract.id },
    data: { failedCount, status },
  });

  await writeAdminLog({
    adminId: contract.userId,
    action: status === 'SUSPENDED' ? 'CONTRACT_SUSPENDED' : 'PAYMENT_FAILED',
    targetType: 'CONTRACT',
    targetId: contract.id,
    payload: { provider: 'stripe', invoiceId: invoice.id, failedCount },
  });
}

async function handleSubscriptionUpdated(subscription) {
  if (!subscription?.id) return;
  const contract = await prisma.payContract.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });
  if (!contract) return;

  const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;

  await prisma.payContract.update({
    where: { id: contract.id },
    data: {
      ...(periodEnd ? { nextChargeAt: periodEnd } : {}),
      // `cancel_at_period_end: true` means user cancelled in portal — still
      // ACTIVE until period rolls over. Stripe will fire customer.subscription.deleted
      // at that boundary which flips us to TERMINATED.
    },
  });
}

async function handleSubscriptionDeleted(subscription) {
  if (!subscription?.id) return;
  const contract = await prisma.payContract.findUnique({
    where: { stripeSubscriptionId: subscription.id },
  });
  if (!contract) return;

  await prisma.payContract.update({
    where: { id: contract.id },
    data: {
      status: 'TERMINATED',
      terminatedAt: new Date(),
    },
  });

  await writeAdminLog({
    adminId: contract.userId,
    action: 'CONTRACT_TERMINATED',
    targetType: 'CONTRACT',
    targetId: contract.id,
    payload: { provider: 'stripe', stripeSubscriptionId: subscription.id, reason: subscription.cancellation_details?.reason || null },
  });
}

module.exports = router;
module.exports.settleOrder = settleOrder;
