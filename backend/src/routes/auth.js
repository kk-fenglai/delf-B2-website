const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../prisma');
const { signAccessToken } = require('../utils/jwt');
const {
  issueRefreshToken,
  verifyAndRotate,
  revokeByRawToken,
} = require('../services/refreshTokens');
const { clientIp } = require('../middleware/admin');
const passwordPolicy = require('../utils/passwordPolicy');
const { logger } = require('../utils/logger');
const {
  sendMail,
  renderVerifyEmail,
} = require('../services/mailer');
const crypto = require('crypto');

const router = express.Router();

const LOGIN_LOCK_THRESHOLD = 8;
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z
    .string()
    .min(10)
    .max(100)
    .refine((p) => passwordPolicy.validate(p).ok, (p) => ({
      message: passwordPolicy.validate(p).reasons.join('; ') || 'Weak password',
    })),
  name: z.string().min(1).max(50).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

async function sendVerificationEmail(user, req) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(rawToken),
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
    },
  });
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  const verifyUrl = `${base}/verify-email?token=${rawToken}`;
  const mail = renderVerifyEmail({ name: user.name, verifyUrl, expiresInHours: 24 });
  try {
    await sendMail({ to: user.email, ...mail });
  } catch (e) {
    logger.error({ err: e, userId: user.id, requestId: req?.id }, 'verification email send failed');
  }
}

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) return res.status(409).json({ error: '邮箱已被注册' });

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name || data.email.split('@')[0],
        emailVerified: false,
      },
      select: { id: true, email: true, name: true, plan: true },
    });

    await sendVerificationEmail(user, req);

    // No tokens issued until email is verified. Tell client where to go next.
    res.status(201).json({
      user,
      emailVerificationRequired: true,
      message: '验证邮件已发送，请查收邮箱并点击链接完成激活后登录。',
    });
  } catch (e) { next(e); }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const ip = clientIp(req);
    const ua = req.headers['user-agent'] || '';
    const user = await prisma.user.findUnique({ where: { email: data.email } });

    if (!user) {
      await bcrypt.compare(data.password, '$2a$12$abcdefghijklmnopqrstuv');
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await prisma.loginHistory.create({
        data: { userId: user.id, ip, userAgent: ua, success: false, reason: 'LOCKED' },
      });
      return res.status(423).json({ error: '账户暂时锁定，请稍后再试' });
    }
    if (user.status !== 'ACTIVE' || user.deletedAt) {
      await prisma.loginHistory.create({
        data: { userId: user.id, ip, userAgent: ua, success: false, reason: 'SUSPENDED' },
      });
      return res.status(403).json({ error: '账户已停用，请联系客服' });
    }

    // Admin accounts MUST go through /api/admin/auth/login (with 2FA)
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      return res.status(403).json({ error: '管理员账户请使用管理后台登录', code: 'USE_ADMIN_LOGIN' });
    }

    const ok = await bcrypt.compare(data.password, user.passwordHash);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      const update = { failedLoginCount: failed };
      if (failed >= LOGIN_LOCK_THRESHOLD) {
        update.lockedUntil = new Date(Date.now() + LOGIN_LOCK_DURATION_MS);
        update.failedLoginCount = 0;
      }
      await prisma.user.update({ where: { id: user.id }, data: update });
      await prisma.loginHistory.create({
        data: { userId: user.id, ip, userAgent: ua, success: false, reason: 'BAD_PASSWORD' },
      });
      return res.status(401).json({ error: '邮箱或密码错误' });
    }

    if (!user.emailVerified) {
      await prisma.loginHistory.create({
        data: { userId: user.id, ip, userAgent: ua, success: false, reason: 'EMAIL_NOT_VERIFIED' },
      });
      return res.status(403).json({
        error: '请先验证邮箱后再登录',
        code: 'EMAIL_NOT_VERIFIED',
        email: user.email,
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginCount: { increment: 1 },
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await prisma.loginHistory.create({
      data: { userId: user.id, ip, userAgent: ua, success: true, reason: 'OK' },
    });

    const safe = { id: user.id, email: user.email, name: user.name, plan: user.plan };
    const accessToken = signAccessToken({ userId: user.id, plan: user.plan });
    const { raw: refreshToken } = await issueRefreshToken({
      userId: user.id,
      scope: 'user',
      ip,
      userAgent: ua,
    });

    res.json({ user: safe, accessToken, refreshToken });
  } catch (e) { next(e); }
});

// POST /api/auth/refresh — rotate the refresh token, return new pair.
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Missing refresh token' });
    const ip = clientIp(req);
    const ua = req.headers['user-agent'] || '';

    const { userId, newRaw, scope } = await verifyAndRotate({
      rawToken: refreshToken,
      expectedScope: 'user',
      ip,
      userAgent: ua,
    });

    // Re-check that the user is still allowed to have a session.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, plan: true, status: true, deletedAt: true, role: true, emailVerified: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
      return res.status(403).json({ error: '账户不可用', code: 'ACCOUNT_INACTIVE' });
    }
    const accessToken = signAccessToken({ userId: user.id, plan: user.plan });
    res.json({ accessToken, refreshToken: newRaw });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message, code: e.code });
    next(e);
  }
});

// POST /api/auth/logout — revoke the refresh token (if provided).
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    try { await revokeByRawToken(refreshToken, 'LOGOUT'); } catch { /* best-effort */ }
  }
  res.json({ ok: true });
});

// POST /api/auth/resend-verification — limited to once per 5min per email
router.post('/resend-verification', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Email required' });
    const user = await prisma.user.findUnique({ where: { email } });
    // Anti-enumeration: always return success shape
    if (user && !user.emailVerified && user.status === 'ACTIVE') {
      // Rate-limit per user: check the most recent outgoing verification
      const last = await prisma.emailVerificationToken.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });
      if (last && Date.now() - last.createdAt.getTime() < 5 * 60 * 1000) {
        return res.status(429).json({ error: '请求过于频繁，请 5 分钟后再试' });
      }
      await sendVerificationEmail(user, req);
    }
    res.json({ ok: true, message: '若账户存在且未激活，验证邮件已重新发送。' });
  } catch (e) { next(e); }
});

// GET /api/auth/verify-email?token=xxx — activate account.
router.get('/verify-email', async (req, res, next) => {
  try {
    const token = String(req.query.token || '');
    const base = process.env.FRONTEND_URL || 'http://localhost:5173';
    if (!token) return res.redirect(`${base}/verify-email?result=invalid`);

    const rec = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
      return res.redirect(`${base}/verify-email?result=expired`);
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: rec.userId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      }),
      prisma.emailVerificationToken.update({
        where: { id: rec.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate any other pending verification tokens
      prisma.emailVerificationToken.updateMany({
        where: { userId: rec.userId, usedAt: null, id: { not: rec.id } },
        data: { usedAt: new Date() },
      }),
    ]);
    res.redirect(`${base}/verify-email?result=ok`);
  } catch (e) { next(e); }
});

// POST /api/auth/verify-email — for SPAs that prefer an API call over redirect.
router.post('/verify-email', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '');
    if (!token) return res.status(400).json({ error: 'Missing token' });
    const rec = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
      return res.status(400).json({ error: '链接无效或已过期' });
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id: rec.userId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      }),
      prisma.emailVerificationToken.update({
        where: { id: rec.id },
        data: { usedAt: new Date() },
      }),
      prisma.emailVerificationToken.updateMany({
        where: { userId: rec.userId, usedAt: null, id: { not: rec.id } },
        data: { usedAt: new Date() },
      }),
    ]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
