const crypto = require('crypto');
const prisma = require('../prisma');
const wechat = require('./payments/wechat');
const alipay = require('./payments/alipay');
const env = require('../config/env');

const VALID_PLANS = ['FREE', 'STANDARD', 'AI', 'AI_UNLIMITED'];
const PLAN_RANK = { FREE: 0, STANDARD: 1, AI: 2, AI_UNLIMITED: 3 };

function assertPlan(plan) {
  if (!VALID_PLANS.includes(plan)) {
    const e = new Error('Invalid plan');
    e.status = 400;
    e.code = 'INVALID_PLAN';
    throw e;
  }
}

function addMonths(date, months) {
  // Billing periods: approximate month as 30 days to match existing admin renew logic.
  return new Date(date.getTime() + months * 30 * 24 * 3600 * 1000);
}

// Extend the user's subscription by `months` for `plan`. If the user already
// has a same-or-higher plan that hasn't expired, extend from the current end;
// otherwise start counting from now. Writes a Subscription row for the audit
// trail.
async function applyPurchaseToUser({ userId, plan, months, sourceOrderId, provider = null, contractId = null }) {
  assertPlan(plan);
  const m = Math.max(1, Number(months || 1));

  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, plan: true, subscriptionEnd: true },
  });
  if (!user) {
    const e = new Error('User not found');
    e.status = 404;
    throw e;
  }

  const currentActive = user.subscriptionEnd && user.subscriptionEnd > now;
  const keepRank = currentActive && PLAN_RANK[user.plan] >= PLAN_RANK[plan];
  const base = currentActive ? user.subscriptionEnd : now;
  const newEnd = addMonths(base, m);
  const nextPlan = keepRank ? user.plan : plan;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { plan: nextPlan, subscriptionEnd: newEnd },
    select: { id: true, plan: true, subscriptionEnd: true },
  });

  await prisma.subscription.create({
    data: {
      userId,
      plan,
      status: 'ACTIVE',
      startedAt: now,
      currentPeriodEnd: newEnd,
      autoRenew: !!contractId,
      provider,
      contractId,
      nextChargeAt: contractId ? newEnd : null,
      sourceOrderId: sourceOrderId || null,
    },
  });

  // If this purchase came from an auto-renew contract, advance the contract schedule.
  if (contractId) {
    await prisma.payContract.updateMany({
      where: { id: contractId, userId, status: 'ACTIVE' },
      data: {
        lastChargeAt: now,
        nextChargeAt: newEnd,
        failedCount: 0,
      },
    });
  }

  return updated;
}

// Revoke the entitlement granted by an order after a full refund. We subtract
// the order's months from subscriptionEnd; if the user still has paid months
// remaining keep them on that plan, else demote to FREE. Non-destructive: we
// never push subscriptionEnd past `now` in the past direction — just cap it.
async function revokePurchaseFromOrder(orderId) {
  const order = await prisma.paymentOrder.findUnique({
    where: { id: orderId },
    select: { userId: true, months: true, plan: true, status: true, refundedCents: true, amountCents: true },
  });
  if (!order) return null;

  const user = await prisma.user.findUnique({
    where: { id: order.userId },
    select: { plan: true, subscriptionEnd: true },
  });
  if (!user) return null;

  const now = new Date();
  const currentEnd = user.subscriptionEnd && user.subscriptionEnd > now ? user.subscriptionEnd : now;
  const rolledBackMs = Math.max(0, currentEnd.getTime() - order.months * 30 * 24 * 3600 * 1000);
  const newEnd = new Date(Math.max(rolledBackMs, now.getTime()));
  const nextPlan = newEnd.getTime() <= now.getTime() ? 'FREE' : user.plan;

  return prisma.user.update({
    where: { id: order.userId },
    data: { plan: nextPlan, subscriptionEnd: newEnd.getTime() <= now.getTime() ? null : newEnd },
    select: { id: true, plan: true, subscriptionEnd: true },
  });
}

// Given a priceId, look up price + product + resolve months/plan/amount.
// Throws with status codes the routes can surface to the client verbatim.
async function resolvePriceOrThrow(priceId) {
  const price = await prisma.price.findUnique({
    where: { id: priceId },
    include: { product: true },
  });
  if (!price || !price.active || !price.product.active) {
    const e = new Error('Price not available');
    e.status = 400;
    e.code = 'INVALID_PRICE';
    throw e;
  }
  return price;
}

