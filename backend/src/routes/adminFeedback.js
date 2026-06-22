const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma');
const { requireAdmin, writeAdminLog, clientIp } = require('../middleware/admin');

const router = express.Router();
router.use(requireAdmin);

const VALID_STATUS = ['NEW', 'READ', 'RESOLVED'];
const VALID_CATEGORY = ['SUGGESTION', 'BUG', 'CONTENT', 'OTHER'];

// GET /admin/feedback — paginated list with status/category filters.
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));
    const status = VALID_STATUS.includes(req.query.status) ? req.query.status : undefined;
    const category = VALID_CATEGORY.includes(req.query.category) ? req.query.category : undefined;

    const where = {};
    if (status) where.status = status;
    if (category) where.category = category;

    const [total, items, newCount] = await Promise.all([
      prisma.feedback.count({ where }),
      prisma.feedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
      prisma.feedback.count({ where: { status: 'NEW' } }),
    ]);

    res.json({ items, total, page, pageSize, newCount });
  } catch (e) { next(e); }
});

// PATCH /admin/feedback/:id — update status and/or internal note.
const patchSchema = z.object({
  status: z.enum(VALID_STATUS).optional(),
  adminNote: z.string().max(2000).optional(),
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { status, adminNote } = patchSchema.parse(req.body);
    if (status === undefined && adminNote === undefined) {
      return res.status(400).json({ error: '无更新内容' });
    }
    const data = {};
    if (status !== undefined) data.status = status;
    if (adminNote !== undefined) data.adminNote = adminNote;

    const updated = await prisma.feedback.update({
      where: { id: req.params.id },
      data,
    });

    await writeAdminLog({
      adminId: req.admin.id,
      action: 'FEEDBACK_UPDATE',
      targetType: 'FEEDBACK',
      targetId: updated.id,
      payload: { status, adminNote: adminNote !== undefined ? '(updated)' : undefined },
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || null,
    });

    res.json({ ok: true, feedback: updated });
  } catch (e) {
    if (e?.code === 'P2025') return res.status(404).json({ error: '反馈不存在' });
    if (e?.issues) return res.status(400).json({ error: '参数不合法' });
    next(e);
  }
});

module.exports = router;
