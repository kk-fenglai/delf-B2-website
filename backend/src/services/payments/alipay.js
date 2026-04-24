// Alipay wrapper. Uses the official alipay-sdk for OpenAPI request/response
// signing (RSA2). Covers: precreate (Native QR), trade.query, trade.close,
// refund, RSA2 notify verification, and cycle agreement sign + charge.

const { AlipaySdk } = require('alipay-sdk');
const env = require('../../config/env');

let sdk = null;
function getSdk() {
  if (!env.ALIPAY_CONFIGURED) return null;
  if (!sdk) {
    sdk = new AlipaySdk({
      appId: env.ALIPAY.APP_ID,
      privateKey: env.ALIPAY.PRIVATE_KEY_PEM,
      alipayPublicKey: env.ALIPAY.PUBLIC_KEY_PEM,
      gateway: env.ALIPAY.GATEWAY,
      signType: 'RSA2',
      timeout: 10_000,
    });
  }
  return sdk;
}

function isEnabled() {
  return env.ALIPAY_CONFIGURED;
}

function assertEnabled() {
  if (!isEnabled()) {
    const e = new Error('Alipay not configured');
    e.status = 503;
    e.code = 'PAY_NOT_CONFIGURED';
    throw e;
  }
}

// Alipay sends numeric fen? no — amount is in yuan string with 2 decimals.
function centsToYuanString(cents) {
  return (cents / 100).toFixed(2);
}

// --------- notify verification ---------

// Verifies an alipay async-notify body. `body` is the parsed application/x-www-form-urlencoded
// key/value map as received. Returns true on match.
function verifyNotify(body) {
  const s = getSdk();
  if (!s) return false;
  try {
    return s.checkNotifySignV2(body);
  } catch {
    return false;
  }
}

// --------- one-shot precreate (Native QR) ---------

async function createPrecreate({ outTradeNo, subject, amountCents, notifyUrl }) {
  assertEnabled();
  const s = getSdk();
  const result = await s.exec('alipay.trade.precreate', {
    notify_url: notifyUrl,
    bizContent: {
      out_trade_no: outTradeNo,
      subject,
      total_amount: centsToYuanString(amountCents),
    },
  });
  if (result.code !== '10000') {
    const e = new Error(`alipay.trade.precreate failed: ${result.subMsg || result.msg}`);
    e.code = result.subCode || 'ALIPAY_PRECREATE_FAILED';
    e.status = 502;
    throw e;
  }
  return { codeUrl: result.qrCode };
}

async function tradeQuery(outTradeNo) {
  assertEnabled();
  const s = getSdk();
  return s.exec('alipay.trade.query', { bizContent: { out_trade_no: outTradeNo } });
}

async function tradeClose(outTradeNo) {
  assertEnabled();
  const s = getSdk();
  return s.exec('alipay.trade.close', { bizContent: { out_trade_no: outTradeNo } });
}

async function refund({ outTradeNo, outRequestNo, refundCents, reason }) {
  assertEnabled();
  const s = getSdk();
  return s.exec('alipay.trade.refund', {
    bizContent: {
      out_trade_no: outTradeNo,
      out_request_no: outRequestNo,
      refund_amount: centsToYuanString(refundCents),
      refund_reason: reason || undefined,
    },
  });
}

// --------- cycle agreement (periodic deduction) ---------

async function createAgreementSignUrl({ periodRule, externalAgreementNo, notifyUrl, returnUrl }) {
  assertEnabled();
  const s = getSdk();
  // alipay.user.agreement.page.sign is a page-return API. SDK returns the
  // complete form URL when called with `method=GET`.
  const form = s.pageExec('alipay.user.agreement.page.sign', {
    method: 'GET',
    notify_url: notifyUrl,
    return_url: returnUrl,
    bizContent: {
      personal_product_code: 'CYCLE_PAY_AUTH_P',
      sign_scene: 'INDUSTRY|DELFLUENT',
      external_agreement_no: externalAgreementNo,
      access_params: { channel: 'ALIPAYAPP' },
      period_rule_params: periodRule,
      product_code: 'GENERAL_WITHHOLDING',
    },
  });
  return { redirectUrl: form };
}

async function agreementPay({ outTradeNo, subject, amountCents, agreementNo, notifyUrl }) {
  assertEnabled();
  const s = getSdk();
  return s.exec('alipay.trade.pay', {
    notify_url: notifyUrl,
    bizContent: {
      out_trade_no: outTradeNo,
      subject,
      total_amount: centsToYuanString(amountCents),
      product_code: 'GENERAL_WITHHOLDING',
      agreement_params: { agreement_no: agreementNo },
    },
  });
}

async function unsignAgreement({ agreementNo }) {
  assertEnabled();
  const s = getSdk();
  return s.exec('alipay.user.agreement.unsign', {
    bizContent: { agreement_no: agreementNo },
  });
}

module.exports = {
  isEnabled,
  verifyNotify,
  createPrecreate,
  tradeQuery,
  tradeClose,
  refund,
  createAgreementSignUrl,
  agreementPay,
  unsignAgreement,
};
