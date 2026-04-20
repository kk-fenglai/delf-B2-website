// Plan-tier gate. Chained after requireAuth — reads req.userPlan and rejects
// when the user is on a lower tier than minPlan. Error payload mirrors the
// shape already in use in routes/exams.js:67-72 (requiresUpgrade: true) so
// the frontend can reuse the same upgrade modal path.

const { planAtLeast, PLAN_ORDER } = require('../constants/planMatrix');

function requirePlan(minPlan) {
  if (!PLAN_ORDER.includes(minPlan)) {
    throw new Error(`requirePlan: unknown plan "${minPlan}"`);
  }
  return function (req, res, next) {
    const userPlan = req.userPlan || 'FREE';
    if (!planAtLeast(userPlan, minPlan)) {
      return res.status(403).json({
        error: 'Your current plan does not include this feature',
        code: 'PLAN_UPGRADE_REQUIRED',
        requiresUpgrade: true,
        currentPlan: userPlan,
        requiredPlan: minPlan,
      });
    }
    next();
  };
}

module.exports = { requirePlan };
