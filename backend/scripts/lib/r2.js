// Minimal Cloudflare R2 (S3-compatible) object uploader — zero dependencies.
// Implements AWS SigV4 for a single PutObject, signed with Node crypto and
// sent via global fetch. R2 uses region "auto" and service "s3", path-style
// endpoint https://<account>.r2.cloudflarestorage.com/<bucket>/<key>.
//
// Env required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
// R2_BUCKET, R2_PUBLIC_BASE (public r2.dev base, no trailing slash).

const crypto = require('crypto');

const sha256hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (key, str) => crypto.createHmac('sha256', key).update(str).digest();

function r2Config() {
  const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE'];
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`R2 缺少环境变量: ${missing.join(', ')}`);
  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKey: process.env.R2_ACCESS_KEY_ID,
    secretKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
    publicBase: process.env.R2_PUBLIC_BASE.replace(/\/+$/, ''),
  };
}

// Encode each path segment per RFC3986 but keep the slashes between them.
function encodeKey(key) {
  return key.split('/').map((s) => encodeURIComponent(s)).join('/');
}

// PUT one object. Returns the public URL.
async function putObject(key, body, contentType = 'application/octet-stream') {
  const cfg = r2Config();
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${cfg.bucket}/${encodeKey(key)}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const payloadHash = sha256hex(body);

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${cfg.secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const resp = await fetch(`https://${host}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`R2 PUT ${key} 失败: HTTP ${resp.status} ${text.slice(0, 300)}`);
  }
  return `${cfg.publicBase}/${encodeKey(key)}`;
}

module.exports = { putObject, r2Config };
