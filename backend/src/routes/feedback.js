const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma');
const { optionalAuth } = require('../middleware/auth');
const { clientIp } = require('../middleware/admin');

const router = express.Router();

const CATEGORIES = ['SUGGESTION', 'BUG', 'CONTENT', 'OTHER'];

const submitSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  category: z.enum(CATEGORIES).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  pageUrl: z.string().trim().max(500).optional(),
});

// POST /api/feedback — submit feedback. Works anonymously or authenticated.
// optionalAuth attaches req.userId when a valid token is present.
router.post('/', optionalAuth, async (req, res, next) => {
  try {
    const { message, category, email, pageUrl } = submitSchema.parse(req.body);
    const feedback = await prisma.feedback.create({
      data: {
        userId: req.userId || null,
        // Logged-in users: keep their account email if they didn't type one.
        email: email || req.user?.email || null,
        category: category || 'OTHER',
        message,
        pageUrl: pageUrl || null,
        userAgent: (req.headers['user-agent'] || '').slice(0, 500) || null,
        ip: clientIp(req) || null,
      },
      select: { id: true, createdAt: true },
    });
    res.status(201).json({ ok: true, id: feedback.id });
  } catch (e) {
    if (e?.issues) return res.status(400).json({ error: '提交内容不合法', code: 'INVALID' });
    next(e);
  }
});

module.exports = router;
