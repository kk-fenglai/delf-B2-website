const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');

const prisma = require('../../prisma');
const { requireAuth } = require('../../middleware/auth');
const env = require('../../config/env');
const alipay = require('../../services/payments/alipay');
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

function randomOutTradeNo(prefix = 'ali') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

const createSchema = z.object({
  priceId: z.string().min(1),
  product: z.enum(['precreate_qr', 'page_pay']).default('precreate_qr'),
});

const signSchema = z.object({
  priceId: z.string().min(1),
});

const unsignSchema = z.object({
  contractId: z.string().min(1),
});

// POST /api/pay/alipay/create
router.post('/create', requireAuth, async (req, res, next) => {
  try {
    const { priceId, product } = createSchema.parse(req.body);
    const price = await resolvePriceOrThrow(priceId);

    const providerOrderNo = randomOutTradeNo('ali');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const order = await prisma.paymentOrder.create({
      data: {
        userId: req.userId,
        provider: 'alipay',
        product,
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
    let redirectUrl = null;
    let mock = false;

    if (alipay.isEnabled() && product === 'precreate_qr') {
      const resp = await alipay.createPrecreate({
        outTradeNo: providerOrderNo,
        subject: `DELFluent ${price.product.name} ${price.months}m`,
        amountCents: price.amountCents,
        notifyUrl: notifyUrl('/api/pay/alipay/notify'),
      });
      codeUrl = resp.codeUrl;
    } else if (alipay.isEnabled() && product === 'page_pay') {
      // Page pay not wired up in v1. Fall through to 503 — keeps v1 scope small.
      return res.status(501).json({ error: 'page_pay not available in v1', code: 'NOT_IMPLEMENTED' });
    } else if (!env.IS_PROD && env.PAY_MOCK_ENABLED) {
      codeUrl = `https://example.com/mock-alipay-qr?o=${encodeURIComponent(providerOrderNo)}`;
      mock = true;
    } else {
      return res.status(503).json({ error: 'Alipay not configured', code: 'PAY_NOT_CONFIGURED' });
    }

    await prisma.paymentOrder.update({ where: { id: order.id }, data: { codeUrl, redirectUrl } });

    res.status(201).json({
      orderId: order.id,
      provider: 'alipay',
      product: order.product,
      amountCents: order.amountCents,
      currency: order.currency,
      codeUrl,
      redirectUrl,
      expiresAt: order.expiresAt,
      mock,
    });
  } catch (e) { next(e); }
});

// POST /api/pay/alipay/sign — redirect URL for agreement signing (auto-renew).
router.post('/sign', requireAuth, async (req, res, next) => {
  try {
    if (!alipay.isEnabled()) {
      return res.status(503).json({ error: 'Alipay not configured', code: 'PAY_NOT_CONFIGURED' });
    }
    const { priceId } = signSchema.parse(req.body);
    const price = await resolvePriceOrThrow(priceId);
    if (!price.supportsAutoRenew) {
      return res.status(400).json({ error: 'This price does not support auto-renew', code: 'AUTO_RENEW_NOT_SUPPORTED' });
    }

    // Create local contract first; we'll set agreement_no on notify.
    const contract = await prisma.payContract.create({
      data: {
        userId: req.userId,
        priceId: price.id,
        provider: 'alipay',
        externalContractId: `pending_${crypto.randomBytes(10).toString('hex')}`,
        status: 'PENDING',
      },
    });

    const periodRuleRaw = process.env.ALIPAY_PERIOD_RULE_JSON;
    if (!periodRuleRaw) {
      return res.status(501).json({ error: 'ALIPAY_PERIOD_RULE_JSON not configured', code: 'PAY_NOT_CONFIGURED' });
    }
    let periodRule;
    try { periodRule = JSON.parse(periodRuleRaw); } catch {
      return res.status(500).json({ error: 'ALIPAY_PERIOD_RULE_JSON invalid JSON', code: 'PAY_NOT_CONFIGURED' });
    }

    const { redirectUrl } = await alipay.createAgreementSignUrl({
      periodRule,
      externalAgreementNo: contract.id,
      notifyUrl: notifyUrl('/api/pay/alipay/notify'),
      returnUrl: frontendUrl('/orders'),
    });

    res.json({ redirectUrl, contractId: contract.id });
  } catch (e) { next(e); }
});

// POST /api/pay/alipay/unsign — best-effort channel unsign, always terminates locally.
router.post('/unsign', requireAuth, async (req, res, next) => {
  try {
    const { contractId } = unsignSchema.parse(req.body);
    const contract = await prisma.payContract.findUnique({ where: { id: contractId } });
    if (!contract || contract.userId !== req.userId) return res.status(404).json({ error: 'Contract not found' });
    if (contract.status === 'TERMINATED') return res.json({ ok: true, alreadyTerminated: true });

    let channelError = null;
    try {
      if (alipay.isEnabled() && contract.externalContractId) {
        await alipay.unsignAgreement({ agreementNo: contract.externalContractId });
      }
    } catch (err) {
      channelError = err.message;
      logger.warn({ err: err.message, contractId: contract.id }, '[alipay.unsign] channel unsign failed');
    }

    await prisma.payContract.update({
      where: { id: contract.id },
      data: { status: 'TERMINATED', terminatedAt: new Date() },
    });
    res.json({ ok: true, channelError });
  } catch (e) { next(e); }
});

// POST /api/pay/alipay/notify — alipay uses application/x-www-form-urlencoded
// Express's urlencoded middleware (mounted globally in index.js) parses it.
router.post('/notify', async (req, res) => {
  try {
    const body = req.body;
    const ok = alipay.verifyNotify(body);
    if (!ok) {
      logger.warn({ body }, '[alipay.notify] signature invalid');
      return res.status(401).send('failure');
    }

    // Agreement signing notify (auto-renew).
    // The payload shape differs from trade notify; the common marker is agreement_no.
    if (body.agreement_no && (body.external_agreement_no || body.status || body.agreement_status)) {
      const agreementNo = String(body.agreement_no);
      const externalAgreementNo = String(body.external_agreement_no || '');
      if (externalAgreementNo) {
        await prisma.payContract.updateMany({
          where: { id: externalAgreementNo, status: 'PENDING', provider: 'alipay' },
          data: {
            externalContractId: agreementNo,
            status: 'ACTIVE',
            signedAt: new Date(),
            nextChargeAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          },
        });
      }
      res.type('text').send('success');
      return;
    }

    const outTradeNo = body.out_trade_no;
    const status = body.trade_status;

    if (status === 'TRADE_SUCCESS' || status === 'TRADE_FINISHED') {
      const paidCents = Math.round(parseFloat(body.total_amount) * 100);
      await settleOrder({ outTradeNo, externalTradeNo: body.trade_no, paidCents });
    } else if (status === 'TRADE_CLOSED') {
      await prisma.paymentOrder.updateMany({
        where: { provider: 'alipay', providerOrderNo: outTradeNo, status: 'PENDING' },
        data: { status: 'CLOSED' },
      });
    } else {
      logger.info({ status }, '[alipay.notify] ignored status');
    }

    // Alipay expects exactly "success" as response body.
    res.type('text').send('success');
  } catch (err) {
    logger.error({ err: err.message }, '[alipay.notify] handler error');
    res.status(500).send('failure');
  }
});

async function settleOrder({ outTradeNo, externalTradeNo, paidCents }) {
  const order = await prisma.paymentOrder.findUnique({
    where: { provider_providerOrderNo: { provider: 'alipay', providerOrderNo: outTradeNo } },
  });
  if (!order) return { claimed: false, reason: 'order_not_found' };
  if (order.status === 'PAID') return { claimed: false, reason: 'already_paid' };

  if (paidCents && paidCents !== order.amountCents) {
    logger.error({ outTradeNo, expected: order.amountCents, got: paidCents }, '[alipay.settle] amount mismatch');
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
    payload: { provider: 'alipay', amountCents: order.amountCents, outTradeNo, externalTradeNo },
  });

  return { claimed: true };
}

module.exports = router;
module.exports.settleOrder = settleOrder;
