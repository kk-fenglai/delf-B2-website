const express = require('express');
const prisma = require('../prisma');
const { requireAdmin } = require('../middleware/admin');

const router = express.Router();
router.use(requireAdmin);

// GET /admin/stats/overview
router.get('/overview', async (_req, res, next) => {
  try {
    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    const [
      totalUsers, activeUsers, deletedUsers, suspendedUsers,
      newUsers7d, newUsers30d,
      paidUsers, paidActive,
      planCounts,
      sessions7d, sessionsTotal,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'DELETED' } }),
      prisma.user.count({ where: { status: 'SUSPENDED' } }),
      prisma.user.count({ where: { createdAt: { gte: d7 } } }),
      prisma.user.count({ where: { createdAt: { gte: d30 } } }),
      prisma.user.count({ where: { plan: { not: 'FREE' } } }),
      prisma.user.count({ where: { plan: { not: 'FREE' }, subscriptionEnd: { gt: now } } }),
      prisma.user.groupBy({ by: ['plan'], _count: { _all: true } }),
      prisma.examSession.count({ where: { startedAt: { gte: d7 } } }),
      prisma.examSession.count(),
    ]);

    // MRR estimate (simple — uses default price list)
    const PRICE = { FREE: 0, STANDARD: 29, AI: 69, AI_UNLIMITED: 99 };
    const planMap = Object.fromEntries(planCounts.map((p) => [p.plan, p._count._all]));
    const mrr = Object.entries(planMap).reduce((sum, [p, c]) => sum + (PRICE[p] || 0) * c, 0);

    res.json({
      users: {
        total: totalUsers,
        active: activeUsers,
        deleted: deletedUsers,
        suspended: suspendedUsers,
        newLast7d: newUsers7d,
        newLast30d: newUsers30d,
      },
      paid: { total: paidUsers, active: paidActive, conversionRate: totalUsers ? (paidUsers / totalUsers) : 0 },
      planDistribution: planMap,
      mrr,
      sessions: { last7d: sessions7d, total: sessionsTotal },
    });
  } catch (e) { next(e); }
});

// GET /admin/stats/signups?days=30
router.get('/signups', async (req, res, next) => {
  try {
    const days = Math.min(365, parseInt(req.query.days) || 30);
    const start = new Date(Date.now() - days * 24 * 3600 * 1000);
    const users = await prisma.user.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true, plan: true },
    });
    // Bucket by day
    const buckets = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 24 * 3600 * 1000);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = { date: key, total: 0, paid: 0 };
    }
    for (const u of users) {
      const key = u.createdAt.toISOString().slice(0, 10);
      if (buckets[key]) {
        buckets[key].total++;
        if (u.plan !== 'FREE') buckets[key].paid++;
      }
    }
    res.json({ days, series: Object.values(buckets) });
  } catch (e) { next(e); }
});

// GET /admin/logs?adminId=&action=&page=&pageSize=
router.get('/logs', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize) || 30);
    const where = {};
    if (req.query.adminId) where.adminId = req.query.adminId;
    if (req.query.action) where.action = req.query.action;
    if (req.query.targetId) where.targetId = req.query.targetId;

    const [total, logs] = await Promise.all([
      prisma.adminLog.count({ where }),
      prisma.adminLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { admin: { select: { email: true, name: true } } },
      }),
    ]);
    res.json({ total, page, pageSize, logs });
  } catch (e) { next(e); }
});

// GET /admin/login-history?userId=
router.get('/login-history', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize) || 30);
    const where = {};
    if (req.query.userId) where.userId = req.query.userId;
    if (req.query.success !== undefined) where.success = req.query.success === 'true';

    const [total, history] = await Promise.all([
      prisma.loginHistory.count({ where }),
      prisma.loginHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { email: true } } },
      }),
    ]);
    res.json({ total, page, pageSize, history });
  } catch (e) { next(e); }
});

module.exports = router;
