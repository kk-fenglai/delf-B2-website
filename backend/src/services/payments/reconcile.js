// Payment reconciliation worker. Runs in-process on a fixed interval.
// Three responsibilities:
//
//   1. Close expired PENDING orders — saves DB bloat and updates UX state.
//   2. Recover lost notifies — poll channel-side for any PENDING order that
//      was paid but never notified us back (fire-and-forget networks happen).
//   3. (Phase 5/6) Charge due auto-renew contracts.
//
// Design choices:
//   - Single-process. For horizontal scaling swap in a real queue.
//   - `prisma.paymentOrder.updateMany({ where: { id, status: 'PENDING' } })`
//     is the row-level claim primitive (same pattern as essayQueue).
//   - All failures are caught + logged; the worker never crashes the process.

const prisma = require('../../prisma');
const { logger } = require('../../utils/logger');
const wechat = require('./wechat');
const alipay = require('./alipay');
const stripe = require('./stripe');
const { resolvePriceOrThrow } = require('../billing');

const { settleOrder: wechatSettle } = require('../../routes/payments/wechat');
const { settleOrder: alipaySettle } = require('../../routes/payments/alipay');
const { settleOrder: stripeSettle } = require('../../routes/payments/stripe');

const TICK_MS = Number(process.env.PAY_RECONCILE_INTERVAL_MS || 10 * 60 * 1000); // 10 min

let running = false;
let timer = null;
let shuttingDown = false;
let inFlight = null; // promise of the currently executing tick, if any

async function closeExpired() {
  const now = new Date();
  const candidates = await prisma.paymentOrder.findMany({
    where: { status: 'PENDING', expiresAt: { lt: now } },
    select: { id: true, provider: true, providerOrderNo: true },
    take: 50,
  });

  for (const o of candidates) {
    try {
      // Best-effort channel close; swallow failures because we want to move on.
      if (o.provider === 'wechat' && wechat.isEnabled()) {
        await wechat.closeOrder(o.providerOrderNo).catch((e) => {
          logger.warn({ err: e.message, orderId: o.id }, '[reconcile.close] wechat close failed');
        });
      } else if (o.provider === 'alipay' && alipay.isEnabled()) {
        await alipay.tradeClose(o.providerOrderNo).catch((e) => {
          logger.warn({ err: e.message, orderId: o.id }, '[reconcile.close] alipay close failed');
        });
      } else if (o.provider === 'stripe') {
        // Stripe Checkout sessions naturally expire; no close call needed.
      }
      await prisma.paymentOrder.updateMany({
        where: { id: o.id, status: 'PENDING' },
        data: { status: 'CLOSED' },
      });
    } catch (err) {
      logger.error({ err: err.message, orderId: o.id }, '[reconcile.close] failed');
    }
  }
}

// For PENDING orders that are still within their window but older than 3min
// (i.e. user *might* have paid but we got no notify), poll the channel to
// recover any dropped settlements.
async function recoverLostNotifies() {
  const now = Date.now();
  const stale = new Date(now - 3 * 60 * 1000);

  const candidates = await prisma.paymentOrder.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: stale },
      expiresAt: { gt: new Date(now) },
    },
    select: { id: true, provider: true, providerOrderNo: true },
    take: 50,
  });

  for (const o of candidates) {
    try {
      if (o.provider === 'wechat' && wechat.isEnabled()) {
        const data = await wechat.queryByOutTradeNo(o.providerOrderNo);
        if (data.trade_state === 'SUCCESS') {
          const paidCents = data.amount?.payer_total ?? data.amount?.total;
          await wechatSettle({
            outTradeNo: o.providerOrderNo,
            externalTradeNo: data.transaction_id,
            paidCents,
          });
          logger.info({ orderId: o.id }, '[reconcile.recover] wechat settled via query');
        }
      } else if (o.provider === 'alipay' && alipay.isEnabled()) {
        const data = await alipay.tradeQuery(o.providerOrderNo);
        const status = data.tradeStatus || data.trade_status;
        if (status === 'TRADE_SUCCESS' || status === 'TRADE_FINISHED') {
          const total = data.totalAmount || data.total_amount;
          const paidCents = Math.round(parseFloat(total) * 100);
          await alipaySettle({
            outTradeNo: o.providerOrderNo,
            externalTradeNo: data.tradeNo || data.trade_no,
            paidCents,
          });
          logger.info({ orderId: o.id }, '[reconcile.recover] alipay settled via query');
        }
      } else if (o.provider === 'stripe' && stripe.isEnabled()) {
        const client = stripe.getClient();
        if (!client) continue;
        const session = await client.checkout.sessions.retrieve(o.providerOrderNo);
        if (session && session.payment_status === 'paid') {
          await stripeSettle({
            sessionId: session.id,
            orderId: session.metadata?.orderId || session.client_reference_id,
            externalTradeNo: session.payment_intent || session.id,
            paidCents: typeof session.amount_total === 'number' ? session.amount_total : null,
            currency: session.currency ? String(session.currency).toUpperCase() : null,
          });
          logger.info({ orderId: o.id }, '[reconcile.recover] stripe settled via query');
        }
      }
    } catch (err) {
      // Swallow — next tick will retry.
      logger.warn({ err: err.message, orderId: o.id }, '[reconcile.recover] query failed');
    }
  }
}

