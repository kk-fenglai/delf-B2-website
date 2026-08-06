// Admin-only endpoints for the site-wide announcement.
//
// Surface (mounted under /api/admin/announcement):
//   GET    /   — current announcement (enabled flag + zh/en/fr copy)
//   PATCH  /   — toggle on/off and edit the copy

const express = require('express');
const { z } = require('zod');
const { requireAdmin, writeAdminLog, clientIp } = require('../middleware/admin');
const { getAnnouncement, saveAnnouncement } = require('../services/announcement');

const router = express.Router();
router.use(requireAdmin);

const localizedText = (max) => z.object({
  zh: z.string().max(max).optional(),
  en: z.string().max(max).optional(),
  fr: z.string().max(max).optional(),
}).optional();

const announcementSchema = z.object({
  enabled: z.boolean().optional(),
  title: localizedText(120),
  body: localizedText(1000),
});

// GET /api/admin/announcement
router.get('/', async (_req, res, next) => {
  try {
    res.json({ announcement: await getAnnouncement() });
  } catch (e) { next(e); }
});

// PATCH /api/admin/announcement
router.patch('/', async (req, res, next) => {
  try {
    const data = announcementSchema.parse(req.body);
    await saveAnnouncement(data, { adminId: req.adminId });
    await writeAdminLog({
      adminId: req.adminId,
      action: 'ANNOUNCEMENT_UPDATED',
      targetType: 'APP_SETTING',
      targetId: 'announcement',
      payload: data,
      ip: clientIp(req),
    });
    res.json({ announcement: await getAnnouncement() });
  } catch (e) { next(e); }
});

module.exports = router;
