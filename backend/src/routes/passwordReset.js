// Public password-reset routes for regular users.
// Intentionally returns ok=true even for unknown emails (anti-enumeration).

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { z } = require('zod');
const prisma = require('../prisma');
const { sendMail, renderPasswordResetEmail } = require('../services/mailer');
const { clientIp } = require('../middleware/admin');
const passwordPolicy = require('../utils/passwordPolicy');
const { revokeAllForUser } = require('../services/refreshTokens');

const router = express.Router();

function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

const forgotSchema = z.object({ email: z.string().email() });

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = forgotSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    // Always return success to prevent email enumeration
    if (user && user.status === 'ACTIVE') {
      const rawToken = crypto.randomBytes(32).toString('hex');
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(rawToken),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          requestedBy: 'USER',
          ip: clientIp(req),
        },
      });
      const base = process.env.FRONTEND_URL || 'http://localhost:5173';
      const resetUrl = `${base}/reset-password?token=${rawToken}`;
      const mail = renderPasswordResetEmail({ name: user.name, resetUrl, expiresInMinutes: 30 });
      try { await sendMail({ to: user.email, ...mail }); } catch (e) { console.error('mail fail:', e.message); }
    }
    res.json({ ok: true, message: '若邮箱存在于我们系统中，重置链接已发出，请查收邮箱。' });
  } catch (e) { next(e); }
});

const resetSchema = z.object({
  token: z.string().min(20),
  newPassword: z
    .string()
    .min(10)
    .max(100)
    .refine((p) => passwordPolicy.validate(p).ok, (p) => ({
      message: passwordPolicy.validate(p).reasons.join('; ') || 'Weak password',
    })),
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = resetSchema.parse(req.body);
    const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!rec || rec.usedAt || rec.expiresAt < new Date()) {
      return res.status(400).json({ error: '链接无效或已过期，请重新发起' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: rec.userId },
        data: { passwordHash: hash, failedLoginCount: 0, lockedUntil: null },
      }),
      prisma.passwordResetToken.update({
        where: { id: rec.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate all other pending tokens for this user
      prisma.passwordResetToken.updateMany({
        where: { userId: rec.userId, usedAt: null, id: { not: rec.id } },
        data: { usedAt: new Date() },
      }),
    ]);
    // Invalidate all refresh tokens — force re-login everywhere after a password reset.
    try { await revokeAllForUser(rec.userId, { reason: 'ADMIN_REVOKE' }); } catch {}
    res.json({ ok: true, message: '密码重置成功，请使用新密码登录' });
  } catch (e) { next(e); }
});

module.exports = router;
