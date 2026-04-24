const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');

const prisma = require('../../prisma');
const { requireAuth } = require('../../middleware/auth');
const env = require('../../config/env');
const wechat = require('../../services/payments/wechat');
const { resolvePriceOrThrow, applyPurchaseToUser } = require('../../services/billing');
const { writeAdminLog } = require('../../middleware/admin');
const { logger } = require('../../utils/logger');

const router = express.Router();

function notifyUrl(path) {
  const base = env.PAY_PUBLIC_BASE_URL || (env.IS_PROD ? '' : 'http://localhost:4000');
  return `${base}${path}`;
}

function frontendUrl(path) {
  const base = env.FRONTEND_URL || 'http://localhost:5173';
  return `${base}${path}`;
}

function randomOutTradeNo(prefix = 'wx') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

const createSchema = z.object({
  priceId: z.string().min(1),
});

const signSchema = z.object({
  priceId: z.string().min(1),
});

const unsignSchema = z.object({
  contractId: z.string().min(1),
});

// POST /api/pay/wechat/native — create a native QR order (PC scenario)
router.post('/native', requireAuth, async (req, res, next) => {
  try {
    const { priceId } = createSchema.parse(req.body);
    const price = await resolvePriceOrThrow(priceId);

    const providerOrderNo = randomOutTradeNo('wx');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const order = await prisma.paymentOrder.create({
      data: {
        userId: req.userId,
        provider: 'wechat',
        product: 'native_qr',
        plan: price.product.plan,
        months: price.months,
        priceId: price.id,
        currency: price.currency,
        amountCents: price.amountCents,
        status: 'PENDING',
        providerOrderNo,
        expiresAt,
      },
    });

    let codeUrl = null;
    let mock = false;

    if (wechat.isEnabled()) {
      const resp = await wechat.createNativeOrder({
        outTradeNo: providerOrderNo,
        description: `DELFluent ${price.product.name} ${price.months}m`,
        amountCents: price.amountCents,
        notifyUrl: notifyUrl('/api/pay/wechat/notify'),
      });
      codeUrl = resp.codeUrl;
    } else if (!env.IS_PROD && env.PAY_MOCK_ENABLED) {
      codeUrl = `weixin://wxpay/bizpayurl?pr=mock_${providerOrderNo}`;
      mock = true;
    } else {
      return res.status(503).json({ error: 'WeChat Pay not configured', code: 'PAY_NOT_CONFIGURED' });
    }

    await prisma.paymentOrder.update({ where: { id: order.id }, data: { codeUrl } });

    res.status(201).json({
      orderId: order.id,
      provider: 'wechat',
      product: order.product,
      amountCents: order.amountCents,
      currency: order.currency,
      codeUrl,
      expiresAt: order.expiresAt,
      mock,
    });
  } catch (e) { next(e); }
});

// POST /api/pay/wechat/sign — return a redirect URL for user to sign auto-renew contract.
router.post('/sign', requireAuth, async (req, res, next) => {
  try {
    if (!wechat.isEnabled()) {
      return res.status(503).json({ error: 'WeChat Pay not configured', code: 'PAY_NOT_CONFIGURED' });
    }

    const { priceId } = signSchema.parse(req.body);
    const price = await resolvePriceOrThrow(priceId);
    if (!price.supportsAutoRenew) {
      return res.status(400).json({ error: 'This price does not support auto-renew', code: 'AUTO_RENEW_NOT_SUPPORTED' });
    }

    const planId = process.env.WECHAT_PAPAY_PLAN_ID;
    if (!planId) {
      return res.status(501).json({ error: 'WECHAT_PAPAY_PLAN_ID not configured', code: 'PAY_NOT_CONFIGURED' });
    }

    // Create a local contract row first so notify can map outer_id back.
    const contract = await prisma.payContract.create({
      data: {
        userId: req.userId,
        priceId: price.id,
        provider: 'wechat',
        externalContractId: `pending_${crypto.randomBytes(10).toString('hex')}`,
        status: 'PENDING',
      },
    });

    const contractCode = `DLF_${req.userId.slice(0, 6)}_${Date.now()}`;
    const { redirectUrl } = await wechat.createContractSignUrl({
      planId,
      contractCode,
      returnUrl: frontendUrl('/orders'),
      notifyUrl: notifyUrl('/api/pay/wechat/notify'),
      outerId: contract.id,
    });

    res.json({ redirectUrl, contractId: contract.id });
  } catch (e) { next(e); }
});

// POST /api/pay/wechat/unsign — terminate a contract (best-effort channel call, always terminates locally).
router.post('/unsign', requireAuth, async (req, res, next) => {
  try {
    const { contractId } = unsignSchema.parse(req.body);
    const contract = await prisma.payContract.findUnique({ where: { id: contractId } });
    if (!contract || contract.userId !== req.userId) return res.status(404).json({ error: 'Contract not found' });
    if (contract.status === 'TERMINATED') return res.json({ ok: true, alreadyTerminated: true });

    let channelError = null;
    try {
      if (wechat.isEnabled() && contract.externalContractId) {
        await wechat.terminateContract({ contractId: contract.externalContractId, remark: 'user requested' });
      }
    } catch (err) {
      channelError = err.message;
      logger.warn({ err: err.message, contractId: contract.id }, '[wechat.unsign] channel terminate failed');
    }

    await prisma.payContract.update({
      where: { id: contract.id },
      data: { status: 'TERMINATED', terminatedAt: new Date() },
    });

    res.json({ ok: true, channelError });
  } catch (e) { next(e); }
});

