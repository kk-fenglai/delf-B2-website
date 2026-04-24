const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../prisma');
const {
  requireAdmin,
  requireSuperAdmin,
  requirePasswordReconfirm,
  writeAdminLog,
  clientIp,
} = require('../middleware/admin');
const { signAccessToken } = require('../utils/jwt');
const { revokeAllForUser } = require('../services/refreshTokens');
const passwordPolicy = require('../utils/passwordPolicy');
const { applyPurchaseToUser } = require('../services/billing');
const {
  sendMail,
  renderPasswordResetEmail,
  renderAdminPasswordChangedEmail,
} = require('../services/mailer');

const router = express.Router();
router.use(requireAdmin);

const VALID_PLANS = ['FREE', 'STANDARD', 'AI', 'AI_UNLIMITED'];
const VALID_STATUS = ['ACTIVE', 'SUSPENDED', 'DELETED'];
const VALID_ROLES = ['USER', 'ADMIN', 'SUPER_ADMIN'];

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

function maskEmail(email) {
  return email.replace(/(.{2}).*(@.*)/, '$1***$2');
}

// ------------------------------------------------------------------
// GET /admin/users — paginated list with filters
// ------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize) || 20);
    const q = (req.query.q || '').toString().trim();
    const plan = req.query.plan;
    const status = req.query.status || 'ACTIVE'; // default hide soft-deleted
    const role = req.query.role;
    const sort = req.query.sort || 'createdAt';
    const order = req.query.order === 'asc' ? 'asc' : 'desc';

    const where = {};
    if (q) where.OR = [{ email: { contains: q } }, { name: { contains: q } }];
    if (plan && VALID_PLANS.includes(plan)) where.plan = plan;
    if (status && status !== 'ALL') where.status = status;
    if (role && VALID_ROLES.includes(role)) where.role = role;

    const orderBy = { [sort]: order };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, email: true, name: true, plan: true, subscriptionEnd: true,
          role: true, status: true, loginCount: true, lastLoginAt: true,
          lastLoginIp: true, createdAt: true,
        },
      }),
    ]);

    // Mask emails in listing for defense-in-depth
    const masked = users.map((u) => ({ ...u, emailMasked: maskEmail(u.email) }));
    res.json({ total, page, pageSize, users: masked });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// GET /admin/users/:id — detail + login history + recent sessions
