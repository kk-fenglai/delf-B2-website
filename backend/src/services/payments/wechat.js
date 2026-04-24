// WeChat Pay V3 wrapper. Covers: Native QR order, order query, order close,
// refund, notify signature verification, notify resource AES-GCM decryption,
// and periodic payment (papay) contract sign + charge.
//
// Signing/verification is implemented with Node crypto directly (V3 spec is
// simple enough — the wechatpay-axios-plugin SDK is installed only for
// optional certificate auto-rotation, not depended on at runtime here).

const axios = require('axios');
const crypto = require('crypto');
const env = require('../../config/env');

const API_BASE = 'https://api.mch.weixin.qq.com';
const AUTH_SCHEMA = 'WECHATPAY2-SHA256-RSA2048';

function isEnabled() {
  return env.WECHAT_CONFIGURED;
}

function assertEnabled() {
  if (!isEnabled()) {
    const e = new Error('WeChat Pay not configured');
    e.status = 503;
    e.code = 'PAY_NOT_CONFIGURED';
    throw e;
  }
}

// --------- signing (outgoing requests) ---------

function buildAuthHeader({ method, urlPath, body = '' }) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(payload);
  const signature = signer.sign(env.WECHAT.PRIVATE_KEY_PEM, 'base64');
  return (
    `${AUTH_SCHEMA} ` +
    `mchid="${env.WECHAT.MCHID}",` +
    `nonce_str="${nonce}",` +
    `timestamp="${timestamp}",` +
    `serial_no="${env.WECHAT.SERIAL_NO}",` +
    `signature="${signature}"`
  );
}

async function v3Request(method, urlPath, body) {
  assertEnabled();
  const bodyStr = body ? JSON.stringify(body) : '';
  const authorization = buildAuthHeader({ method, urlPath, body: bodyStr });
  const url = `${API_BASE}${urlPath}`;

  try {
    const { data } = await axios({
      method,
      url,
      data: body || undefined,
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'DELFluent/1.0',
      },
      timeout: 10_000,
    });
    return data;
  } catch (err) {
    // Pass up channel error for route-level classification.
    const e = new Error(`WeChat V3 ${method} ${urlPath} failed: ${err.response?.data?.code || err.message}`);
    e.status = err.response?.status || 502;
    e.code = err.response?.data?.code || 'WECHAT_REQUEST_FAILED';
    e.detail = err.response?.data || null;
    throw e;
  }
}

// --------- notify verification (incoming callbacks) ---------

// rawBody: the exact string body as received (before JSON.parse)
// Returns true on match, false otherwise. Never throws — caller decides the
// HTTP response to send back to WeChat.
function verifyNotifySignature({ timestamp, nonce, signature, rawBody }) {
  if (!isEnabled() || !timestamp || !nonce || !signature || !rawBody) return false;
  const payload = `${timestamp}\n${nonce}\n${rawBody}\n`;
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(payload);
    return verifier.verify(env.WECHAT.PLATFORM_CERT_PEM, signature, 'base64');
  } catch {
    return false;
  }
}

// AES-256-GCM decrypt the `resource` block in the notify body using APIv3 key.
function decryptResource(resource) {
  if (!resource || !resource.ciphertext || !resource.nonce) return null;
  const key = Buffer.from(env.WECHAT.APIV3_KEY, 'utf8');
  if (key.length !== 32) throw new Error('WECHAT_APIV3_KEY must be 32 bytes');
  const ciphertext = Buffer.from(resource.ciphertext, 'base64');
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(resource.nonce, 'utf8'));
  decipher.setAuthTag(authTag);
  if (resource.associated_data) decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  return JSON.parse(plaintext);
}

// --------- one-shot Native QR ---------

async function createNativeOrder({ outTradeNo, description, amountCents, notifyUrl }) {
  const body = {
    appid: env.WECHAT.APP_ID,
    mchid: env.WECHAT.MCHID,
    description,
    out_trade_no: outTradeNo,
    notify_url: notifyUrl,
    amount: { total: amountCents, currency: 'CNY' },
  };
  const data = await v3Request('POST', '/v3/pay/transactions/native', body);
  return { codeUrl: data.code_url };
}

async function queryByOutTradeNo(outTradeNo) {
  const urlPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${env.WECHAT.MCHID}`;
  return v3Request('GET', urlPath);
}

async function closeOrder(outTradeNo) {
  const urlPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`;
  const body = { mchid: env.WECHAT.MCHID };
  await v3Request('POST', urlPath, body);
}

async function refund({ outTradeNo, outRefundNo, refundCents, totalCents, reason, notifyUrl }) {
  const body = {
    out_trade_no: outTradeNo,
    out_refund_no: outRefundNo,
    reason: reason || undefined,
    notify_url: notifyUrl,
    amount: { refund: refundCents, total: totalCents, currency: 'CNY' },
  };
  return v3Request('POST', '/v3/refund/domestic/refunds', body);
}

// --------- periodic payment (papay) ---------
//
// NOTE: WeChat周期扣款 requires the merchant to be separately approved
// (开通周期扣款能力). These routes will return channel errors until approval
// is granted; the endpoints themselves are ready.

async function createContractSignUrl({ planId, contractCode, returnUrl, notifyUrl, outerId }) {
  // Constructs a browser-redirect URL where the user can sign a papay contract.
  // planId is the template configured in the WeChat merchant portal.
  const body = {
    plan_id: planId,
    contract_code: contractCode,
    request_serial: Date.now().toString(),
    contract_display_account: 'DELFluent auto-renew',
    notify_url: notifyUrl,
    return_url: returnUrl,
    outer_id: outerId || undefined,
  };
  const data = await v3Request('POST', '/v3/papay/contracts/pre-entrust-web', body);
  return { redirectUrl: data.signing_url || data.redirect_url };
}

async function payByContract({ outTradeNo, description, amountCents, contractId, notifyUrl }) {
  const body = {
    appid: env.WECHAT.APP_ID,
    mchid: env.WECHAT.MCHID,
    description,
    out_trade_no: outTradeNo,
    notify_url: notifyUrl,
    amount: { total: amountCents, currency: 'CNY' },
    contract_id: contractId,
  };
  return v3Request('POST', '/v3/pay/partner/transactions/contract', body);
}

async function terminateContract({ contractId, remark }) {
  const urlPath = `/v3/papay/contracts/${encodeURIComponent(contractId)}/terminate`;
  return v3Request('POST', urlPath, { remark: remark || 'user requested' });
}

module.exports = {
  isEnabled,
  verifyNotifySignature,
  decryptResource,
  createNativeOrder,
  queryByOutTradeNo,
  closeOrder,
  refund,
  createContractSignUrl,
  payByContract,
  terminateContract,
};
