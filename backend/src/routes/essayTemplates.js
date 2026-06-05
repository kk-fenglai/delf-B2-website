const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const { SYSTEM_TEMPLATES, SYSTEM_TOPICS } = require('../constants/essayTemplateDefaults');
const { PLAN_CAPS } = require('../constants/planMatrix');

const router = express.Router();
router.use(requireAuth);

function maxTemplatesForPlan(plan) {
  const caps = PLAN_CAPS[plan] || PLAN_CAPS.FREE;
  return caps.maxEssayTemplates ?? 0;
}

const templateSchema = z.object({
  title: z.string().min(1).max(100),
  content: z.string().min(1).max(5000),
  type: z.enum(['phrase', 'structure']).default('phrase'),
});

// GET /api/user/templates
router.get('/', async (req, res, next) => {
  try {
    const { type } = req.query;
    const where = { userId: req.userId };
    if (type === 'phrase' || type === 'structure') where.type = type;
    const templates = await prisma.essayTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, content: true, type: true, createdAt: true },
    });
    const cap = maxTemplatesForPlan(req.userPlan);
    res.json({
      templates,
      systemTemplates: SYSTEM_TEMPLATES,
      systemTopics: SYSTEM_TOPICS,
      quota: { used: templates.length, cap, plan: req.userPlan || 'FREE' },
    });
  } catch (e) { next(e); }
});

// POST /api/user/templates  — plan-gated: FREE/STANDARD = 0, AI = 3, AI_UNLIMITED = ∞
router.post('/', async (req, res, next) => {
  try {
    const data = templateSchema.parse(req.body);
    const cap = maxTemplatesForPlan(req.userPlan);
    if (cap <= 0) {
      return res.status(403).json({
        error: 'Saving custom templates is an AI-plan feature',
        code: 'PLAN_UPGRADE_REQUIRED',
        requiresUpgrade: true,
        currentPlan: req.userPlan,
      });
    }
    const count = await prisma.essayTemplate.count({ where: { userId: req.userId } });
    if (count >= cap) {
      return res.status(402).json({
        error: 'Template quota reached for this plan',
        code: 'TEMPLATE_QUOTA_EXCEEDED',
        used: count,
        cap,
        requiresUpgrade: req.userPlan !== 'AI_UNLIMITED',
      });
    }
    const template = await prisma.essayTemplate.create({
      data: { userId: req.userId, ...data },
      select: { id: true, title: true, content: true, type: true, createdAt: true },
    });
    res.status(201).json({ template });
  } catch (e) { next(e); }
});

// PUT /api/user/templates/:id
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.essayTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.userId) {
      return res.status(404).json({ error: 'Template not found' });
    }
    const data = templateSchema.parse(req.body);
    const template = await prisma.essayTemplate.update({
      where: { id: req.params.id },
      data,
      select: { id: true, title: true, content: true, type: true, createdAt: true },
    });
    res.json({ template });
  } catch (e) { next(e); }
});

// DELETE /api/user/templates/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.essayTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.userId) {
      return res.status(404).json({ error: 'Template not found' });
    }
    await prisma.essayTemplate.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