// POST /api/pay/wechat/notify — V3 callback (signed + AES-GCM encrypted body)
//
// Must receive the raw body for signature verification. This router is mounted
// after index.js attaches `express.raw({ type: '*/*' })` middleware specifically
// for notify paths — see index.js.
router.post('/notify', async (req, res) => {
  try {
    // req.rawBody is populated by the express.json verify callback in index.js.
    // We cannot JSON.stringify req.body — the re-serialized form loses the
    // exact byte layout WeChat signed, so the verification would always fail.
    const rawBody = req.rawBody;
    if (!rawBody) {
      logger.warn('[wechat.notify] rawBody missing — verify middleware misconfigured');
      return res.status(500).json({ code: 'FAIL', message: 'server misconfig' });
    }
    const timestamp = req.header('Wechatpay-Timestamp');
    const nonce = req.header('Wechatpay-Nonce');
    const signature = req.header('Wechatpay-Signature');

    const ok = wechat.verifyNotifySignature({ timestamp, nonce, signature, rawBody });
    if (!ok) {
      logger.warn({ headers: req.headers }, '[wechat.notify] signature invalid');
      return res.status(401).json({ code: 'FAIL', message: 'invalid signature' });
    }

    const body = JSON.parse(rawBody);
    const resource = wechat.decryptResource(body.resource);
    if (!resource) return res.status(400).json({ code: 'FAIL', message: 'bad resource' });

    const eventType = body.event_type;
    const outTradeNo = resource.out_trade_no;

    if (eventType === 'TRANSACTION.SUCCESS') {
      if (resource.trade_state !== 'SUCCESS') {
        return res.json({ code: 'SUCCESS' });
      }
      const paidCents = resource.amount?.payer_total ?? resource.amount?.total;
      await settleOrder({ outTradeNo, externalTradeNo: resource.transaction_id, paidCents });
    } else if (eventType === 'PAPAY.CONTRACT.SIGNED' || eventType === 'CONTRACT.SIGNED') {
      await settleContractSigned({ resource });
    } else if (eventType === 'PAPAY.CONTRACT.TERMINATED' || eventType === 'CONTRACT.TERMINATED') {
      await settleContractTerminated({ resource });
    } else {
      logger.info({ eventType }, '[wechat.notify] ignored event');
    }

    res.json({ code: 'SUCCESS' });
  } catch (err) {
    logger.error({ err: err.message }, '[wechat.notify] handler error');
    res.status(500).json({ code: 'FAIL', message: 'internal error' });
  }
});

// Idempotent settlement — relies on the updateMany where-status=PENDING clause
// to gate the side effects. Shared by notify + reconcile worker.
async function settleOrder({ outTradeNo, externalTradeNo, paidCents }) {
  const order = await prisma.paymentOrder.findUnique({
    where: { provider_providerOrderNo: { provider: 'wechat', providerOrderNo: outTradeNo } },
  });
  if (!order) return { claimed: false, reason: 'order_not_found' };
  if (order.status === 'PAID') return { claimed: false, reason: 'already_paid' };

  if (paidCents && paidCents !== order.amountCents) {
    logger.error({ outTradeNo, expected: order.amountCents, got: paidCents }, '[wechat.settle] amount mismatch');
    await writeAdminLog({
      adminId: order.userId,
      action: 'PAYMENT_FAILED',
      targetType: 'PAYMENT',
      targetId: order.id,
      payload: { reason: 'AMOUNT_MISMATCH', expected: order.amountCents, got: paidCents },
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
    payload: { provider: 'wechat', amountCents: order.amountCents, outTradeNo, externalTradeNo },
  });

  return { claimed: true };
}

async function settleContractSigned({ resource }) {
  const externalContractId = resource.contract_id;
  const outerId = resource.outer_id; // we set this = internal PayContract.id at sign time
  if (!externalContractId || !outerId) return;

  await prisma.payContract.updateMany({
    where: { id: outerId, status: 'PENDING' },
    data: {
      externalContractId,
      status: 'ACTIVE',
      signedAt: new Date(),
      nextChargeAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    },
  });

  await writeAdminLog({
    adminId: outerId, // use contract id for now; refine when we surface in admin UI
    action: 'CONTRACT_SIGNED',
    targetType: 'CONTRACT',
    targetId: externalContractId,
    payload: { provider: 'wechat' },
  });
}

async function settleContractTerminated({ resource }) {
  const externalContractId = resource.contract_id;
  if (!externalContractId) return;
  await prisma.payContract.updateMany({
    where: { externalContractId, status: { in: ['PENDING', 'ACTIVE', 'SUSPENDED'] } },
    data: { status: 'TERMINATED', terminatedAt: new Date() },
  });
  await writeAdminLog({
    adminId: externalContractId,
    action: 'CONTRACT_TERMINATED',
    targetType: 'CONTRACT',
    targetId: externalContractId,
    payload: { provider: 'wechat', source: 'notify' },
  });
}

module.exports = router;
module.exports.settleOrder = settleOrder; // reused by reconcile worker
