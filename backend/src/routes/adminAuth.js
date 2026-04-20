const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const {
  signAdminAccessToken,
  signTwoFactorPendingToken,
} = require('../utils/jwt');
const {
  issueRefreshToken,
  verifyAndRotate,
  revokeByRawToken,
} = require('../services/refreshTokens');
const { writeAdminLog, clientIp } = require('../middleware/admin');
const { sendMail, renderAdmin2FAEmail } = require('../services/mailer');

const router = express.Router();

const LOGIN_LOCK_THRESHOLD = 5;
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;
const TWO_FA_TTL_MIN = 10;
const TWO_FA_MAX_ATTEMPTS = 5;

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

// ---------------- Step 1: password ----------------
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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
      return res.status(403).json({ error: '账户已停用' });
    }
    if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      return res.status(401).json({ error: '邮箱或密码错误' });
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

    // Password OK — issue 2FA code and pending token
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await prisma.twoFactorToken.create({
      data: {
        userId: user.id,
        codeHash: sha256(code),
        purpose: 'ADMIN_LOGIN',
        expiresAt: new Date(Date.now() + TWO_FA_TTL_MIN * 60 * 1000),
      },
    });

    const { subject, text, html } = renderAdmin2FAEmail({ code, ip, ttlMinutes: TWO_FA_TTL_MIN });
    await sendMail({ to: user.email, subject, text, html });

    await prisma.loginHistory.create({
      data: { userId: user.id, ip, userAgent: ua, success: false, reason: 'TWO_FA_REQUIRED' },
    });

    const pendingToken = signTwoFactorPendingToken({ userId: user.id });
    res.json({
      step: '2fa',
      pendingToken,
      message: `6 位验证码已发送至 ${user.email.replace(/(.{2}).*(@.*)/, '$1***$2')}`,
      expiresInMinutes: TWO_FA_TTL_MIN,
    });
  } catch (e) { next(e); }
});

// ---------------- Step 2: 2FA verify ----------------
const verifySchema = z.object({
  pendingToken: z.string().min(10),
  code: z.string().length(6),
});

router.post('/verify-2fa', async (req, res, next) => {
  try {
    const data = verifySchema.parse(req.body);
    const ip = clientIp(req);
    const ua = req.headers['user-agent'] || '';

    let decoded;
    try {
      decoded = jwt.verify(data.pendingToken, process.env.JWT_ACCESS_SECRET);
    } catch {
      return res.status(401).json({ error: 'Pending token 无效或已过期，请重新登录' });
    }
    if (decoded.scope !== '2fa_pending') return res.status(401).json({ error: 'Wrong token scope' });

    const token = await prisma.twoFactorToken.findFirst({
      where: {
        userId: decoded.userId,
        purpose: 'ADMIN_LOGIN',
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!token) return res.status(401).json({ error: '验证码已过期，请重新登录' });

    if (token.attempts >= TWO_FA_MAX_ATTEMPTS) {
      await prisma.twoFactorToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
      return res.status(429).json({ error: '验证码尝试次数过多，请重新登录' });
    }

    const match = token.codeHash === sha256(data.code);
    if (!match) {
      await prisma.twoFactorToken.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 } },
      });
      return res.status(401).json({ error: '验证码错误', attemptsLeft: TWO_FA_MAX_ATTEMPTS - token.attempts - 1 });
    }

    await prisma.twoFactorToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });

    const user = await prisma.user.update({
      where: { id: decoded.userId },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ip,
        loginCount: { increment: 1 },
        failedLoginCount: 0,
        lockedUntil: null,
      },
      select: { id: true, email: true, name: true, role: true, plan: true, status: true, deletedAt: true },
    });

    // Defense in depth: re-check status after we decoded the pending token.
    if (user.status !== 'ACTIVE' || user.deletedAt) {
      return res.status(403).json({ error: '账户已停用' });
    }

    await prisma.loginHistory.create({
      data: { userId: user.id, ip, userAgent: ua, success: true, reason: 'OK' },
    });

    await writeAdminLog({
      adminId: user.id,
      action: 'ADMIN_LOGIN',
      targetType: 'SYSTEM',
      ip,
      userAgent: ua,
    });

    const accessToken = signAdminAccessToken({ userId: user.id, role: user.role });
    const { raw: refreshToken } = await issueRefreshToken({
      userId: user.id,
      scope: 'admin',
      ip,
      userAgent: ua,
    });

    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan },
      accessToken,
      refreshToken,
    });
  } catch (e) { next(e); }
});

// ---------------- Refresh admin token (with rotation) ----------------
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'Missing refresh token' });
    const ip = clientIp(req);
    const ua = req.headers['user-agent'] || '';

    const { userId, newRaw } = await verifyAndRotate({
      rawToken: refreshToken,
      expectedScope: 'admin',
      ip,
      userAgent: ua,
    });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, deletedAt: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt
        || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
      return res.status(403).json({ error: 'Admin no longer active' });
    }
    const accessToken = signAdminAccessToken({ userId: user.id, role: user.role });
    res.json({ accessToken, refreshToken: newRaw });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message, code: e.code });
    next(e);
  }
});

// ---------------- Logout (revoke refresh if provided) ----------------
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    try { await revokeByRawToken(refreshToken, 'LOGOUT'); } catch { /* best-effort */ }
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      if (decoded.scope === 'admin') {
        await writeAdminLog({
          adminId: decoded.userId,
          action: 'ADMIN_LOGOUT',
          targetType: 'SYSTEM',
          ip: clientIp(req),
          userAgent: req.headers['user-agent'] || '',
        });
      }
    } catch { /* ignore */ }
  }
  res.json({ ok: true });
});

// ---------------- /me ----------------
router.get('/me', async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    if (decoded.scope !== 'admin') return res.status(403).json({ error: 'Not admin' });
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, role: true, plan: true, status: true, deletedAt: true, lastLoginAt: true, lastLoginIp: true },
    });
    if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
      return res.status(403).json({ error: 'Admin no longer active' });
    }
    res.json(user);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
