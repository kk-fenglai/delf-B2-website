// GET /api/catalogue — public catalogue of exam SYSTEMS and their levels.
// Supersedes /api/levels (kept for old cached bundles; it returns the DELF
// subtree). Progressive disclosure: a system other than DELF is only listed
// once it has published platform content, so the frontend SystemSwitcher
// stays hidden until IELTS actually launches — no feature flag needed.
const express = require('express');
const prisma = require('../prisma');
const { SYSTEMS, SYSTEM_KEYS, DEFAULT_SYSTEM, toPublicSystem } = require('../constants/systems');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const rows = await prisma.examSet.groupBy({
      by: ['system'],
      where: { isPublished: true, source: 'PLATFORM' },
    });
    const visible = new Set([DEFAULT_SYSTEM, ...rows.map((r) => r.system)]);
    // Shorter cache than /api/levels: payload changes when a system's first
    // content is published, not only on deploy.
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
      defaultSystem: DEFAULT_SYSTEM,
      systems: SYSTEM_KEYS.filter((k) => visible.has(k)).map((k) => toPublicSystem(SYSTEMS[k])),
    });
  } catch (e) { next(e); }
});

module.exports = router;
