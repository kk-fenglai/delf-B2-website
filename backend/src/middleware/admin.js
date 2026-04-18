const { verifyAccessToken } = require('../utils/jwt');
const prisma = require('../prisma');

/**
 * requireAdmin — admin-scoped JWT check.
 *
 * Admin tokens are signed with `scope: "admin"` after successful login + 2FA.
 * We also re-check DB `role` on every request (defense in depth: if we demote
 * a user, their old token stops working immediately).
 */
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  if (decoded.scope !== 'admin') {
    return res.status(403).json({ error: 'Admin token required' });
  }

  const admin = await prisma.user.findUnique({
    where: { id: decoded.userId },
    select: { id: true, email: true, name: true, role: true, status: true },
  });
  if (!admin || admin.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'Admin account inactive' });
  }
  if (admin.role !== 'ADMIN' && admin.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Not an admin' });
  }

  req.admin = admin;
  req.userId = admin.id;
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.admin?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Super admin required' });
  }
  next();
}

/**
 * ipAllowlist — optional IP whitelist for admin endpoints.
 * Set ADMIN_IP_ALLOWLIST="1.2.3.4,5.6.7.8" in env to enable.
 * Empty/unset = allow all (dev convenience). Prod strongly recommended.
 */
function ipAllowlist(req, res, next) {
  const allow = (process.env.ADMIN_IP_ALLOWLIST || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allow.length === 0) return next();
  const ip = req.ip?.replace('::ffff:', '') || '';
  if (!allow.includes(ip)) {
    return res.status(403).json({ error: 'IP not allowed' });
  }
  next();
}

/**
 * writeAdminLog — append-only audit trail.
 * Never throws: audit failure must NOT block business operations,
 * but we log it for observability.
 */
async function writeAdminLog({ adminId, action, targetType, targetId = null, payload = null, ip = null, userAgent = null }) {
  try {
    await prisma.adminLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        payload: payload ? JSON.stringify(payload) : null,
        ip,
        userAgent,
      },
    });
  } catch (e) {
    console.error('[AdminLog] write failed:', e.message);
  }
}

/**
 * requirePasswordReconfirm — for sensitive operations, require the admin
 * to re-enter their own password in the same request (header: X-Admin-Password).
 * Prevents a stolen session token from performing destructive actions.
 */
async function requirePasswordReconfirm(req, res, next) {
  const pwd = req.headers['x-admin-password'];
  if (!pwd) return res.status(403).json({ error: 'Re-confirm password required', code: 'RECONFIRM_REQUIRED' });
  const bcrypt = require('bcryptjs');
  const full = await prisma.user.findUnique({ where: { id: req.admin.id }, select: { passwordHash: true } });
  const ok = await bcrypt.compare(String(pwd), full.passwordHash);
  if (!ok) return res.status(403).json({ error: 'Password re-confirm failed', code: 'RECONFIRM_FAILED' });
  next();
}

function clientIp(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) || req.ip || '';
}

module.exports = {
  requireAdmin,
  requireSuperAdmin,
  ipAllowlist,
  writeAdminLog,
  requirePasswordReconfirm,
  clientIp,
};
