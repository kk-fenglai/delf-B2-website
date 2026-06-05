// Short-lived HMAC tokens for streaming listening-question audio. The token
// is filename-bound so a leaked token only grants access to that one file
// (and only until exp). Signed with JWT_ACCESS_SECRET so we don't introduce
// a new secret to manage.
//
// Token format (URL-safe, compact):
//   "<exp_unix_seconds>.<base64url(hmac_sha256(secret, filename + '.' + exp))>"
//
// We avoid jsonwebtoken framing because the payload is fixed and we want the
// token short enough to live in an <audio src> query string.

const crypto = require('crypto');

const DEFAULT_TTL_SEC = 60 * 60; // 1h — covers a full mock exam session

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function hmac(filename, exp) {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not set');
  return crypto.createHmac('sha256', secret)
    .update(`${filename}.${exp}`)
    .digest();
}

function sign(filename, ttlSec = DEFAULT_TTL_SEC) {
  const exp = Math.floor(Date.now() / 1000) + Math.max(1, ttlSec);
  const sig = b64url(hmac(filename, exp));
  return `${exp}.${sig}`;
}

// Returns { ok: true } on success, { ok: false, reason } otherwise.
// Uses timingSafeEqual to avoid timing leaks on the signature comparison.
function verify(filename, token) {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'missing' };
  const dot = token.indexOf('.');
  if (dot <= 0) return { ok: false, reason: 'malformed' };
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(exp)) return { ok: false, reason: 'malformed' };
  if (Math.floor(Date.now() / 1000) > exp) return { ok: false, reason: 'expired' };

  let expectedB64;
  try {
    expectedB64 = b64url(hmac(filename, exp));
  } catch {
    return { ok: false, reason: 'server' };
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedB64);
  if (a.length !== b.length) return { ok: false, reason: 'badsig' };
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'badsig' };
  return { ok: true, exp };
}

// Convenience: rewrite an existing audioUrl like "/api/audio/fei/xxx.mp3"
// to its signed form. No-ops for URLs that don't match the fei mount or are
// already external (http://, etc.) — those are passed through unchanged.
const FEI_PREFIX = '/api/audio/fei/';

function signAudioUrl(audioUrl, ttlSec) {
  if (!audioUrl || typeof audioUrl !== 'string') return audioUrl || null;
  if (!audioUrl.startsWith(FEI_PREFIX)) return audioUrl;
  // Strip any existing query so we don't double-append `?t=`.
  const pathOnly = audioUrl.split('?')[0];
  const filename = pathOnly.slice(FEI_PREFIX.length);
  if (!filename) return audioUrl;
  return `${pathOnly}?t=${sign(filename, ttlSec)}`;
}

module.exports = {
  sign,
  verify,
  signAudioUrl,
  FEI_PREFIX,
  DEFAULT_TTL_SEC,
};
