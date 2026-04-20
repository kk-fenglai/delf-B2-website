// Refresh-token lifecycle: issue, rotate, revoke.
//
// Design:
//   - Each refresh token has a RefreshToken DB row keyed by sha256(rawToken).
//     The raw token is only ever sent to the client; we store its hash so a
//     DB leak can't be used to forge or replay tokens.
//   - On /refresh we ROTATE: mark the presented token row revoked (reason=ROTATED),
//     then issue a new token whose `parentId` points at it. The client must use
//     the new token going forward.
//   - If the presented token row is ALREADY revoked, we treat it as token reuse
//     (attacker replaying a previously-rotated token) and revoke the entire
//     user+scope chain. This is the well-known OWASP-recommended refresh-token
//     rotation pattern.
const crypto = require('crypto');
const prisma = require('../prisma');
const {
  signUserRefreshToken,
  signAdminRefreshToken,
  verifyRefreshToken,
  parseDurationMs,
  REFRESH_EXPIRES,
  ADMIN_REFRESH_EXPIRES,
} = require('../utils/jwt');
const { logger } = require('../utils/logger');

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

function cuid() {
  // lightweight collision-resistant id; we don't need Prisma cuid() here since
  // we control the DB insert and can use randomBytes
  return 'c' + crypto.randomBytes(12).toString('hex');
}

/**
 * Issue a fresh refresh token pair (raw + DB row). Used on login / register.
 *
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {'user'|'admin'} opts.scope
 * @param {string} [opts.ip]
 * @param {string} [opts.userAgent]
 * @param {string} [opts.parentId]  only set when rotating; caller should use rotate()
 * @returns {Promise<{ raw: string, id: string, expiresAt: Date }>}
 */
async function issueRefreshToken({ userId, scope, ip, userAgent, parentId = null }) {
  const id = cuid();
  const ttl = parseDurationMs(scope === 'admin' ? ADMIN_REFRESH_EXPIRES : REFRESH_EXPIRES);
  const expiresAt = new Date(Date.now() + ttl);
  const raw =
    scope === 'admin'
      ? signAdminRefreshToken({ userId, jti: id })
      : signUserRefreshToken({ userId, jti: id });

  await prisma.refreshToken.create({
    data: {
      id,
      userId,
      tokenHash: sha256(raw),
      scope,
      parentId,
      ip: ip || null,
      userAgent: userAgent || null,
      expiresAt,
    },
  });
  return { raw, id, expiresAt };
}

/**
 * Revoke a specific refresh token row.
 */
async function revokeRefreshToken(id, reason) {
  await prisma.refreshToken.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/**
 * Revoke all active refresh tokens for a user (optionally within a single scope).
 * Returns number revoked.
 */
async function revokeAllForUser(userId, { scope = null, reason = 'ADMIN_REVOKE' } = {}) {
  const where = { userId, revokedAt: null };
  if (scope) where.scope = scope;
  const result = await prisma.refreshToken.updateMany({
    where,
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

/**
 * Verify + rotate. On success returns a new raw token + row.
 * On suspected reuse (presented token already revoked), revokes the whole
 * user+scope chain and throws a REUSE error.
 *
 * @param {Object} opts
 * @param {string} opts.rawToken   the client-supplied refresh token
 * @param {'user'|'admin'} opts.expectedScope
 * @param {string} [opts.ip]
 * @param {string} [opts.userAgent]
 * @returns {Promise<{ userId: string, newRaw: string, newId: string, expiresAt: Date }>}
 */
async function verifyAndRotate({ rawToken, expectedScope, ip, userAgent }) {
  let decoded;
  try {
    decoded = verifyRefreshToken(rawToken);
  } catch (e) {
    const err = new Error('Invalid refresh token');
    err.status = 401;
    err.code = 'REFRESH_INVALID';
    throw err;
  }
  if (decoded.scope !== expectedScope) {
    const err = new Error('Wrong token scope');
    err.status = 401;
    err.code = 'REFRESH_WRONG_SCOPE';
    throw err;
  }

  const row = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
  if (!row) {
    const err = new Error('Refresh token not recognized');
    err.status = 401;
    err.code = 'REFRESH_NOT_FOUND';
    throw err;
  }
  if (row.expiresAt < new Date()) {
    const err = new Error('Refresh token expired');
    err.status = 401;
    err.code = 'REFRESH_EXPIRED';
    throw err;
  }
  if (row.revokedAt) {
    // Reuse! Burn the entire chain for this user+scope as a precaution.
    const count = await revokeAllForUser(row.userId, {
      scope: row.scope,
      reason: 'REUSE_DETECTED',
    });
    logger.warn(
      { userId: row.userId, scope: row.scope, revokedCount: count, ip, userAgent },
      'refresh token reuse detected — revoked entire chain'
    );
    const err = new Error('Refresh token reuse detected — please login again');
    err.status = 401;
    err.code = 'REFRESH_REUSE';
    throw err;
  }

  // Normal rotation path.
  const newId = cuid();
  const ttl = parseDurationMs(row.scope === 'admin' ? ADMIN_REFRESH_EXPIRES : REFRESH_EXPIRES);
  const newExpiresAt = new Date(Date.now() + ttl);
  const newRaw =
    row.scope === 'admin'
      ? signAdminRefreshToken({ userId: row.userId, jti: newId })
      : signUserRefreshToken({ userId: row.userId, jti: newId });

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date(), revokedReason: 'ROTATED' },
    }),
    prisma.refreshToken.create({
      data: {
        id: newId,
        userId: row.userId,
        tokenHash: sha256(newRaw),
        scope: row.scope,
        parentId: row.id,
        ip: ip || null,
        userAgent: userAgent || null,
        expiresAt: newExpiresAt,
      },
    }),
  ]);

  return { userId: row.userId, newRaw, newId, expiresAt: newExpiresAt, scope: row.scope };
}

/**
 * Revoke by raw token (used for logout).
 */
async function revokeByRawToken(rawToken, reason = 'LOGOUT') {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(rawToken), revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

module.exports = {
  issueRefreshToken,
  verifyAndRotate,
  revokeRefreshToken,
  revokeAllForUser,
  revokeByRawToken,
  sha256,
};
