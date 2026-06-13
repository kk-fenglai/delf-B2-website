const prisma = require('../prisma');
const env = require('../config/env');
const { writeAdminLog } = require('../middleware/admin');
const { PLAN_ORDER } = require('../constants/planMatrix');
const { getBillingPolicy } = require('./billingPolicy');

async function trialConfig() {
  const p = await getBillingPolicy();
  return {
    enabled: p.trialEnabled,
    days: p.trialDays,
    plan: p.trialPlan,
  };
}

function isValidTrialPlan(plan) {
  return PLAN_ORDER.includes(plan) && plan !== 'FREE';
}

function hasActivePaidAccess(user) {
  if (!user) return false;
  const plan = user.plan || 'FREE';
  if (plan === 'FREE') return false;
  if (!user.subscriptionEnd) return false;
  return new Date(user.subscriptionEnd).getTime() > Date.now();
}

function daysLeftUntil(endDate) {
  if (!endDate) return 0;
  const ms = new Date(endDate).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function buildTrialStatus(user, cfg, { hasPayContract = false } = {}) {
  const used = Boolean(user?.trialUsedAt);
  const endsAt = user?.subscriptionEnd || null;
  const activeTrial = used
    && hasActivePaidAccess(user)
    && user.plan === cfg.plan
    && !hasPayContract;
  const daysLeft = activeTrial ? daysLeftUntil(endsAt) : 0;

  const eligible = cfg.enabled
    && Boolean(user?.emailVerified)
    && !used
    && !hasActivePaidAccess(user);

  return {
    enabled: cfg.enabled,
    days: cfg.days,
    plan: cfg.plan,
    eligible,
    used,
    active: activeTrial,
    daysLeft,
    endsAt: endsAt ? new Date(endsAt).toISOString() : null,
    usedAt: user?.trialUsedAt ? new Date(user.trialUsedAt).toISOString() : null,
  };
}

async function getTrialStatusForUser(userId) {
  const cfg = await trialConfig();
  if (!cfg.enabled) {
    return buildTrialStatus(null, cfg);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      emailVerified: true,
      plan: true,
      subscriptionEnd: true,
      trialUsedAt: true,
    },
  });
  if (!user) {
    const e = new Error('User not found');
    e.status = 404;
    throw e;
  }

  const payContract = await prisma.payContract.findFirst({
    where: { userId, status: { in: ['ACTIVE', 'SUSPENDED'] } },
    select: { id: true },
  });

  return buildTrialStatus(user, cfg, { hasPayContract: Boolean(payContract) });
}

async function startTrial(userId, { source = 'manual' } = {}) {
  const cfg = await trialConfig();
  if (!cfg.enabled) {
    const e = new Error('Free trial is not enabled');
    e.code = 'TRIAL_DISABLED';
    e.status = 503;
    throw e;
  }
  if (!isValidTrialPlan(cfg.plan)) {
    const e = new Error('Invalid trial plan configuration');
    e.code = 'TRIAL_MISCONFIGURED';
    e.status = 500;
    throw e;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      emailVerified: true,
      plan: true,
      subscriptionEnd: true,
      trialUsedAt: true,
    },
  });
  if (!user) {
    const e = new Error('User not found');
    e.status = 404;
    throw e;
  }
  if (!user.emailVerified) {
    const e = new Error('Email verification required before starting trial');
    e.code = 'EMAIL_NOT_VERIFIED';
    e.status = 403;
    throw e;
  }
  if (user.trialUsedAt) {
    const e = new Error('Free trial already used');
    e.code = 'TRIAL_ALREADY_USED';
    e.status = 409;
    throw e;
  }
  if (hasActivePaidAccess(user)) {
    const e = new Error('Active subscription already exists');
    e.code = 'TRIAL_ALREADY_SUBSCRIBED';
    e.status = 409;
    throw e;
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + cfg.days * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        plan: cfg.plan,
        subscriptionEnd: endsAt,
        trialUsedAt: now,
      },
    });
    await tx.subscription.create({
      data: {
        userId,
        plan: cfg.plan,
        status: 'ACTIVE',
        startedAt: now,
        currentPeriodEnd: endsAt,
        autoRenew: false,
        provider: 'trial',
      },
    });
  });

  try {
    await writeAdminLog({
      adminId: userId,
      action: 'TRIAL_STARTED',
      targetType: 'USER',
      targetId: userId,
      payload: { plan: cfg.plan, days: cfg.days, endsAt: endsAt.toISOString(), source },
    });
  } catch {
    // Non-fatal — entitlement is already granted.
  }

  const updated = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      emailVerified: true,
      plan: true,
      subscriptionEnd: true,
      trialUsedAt: true,
    },
  });

  return {
    started: true,
    trial: buildTrialStatus(updated, cfg),
  };
}

module.exports = {
  trialConfig,
  buildTrialStatus,
  getTrialStatusForUser,
  startTrial,
};
