const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '14d';
const ADMIN_ACCESS_EXPIRES = process.env.JWT_ADMIN_ACCESS_EXPIRES || '30m';
const ADMIN_REFRESH_EXPIRES = process.env.JWT_ADMIN_REFRESH_EXPIRES || '2h';

function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
}

// Refresh token: carries jti that matches a RefreshToken row. Treat `raw` as
// the secret we hand to the client; its sha256 is what we store in DB.
function signUserRefreshToken({ userId, jti }) {
  return jwt.sign({ userId, jti, scope: 'user' }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES,
  });
}

function signAdminAccessToken(payload) {
  return jwt.sign({ ...payload, scope: 'admin' }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: ADMIN_ACCESS_EXPIRES,
  });
}

function signAdminRefreshToken({ userId, jti }) {
  return jwt.sign({ userId, jti, scope: 'admin' }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: ADMIN_REFRESH_EXPIRES,
  });
}

// Short-lived step-up token issued after password success, only usable to
// complete 2FA. Prevents replay of the password check.
function signTwoFactorPendingToken(payload) {
  return jwt.sign({ ...payload, scope: '2fa_pending' }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: '10m',
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

// Parse a duration like "14d" / "2h" / "30m" / "45s" into milliseconds.
function parseDurationMs(input) {
  const m = /^(\d+)\s*([smhd])$/i.exec(String(input).trim());
  if (!m) throw new Error(`bad duration: ${input}`);
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return n * mult;
}

module.exports = {
  signAccessToken,
  signUserRefreshToken,
  signAdminAccessToken,
  signAdminRefreshToken,
  signTwoFactorPendingToken,
  verifyAccessToken,
  verifyRefreshToken,
  sha256,
  parseDurationMs,
  ACCESS_EXPIRES,
  REFRESH_EXPIRES,
  ADMIN_ACCESS_EXPIRES,
  ADMIN_REFRESH_EXPIRES,
};
