const prisma = require('../prisma');
const env = require('../config/env');
const { PLAN_ORDER } = require('../constants/planMatrix');

const SETTING_KEY = 'billing_policy';

const DEFAULT_MESSAGES = {
  zh: '平台目前处于测试阶段，无需订阅即可免费使用。请使用免费试用，如有问题请联系客服。',
  en: 'We are in a beta testing period — no paid subscription is required. Please use the free trial instead.',
  fr: 'La plateforme est en phase de test — aucun abonnement payant n\'est requis. Utilisez l\'essai gratuit.',
};

let cache = { at: 0, policy: null };
const CACHE_TTL_MS = 15_000;

function parseCountries(value, fallback) {
  const src = Array.isArray(value)
    ? value
    : (typeof value === 'string' ? value.split(',') : null);
  if (!src) return fallback;
  const list = src.map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  return Array.from(new Set(list));
}

function envDefaults() {
  return {
    trialEnabled: Boolean(env.TRIAL?.ENABLED),
    trialDays: Math.max(1, Number(env.TRIAL?.DAYS || 3)),
    trialPlan: (env.TRIAL?.PLAN || 'AI_UNLIMITED').toUpperCase(),
    paymentsEnabled: process.env.PAYMENTS_ENABLED !== 'false',
    // Countries that use the platform for free (no paywall, full access).
    // Visitors from these IPs are never asked to pay. Default: mainland China.
    freeCountries: parseCountries(process.env.PAYMENTS_FREE_COUNTRIES, ['CN']),
    paymentsDisabledMessage: { ...DEFAULT_MESSAGES },
  };
}

function normalizePolicy(raw) {
  const base = envDefaults();
  if (!raw || typeof raw !== 'object') return { ...base, fromDatabase: false };

  const trialPlan = String(raw.trialPlan || base.trialPlan).toUpperCase();
  const msg = raw.paymentsDisabledMessage && typeof raw.paymentsDisabledMessage === 'object'
    ? { ...base.paymentsDisabledMessage, ...raw.paymentsDisabledMessage }
    : base.paymentsDisabledMessage;

  return {
    trialEnabled: raw.trialEnabled !== undefined ? Boolean(raw.trialEnabled) : base.trialEnabled,
    trialDays: Math.max(1, Math.min(365, Number(raw.trialDays ?? base.trialDays) || base.trialDays)),
    trialPlan: PLAN_ORDER.includes(trialPlan) && trialPlan !== 'FREE' ? trialPlan : base.trialPlan,
    paymentsEnabled: raw.paymentsEnabled !== undefined ? Boolean(raw.paymentsEnabled) : base.paymentsEnabled,
    freeCountries: raw.freeCountries !== undefined ? parseCountries(raw.freeCountries, base.freeCountries) : base.freeCountries,
    paymentsDisabledMessage: msg,
    fromDatabase: true,
  };
}

// True when a visitor's country is on the free list (no paywall, full access).
function isFreeCountry(country, policy) {
  if (!country || !policy) return false;
  return (policy.freeCountries || []).includes(String(country).toUpperCase());
}

function invalidateBillingPolicyCache() {
  cache = { at: 0, policy: null };
}

async function getBillingPolicy() {
  if (cache.policy && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.policy;
  }
  const row = await prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
  const policy = normalizePolicy(row?.value);
  cache = { at: Date.now(), policy };
  return policy;
}

async function saveBillingPolicy(patch, { adminId } = {}) {
  const current = await getBillingPolicy();
  const next = normalizePolicy({
    trialEnabled: patch.trialEnabled ?? current.trialEnabled,
    trialDays: patch.trialDays ?? current.trialDays,
    trialPlan: patch.trialPlan ?? current.trialPlan,
    paymentsEnabled: patch.paymentsEnabled ?? current.paymentsEnabled,
    freeCountries: patch.freeCountries ?? current.freeCountries,
    paymentsDisabledMessage: {
      ...current.paymentsDisabledMessage,
      ...(patch.paymentsDisabledMessage || {}),
    },
  });

  const toStore = {
    trialEnabled: next.trialEnabled,
    trialDays: next.trialDays,
    trialPlan: next.trialPlan,
    paymentsEnabled: next.paymentsEnabled,
    freeCountries: next.freeCountries,
    paymentsDisabledMessage: next.paymentsDisabledMessage,
  };

  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: toStore },
    update: { value: toStore },
  });
  invalidateBillingPolicyCache();

  return { ...next, savedBy: adminId || null };
}

async function assertPaymentsEnabled() {
  const policy = await getBillingPolicy();
  if (policy.paymentsEnabled) return policy;
  const e = new Error(policy.paymentsDisabledMessage?.zh || DEFAULT_MESSAGES.zh);
  e.status = 503;
  e.code = 'PAYMENTS_DISABLED';
  e.messages = policy.paymentsDisabledMessage;
  throw e;
}

function paymentsDisabledResponse(err, res) {
  return res.status(err.status || 503).json({
    error: err.message,
    code: err.code || 'PAYMENTS_DISABLED',
    messages: err.messages || DEFAULT_MESSAGES,
  });
}

module.exports = {
  getBillingPolicy,
  saveBillingPolicy,
  invalidateBillingPolicyCache,
  assertPaymentsEnabled,
  paymentsDisabledResponse,
  isFreeCountry,
  DEFAULT_MESSAGES,
  TEST_PHASE_PRESET: {
    trialEnabled: true,
    trialDays: 30,
    trialPlan: 'AI_UNLIMITED',
    paymentsEnabled: false,
    paymentsDisabledMessage: { ...DEFAULT_MESSAGES },
  },
};
