// Plan-tier gate. Chained after requireAuth — reads req.user and rejects
// when the user is on a lower tier than minPlan. Error payload mirrors the
// shape already in use in routes/exams.js:67-72 (requiresUpgrade: true) so
// the frontend can reuse the same upgrade modal path.
//
// Expiry handling: if the user's subscriptionEnd has passed, we treat them
// as FREE for the purposes of this check, regardless of what's stored on
// User.plan. This is the single place that guards paid features — a
// background job to clean up stale User.plan rows is not strictly needed.

const { planAtLeast, PLAN_ORDER } = require('../constants/planMatrix');

function effectivePlan(user) {
  if (!user) return 'FREE';
  const plan = user.plan || 'FREE';
  if (plan === 'FREE') return 'FREE';
  // Paid plan with no end date set = treat as FREE (defensive; should not
  // happen for plans minted by billing.applyPurchaseToUser).
  if (!user.subscriptionEnd) return 'FREE';
  if (new Date(user.subscriptionEnd).getTime() <= Date.now()) return 'FREE';
  return plan;
}

function requirePlan(minPlan) {
  if (!PLAN_ORDER.includes(minPlan)) {
    throw new Error(`requirePlan: unknown plan "${minPlan}"`);
  }
  return function (req, res, next) {
    const userPlan = effectivePlan(req.user) || 'FREE';
    if (!planAtLeast(userPlan, minPlan)) {
      return res.status(403).json({
        error: 'Your current plan does not include this feature',
        code: 'PLAN_UPGRADE_REQUIRED',
        requiresUpgrade: true,
        currentPlan: userPlan,
        requiredPlan: minPlan,
      });
    }
    // Make the effective plan visible downstream (e.g. quota calc)
    req.userPlan = userPlan;
    next();
  };
}

module.exports = { requirePlan, effectivePlan };