async function chargeDueContracts() {
  const now = new Date();
  const due = await prisma.payContract.findMany({
    where: { status: 'ACTIVE', nextChargeAt: { lte: now } },
    take: 10,
    include: { price: { include: { product: true } } },
  });
  for (const c of due) {
    // Best-effort row claim to reduce double-charging risk in dev. For multi-instance
    // deploys you still need a distributed lock/queue.
    const claimed = await prisma.payContract.updateMany({
      where: { id: c.id, status: 'ACTIVE', nextChargeAt: { lte: now } },
      data: { nextChargeAt: new Date(now.getTime() + 5 * 60 * 1000) }, // short bump while charging
    });
    if (claimed.count === 0) continue;

    try {
      const price = c.price || (await resolvePriceOrThrow(c.priceId));
      if (!price.supportsAutoRenew) {
        logger.warn({ contractId: c.id, priceId: c.priceId }, '[reconcile.charge] auto-renew not supported');
        continue;
      }

      const providerOrderNo = `${c.provider === 'wechat' ? 'wx' : 'ali'}_auto_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      // Create a PENDING order first for observability/idempotency.
      const order = await prisma.paymentOrder.create({
        data: {
          userId: c.userId,
          provider: c.provider,
          product: 'autopay',
          plan: price.product?.plan || c.price?.product?.plan || 'STANDARD',
          months: price.months || 1,
          priceId: price.id || c.priceId,
          contractId: c.id,
          currency: price.currency || 'CNY',
          amountCents: price.amountCents,
          status: 'PENDING',
          providerOrderNo,
          expiresAt,
        },
      });

      if (c.provider === 'wechat') {
        if (!wechat.isEnabled()) throw Object.assign(new Error('WeChat Pay not configured'), { code: 'PAY_NOT_CONFIGURED' });
        await wechat.payByContract({
          outTradeNo: providerOrderNo,
          description: `DELFluent ${price.product?.name || 'subscription'} ${price.months}m`,
          amountCents: price.amountCents,
          contractId: c.externalContractId,
          notifyUrl: (process.env.PAY_PUBLIC_BASE_URL || 'http://localhost:4000') + '/api/pay/wechat/notify',
        });
      } else if (c.provider === 'alipay') {
        if (!alipay.isEnabled()) throw Object.assign(new Error('Alipay not configured'), { code: 'PAY_NOT_CONFIGURED' });
        await alipay.agreementPay({
          outTradeNo: providerOrderNo,
          subject: `DELFluent ${price.product?.name || 'subscription'} ${price.months}m`,
          amountCents: price.amountCents,
          agreementNo: c.externalContractId,
          notifyUrl: (process.env.PAY_PUBLIC_BASE_URL || 'http://localhost:4000') + '/api/pay/alipay/notify',
        });
      }

      logger.info({ contractId: c.id, orderId: order.id }, '[reconcile.charge] submitted');
      // Settlement should arrive via notify; recoverLostNotifies will also query PENDING orders.
    } catch (err) {
      logger.warn({ err: err.message, contractId: c.id }, '[reconcile.charge] failed');
      const nextFailed = (c.failedCount || 0) + 1;
      await prisma.payContract.update({
        where: { id: c.id },
        data: {
          failedCount: nextFailed,
          status: nextFailed >= 3 ? 'SUSPENDED' : 'ACTIVE',
          nextChargeAt: new Date(Date.now() + 24 * 3600 * 1000), // retry next day
        },
      }).catch(() => null);
    }
  }
}

async function tick() {
  if (shuttingDown) return;
  try {
    await closeExpired();
    await recoverLostNotifies();
    await chargeDueContracts();
  } catch (err) {
    logger.error({ err: err.message }, '[reconcile] tick failed');
  }
}

function startWorker() {
  if (running) return;
  running = true;
  logger.info({ intervalMs: TICK_MS }, '[reconcile] worker started');
  timer = setInterval(() => {
    if (inFlight) return; // prevent overlap
    inFlight = tick().finally(() => {
      inFlight = null;
    });
  }, TICK_MS);
  // Fire once at startup so dev/test don't wait 10 minutes for the first cycle.
  inFlight = tick().finally(() => {
    inFlight = null;
  });
}

async function stopWorker() {
  shuttingDown = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (inFlight) {
    try { await Promise.race([inFlight, new Promise((r) => setTimeout(r, 8000))]); } catch { /* ignore */ }
  }
  running = false;
  logger.info('[reconcile] worker stopped');
}

module.exports = { startWorker, stopWorker };