// Manual refund orchestration. Admin-triggered flow:
//   1) Create RefundOrder row (PENDING).
//   2) Call channel refund API.
//   3) On channel success, update RefundOrder (SUCCEEDED) + bump
//      PaymentOrder.refundedCents. If fully refunded, flip order to REFUNDED
//      and revoke user entitlement.
// The channel's async refund notify (v1 skipped) would normally confirm step 3;
// treating the synchronous API response as authoritative is acceptable because
// both WeChat V3 refund and Alipay refund return the final state inline when
// successful. Partial refunds leave order in PAID; only a full refund flips
// status.
async function refundOrder({ orderId, amountCents, reason, operatorAdminId }) {
  const order = await prisma.paymentOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true, userId: true, provider: true, providerOrderNo: true,
      amountCents: true, refundedCents: true, status: true, months: true, plan: true,
    },
  });
  if (!order) {
    const e = new Error('Order not found'); e.status = 404; throw e;
  }
  if (order.status !== 'PAID' && order.status !== 'REFUNDED') {
    const e = new Error('Only PAID orders can be refunded');
    e.status = 400; e.code = 'ORDER_NOT_REFUNDABLE';
    throw e;
  }
  const maxRefundable = order.amountCents - order.refundedCents;
  if (amountCents > maxRefundable) {
    const e = new Error('Refund amount exceeds remaining refundable');
    e.status = 400; e.code = 'REFUND_AMOUNT_EXCEEDS';
    e.detail = { max: maxRefundable };
    throw e;
  }

  const outRefundNo = `rf_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  // 1) Pre-create the tracking row so even a channel error leaves an audit trail.
  const refund = await prisma.refundOrder.create({
    data: {
      orderId: order.id,
      amountCents,
      reason: reason || null,
      status: 'PENDING',
      operatorAdminId: operatorAdminId || null,
      externalRefundNo: outRefundNo,
    },
  });

  // 2) Call channel.
  try {
    if (order.provider === 'wechat') {
      if (!wechat.isEnabled()) throw Object.assign(new Error('WeChat Pay not configured'), { code: 'PAY_NOT_CONFIGURED', status: 503 });
      const base = env.PAY_PUBLIC_BASE_URL || (env.IS_PROD ? '' : 'http://localhost:4000');
      await wechat.refund({
        outTradeNo: order.providerOrderNo,
        outRefundNo,
        refundCents: amountCents,
        totalCents: order.amountCents,
        reason,
        notifyUrl: `${base}/api/pay/wechat/notify`,
      });
    } else if (order.provider === 'alipay') {
      if (!alipay.isEnabled()) throw Object.assign(new Error('Alipay not configured'), { code: 'PAY_NOT_CONFIGURED', status: 503 });
      await alipay.refund({
        outTradeNo: order.providerOrderNo,
        outRequestNo: outRefundNo,
        refundCents: amountCents,
        reason,
      });
    } else {
      const e = new Error(`Unknown provider ${order.provider}`);
      e.status = 400; throw e;
    }
  } catch (channelErr) {
    await prisma.refundOrder.update({
      where: { id: refund.id },
      data: { status: 'FAILED' },
    });
    channelErr.code = channelErr.code || 'REFUND_CHANNEL_FAILED';
    channelErr.status = channelErr.status || 502;
    throw channelErr;
  }

  // 3) Mark refund succeeded + propagate to order + revoke entitlement if full.
  const newRefundedTotal = order.refundedCents + amountCents;
  const fullRefund = newRefundedTotal >= order.amountCents;

  await prisma.$transaction([
    prisma.refundOrder.update({
      where: { id: refund.id },
      data: { status: 'SUCCEEDED' },
    }),
    prisma.paymentOrder.update({
      where: { id: order.id },
      data: {
        refundedCents: newRefundedTotal,
        status: fullRefund ? 'REFUNDED' : order.status,
      },
    }),
  ]);

  if (fullRefund) {
    await revokePurchaseFromOrder(order.id).catch(() => null);
  }

  return {
    refundId: refund.id,
    externalRefundNo: outRefundNo,
    amountCents,
    fullRefund,
    newRefundedTotal,
  };
}

module.exports = {
  VALID_PLANS,
  PLAN_RANK,
  addMonths,
  applyPurchaseToUser,
  revokePurchaseFromOrder,
  resolvePriceOrThrow,
  refundOrder,
};