// ------------------------------------------------------------------
router.get('/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, email: true, name: true, plan: true, subscriptionEnd: true,
        role: true, status: true, loginCount: true, lastLoginAt: true,
        lastLoginIp: true, failedLoginCount: true, lockedUntil: true,
        deletedAt: true, createdAt: true, updatedAt: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [loginHistory, sessions, attemptCount] = await Promise.all([
      prisma.loginHistory.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      prisma.examSession.findMany({
        where: { userId: user.id },
        orderBy: { startedAt: 'desc' },
        take: 10,
        include: { examSet: { select: { title: true } } },
      }),
      prisma.userAttempt.count({ where: { userId: user.id } }),
    ]);

    res.json({ user, loginHistory, sessions, attemptCount });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// PATCH /admin/users/:id — update name / email / status / role
// Email/role changes require SUPER_ADMIN
// ------------------------------------------------------------------
const updateSchema = z.object({
  name: z.string().max(50).optional(),
  email: z.string().email().optional(),
  status: z.enum(VALID_STATUS).optional(),
  role: z.enum(VALID_ROLES).optional(),
});

router.patch('/:id', async (req, res, next) => {
  try {
    const data = updateSchema.parse(req.body);
    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'User not found' });

    // Guard: only super admin can change email or role
    if ((data.email || data.role) && req.admin.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Super admin required to change email or role' });
    }
    // Guard: cannot demote the last super admin
    if (data.role && before.role === 'SUPER_ADMIN' && data.role !== 'SUPER_ADMIN') {
      const count = await prisma.user.count({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' } });
      if (count <= 1) return res.status(400).json({ error: 'Cannot demote the last super admin' });
    }
    // Guard: cannot operate on yourself for role/status changes
    if ((data.role || data.status) && before.id === req.admin.id) {
      return res.status(400).json({ error: 'Cannot modify your own role/status' });
    }
    // Email unique
    if (data.email && data.email !== before.email) {
      const exists = await prisma.user.findUnique({ where: { email: data.email } });
      if (exists) return res.status(409).json({ error: 'Email already in use' });
    }

    const updated = await prisma.user.update({
      where: { id: before.id },
      data,
      select: { id: true, email: true, name: true, role: true, status: true },
    });

    await writeAdminLog({
      adminId: req.admin.id,
      action: 'USER_UPDATE',
      targetType: 'USER',
      targetId: before.id,
      payload: {
        before: { email: before.email, name: before.name, status: before.status, role: before.role },
        after: data,
      },
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
    });

    res.json(updated);
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// POST /admin/users/:id/change-plan — change plan + optional extend
// ------------------------------------------------------------------
const planSchema = z.object({
  plan: z.enum(VALID_PLANS),
  months: z.number().int().min(0).max(60).default(0),
});

router.post('/:id/change-plan', async (req, res, next) => {
  try {
    const { plan, months } = planSchema.parse(req.body);
    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'User not found' });

    let newEnd = before.subscriptionEnd;
    if (months > 0) {
      const base = (before.subscriptionEnd && before.subscriptionEnd > new Date())
        ? before.subscriptionEnd : new Date();
      newEnd = new Date(base.getTime() + months * 30 * 24 * 3600 * 1000);
    }

    const updated = await prisma.user.update({
      where: { id: before.id },
      data: { plan, subscriptionEnd: newEnd },
      select: { id: true, email: true, plan: true, subscriptionEnd: true },
    });

    await writeAdminLog({
      adminId: req.admin.id,
      action: 'PLAN_CHANGE',
      targetType: 'USER',
      targetId: before.id,
      payload: { from: { plan: before.plan, end: before.subscriptionEnd }, to: updated },
      ip: clientIp(req),
    });

    res.json(updated);
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// POST /admin/users/:id/renew — extend current plan by N months
// ------------------------------------------------------------------
const renewSchema = z.object({ months: z.number().int().min(1).max(60) });

router.post('/:id/renew', async (req, res, next) => {
  try {
    const { months } = renewSchema.parse(req.body);
    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ error: 'User not found' });

    // Renewing a FREE user has no entitlement semantics — refuse so admins use
    // change-plan for that case. Billing only knows how to extend a paid plan.
    if (!before.plan || before.plan === 'FREE') {
      return res.status(400).json({ error: 'User has no paid plan to renew; use change-plan instead' });
    }

    const updated = await applyPurchaseToUser({
      userId: before.id,
      plan: before.plan,
      months,
    });

    await writeAdminLog({
      adminId: req.admin.id,
      action: 'RENEW',
      targetType: 'USER',
      targetId: before.id,
      payload: { from: before.subscriptionEnd, to: updated.subscriptionEnd, months, plan: before.plan },
      ip: clientIp(req),
    });

    res.json({
      id: updated.id,
      email: before.email,
      plan: updated.plan,
      subscriptionEnd: updated.subscriptionEnd,
    });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// POST /admin/users/:id/reset-password
// Two modes:
//   mode=email (default) — send reset link to user's email
//   mode=direct — set password directly (requires X-Admin-Password re-confirm + SUPER_ADMIN)
// ------------------------------------------------------------------
const resetSchema = z.object({
  mode: z.enum(['email', 'direct']).default('email'),
  newPassword: z
    .string()
    .min(10)
    .max(100)
    .refine((p) => passwordPolicy.validate(p).ok, (p) => ({
      message: passwordPolicy.validate(p).reasons.join('; ') || 'Weak password',
    }))
    .optional(),
});

router.post('/:id/reset-password', async (req, res, next) => {
  try {
    const { mode, newPassword } = resetSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (mode === 'direct') {
      if (req.admin.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Super admin required for direct reset' });
      }
      // Require password re-confirm
      const pwd = req.headers['x-admin-password'];
      if (!pwd) return res.status(403).json({ error: 'Re-confirm password required', code: 'RECONFIRM_REQUIRED' });
      const me = await prisma.user.findUnique({ where: { id: req.admin.id }, select: { passwordHash: true } });
      const ok = await bcrypt.compare(String(pwd), me.passwordHash);
      if (!ok) return res.status(403).json({ error: 'Password re-confirm failed' });

      if (!newPassword) return res.status(400).json({ error: 'newPassword required for direct mode' });
      const hash = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({
        where: { id: target.id },
        data: { passwordHash: hash, failedLoginCount: 0, lockedUntil: null },
      });
      // Invalidate all existing sessions for this user — they must log in with new password.
      try { await revokeAllForUser(target.id, { reason: 'ADMIN_REVOKE' }); } catch {}

      // Notify user by email
      const { subject, text, html } = renderAdminPasswordChangedEmail({
        name: target.name, byAdmin: req.admin.email,
      });
      try { await sendMail({ to: target.email, subject, text, html }); } catch {}

      await writeAdminLog({
        adminId: req.admin.id,
        action: 'PASSWORD_RESET_DIRECT',
        targetType: 'USER',
        targetId: target.id,
        ip: clientIp(req),
      });
      return res.json({ ok: true, mode: 'direct' });
    }

    // Email mode: generate token
    const rawToken = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: {
        userId: target.id,
        tokenHash: sha256(rawToken),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
        requestedBy: `ADMIN:${req.admin.id}`,
        ip: clientIp(req),
      },
    });
    const base = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${base}/reset-password?token=${rawToken}`;
    const { subject, text, html } = renderPasswordResetEmail({
      name: target.name, resetUrl, expiresInMinutes: 30,
    });
    await sendMail({ to: target.email, subject, text, html });

    await writeAdminLog({
      adminId: req.admin.id,
      action: 'PASSWORD_RESET_EMAIL_SENT',
      targetType: 'USER',
      targetId: target.id,
      ip: clientIp(req),
    });

    res.json({ ok: true, mode: 'email', sentTo: maskEmail(target.email) });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// POST /admin/users/:id/suspend  (body: { suspend: true/false })
// ------------------------------------------------------------------
router.post('/:id/suspend', async (req, res, next) => {
  try {
    const suspend = !!req.body.suspend;
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.admin.id) return res.status(400).json({ error: 'Cannot suspend yourself' });
    if (target.role === 'SUPER_ADMIN' && req.admin.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Cannot suspend super admin' });
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { status: suspend ? 'SUSPENDED' : 'ACTIVE' },
    });
    await writeAdminLog({
      adminId: req.admin.id,
      action: suspend ? 'SUSPEND' : 'UNSUSPEND',
      targetType: 'USER',
      targetId: target.id,
      ip: clientIp(req),
    });
    res.json({ ok: true, status: updated.status });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// DELETE /admin/users/:id  — soft delete by default
// query: hard=true  -> requires SUPER_ADMIN + password re-confirm
// ------------------------------------------------------------------
router.delete('/:id', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.admin.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    if (target.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Cannot delete super admin' });
    }

    const hard = req.query.hard === 'true';
    if (hard) {
      if (req.admin.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Super admin required for hard delete' });
      }
      const pwd = req.headers['x-admin-password'];
      if (!pwd) return res.status(403).json({ error: 'Re-confirm password required', code: 'RECONFIRM_REQUIRED' });
      const me = await prisma.user.findUnique({ where: { id: req.admin.id }, select: { passwordHash: true } });
      const ok = await bcrypt.compare(String(pwd), me.passwordHash);
      if (!ok) return res.status(403).json({ error: 'Password re-confirm failed' });

      await prisma.user.delete({ where: { id: target.id } });
      await writeAdminLog({
        adminId: req.admin.id,
        action: 'DELETE_HARD',
        targetType: 'USER',
        targetId: target.id,
        payload: { email: target.email },
        ip: clientIp(req),
      });
      return res.json({ ok: true, mode: 'hard' });
    }

    // Soft delete
    await prisma.user.update({
      where: { id: target.id },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
    await writeAdminLog({
      adminId: req.admin.id,
      action: 'DELETE_SOFT',
      targetType: 'USER',
      targetId: target.id,
      payload: { email: target.email },
      ip: clientIp(req),
    });
    res.json({ ok: true, mode: 'soft' });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// POST /admin/users/:id/restore  — undo soft-delete
// ------------------------------------------------------------------
router.post('/:id/restore', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.status !== 'DELETED') return res.status(400).json({ error: 'User is not deleted' });
    await prisma.user.update({
      where: { id: target.id },
      data: { status: 'ACTIVE', deletedAt: null },
    });
    await writeAdminLog({
      adminId: req.admin.id,
      action: 'RESTORE',
      targetType: 'USER',
      targetId: target.id,
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// POST /admin/users/:id/revoke-sessions — force logout of all active sessions
// Both USER- and ADMIN-scope refresh tokens are revoked.
// ------------------------------------------------------------------
router.post('/:id/revoke-sessions', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'SUPER_ADMIN' && req.admin.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Cannot revoke super admin sessions' });
    }
    const count = await revokeAllForUser(target.id, { reason: 'ADMIN_REVOKE' });
    await writeAdminLog({
      adminId: req.admin.id,
      action: 'REVOKE_SESSIONS',
      targetType: 'USER',
      targetId: target.id,
      payload: { revokedCount: count },
      ip: clientIp(req),
    });
    res.json({ ok: true, revokedCount: count });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// POST /admin/users/:id/impersonate  — issue a short user-scope token
// ------------------------------------------------------------------
router.post('/:id/impersonate', async (req, res, next) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.status !== 'ACTIVE') return res.status(400).json({ error: 'User is not active' });
    if (target.role !== 'USER') return res.status(400).json({ error: 'Can only impersonate regular users' });

    // Issue a regular user token with impersonation stamp
    const accessToken = require('jsonwebtoken').sign(
      { userId: target.id, plan: target.plan, impersonatedBy: req.admin.id },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '30m' },
    );

    await writeAdminLog({
      adminId: req.admin.id,
      action: 'IMPERSONATE',
      targetType: 'USER',
      targetId: target.id,
      payload: { targetEmail: target.email },
      ip: clientIp(req),
    });

    res.json({
      accessToken,
      user: { id: target.id, email: target.email, name: target.name, plan: target.plan },
      impersonatedBy: req.admin.email,
      expiresInMinutes: 30,
    });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// POST /admin/users  — manually create a user (super admin only)
// ------------------------------------------------------------------
const createSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(10)
    .max(100)
    .refine((p) => passwordPolicy.validate(p).ok, (p) => ({
      message: passwordPolicy.validate(p).reasons.join('; ') || 'Weak password',
    })),
  name: z.string().max(50).optional(),
  plan: z.enum(VALID_PLANS).default('FREE'),
  role: z.enum(VALID_ROLES).default('USER'),
  months: z.number().int().min(0).max(60).default(0),
  emailVerified: z.boolean().default(true),
});

router.post('/', requireSuperAdmin, async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(data.password, 12);
    const subEnd = data.months > 0
      ? new Date(Date.now() + data.months * 30 * 24 * 3600 * 1000) : null;

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash: hash,
        name: data.name || data.email.split('@')[0],
        plan: data.plan,
        role: data.role,
        subscriptionEnd: subEnd,
        emailVerified: data.emailVerified,
        emailVerifiedAt: data.emailVerified ? new Date() : null,
      },
      select: { id: true, email: true, name: true, plan: true, role: true, subscriptionEnd: true, emailVerified: true },
    });

    await writeAdminLog({
      adminId: req.admin.id,
      action: 'USER_CREATE',
      targetType: 'USER',
      targetId: user.id,
      payload: { email: user.email, role: user.role, plan: user.plan },
      ip: clientIp(req),
    });
    res.status(201).json(user);
  } catch (e) { next(e); }
});

module.exports = router;
