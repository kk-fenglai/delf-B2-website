// User-scope auth middleware. Unlike purely-stateless JWT check, we look up
// the user in DB on every request so that suspensions / soft-deletes / role
// changes take effect immediately — the JWT's lifetime no longer buys a
// banned user extra time.
//
// Trade-off: one extra DB round-trip per request. Acceptable for our scale;
// the user row is tiny and already indexed by primary key.

const { verifyAccessToken } = require('../utils/jwt');
const prisma = require('../prisma');

// Paths that a logged-in but email-unverified user can still hit. Keep tight.
const EMAIL_UNVERIFIED_ALLOW = new Set([
  '/api/user/me',
  '/api/auth/resend-verification',
  '/api/auth/verify-email',
  '/api/auth/logout',
]);

async function loadUserForToken(token) {
  const decoded = verifyAccessToken(token);
  if (decoded.scope === 'admin' || decoded.scope === '2fa_pending') {
    const e = new Error('Wrong token scope');
    e.status = 403;
    throw e;
  }
  const user = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: {
      id: true, email: true, name: true, plan: true, role: true,
      status: true, deletedAt: true, emailVerified: true,
      subscriptionEnd: true,
    },
  });
  if (!user) {
    const e = new Error('User not found');
    e.status = 401;
    throw e;
  }
  if (user.status !== 'ACTIVE' || user.deletedAt) {
    const e = new Error('Account inactive');
    e.status = 401;
    e.code = 'ACCOUNT_INACTIVE';
    throw e;
  }
  return { user, decoded };
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const { user, decoded } = await loadUserForToken(token);

    // Email verification gate: only allow whitelisted routes when unverified.
    if (!user.emailVerified && !EMAIL_UNVERIFIED_ALLOW.has(req.path) && !EMAIL_UNVERIFIED_ALLOW.has(req.baseUrl + req.path)) {
      return res.status(403).json({ error: '请先验证邮箱', code: 'EMAIL_NOT_VERIFIED' });
    }

    req.user = user;
    req.userId = user.id;
    req.userPlan = user.plan;
    req.impersonatedBy = decoded.impersonatedBy || null;
    next();
  } catch (e) {
    if (e?.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (e?.name === 'JsonWebTokenError' || e?.name === 'NotBeforeError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (e?.status) return res.status(e.status).json({ error: e.message, code: e.code });
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// Attach user if token present and valid; never reject. Use for public endpoints
// that vary response based on auth (e.g. "is this exam free-preview or paid?").
async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next();
  try {
    const { user, decoded } = await loadUserForToken(token);
    req.user = user;
    req.userId = user.id;
    req.userPlan = user.plan;
    req.impersonatedBy = decoded.impersonatedBy || null;
  } catch { /* ignore */ }
  next();
}

// Additional chainable guard: requires verified email even if middleware is
// applied on a whitelisted path.
function requireVerifiedEmail(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (!req.user.emailVerified) {
    return res.status(403).json({ error: '请先验证邮箱', code: 'EMAIL_NOT_VERIFIED' });
  }
  next();
}

module.exports = { requireAuth, optionalAuth, requireVerifiedEmail };
