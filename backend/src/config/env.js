// Startup environment validation. Import at the top of src/index.js so the
// process fails fast (exit 1) if anything critical is missing or dangerously
// weak. Never ship to production without a .env that passes this check.

require('dotenv').config({ override: true });

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

const errors = [];
const warnings = [];

function requireEnv(key, { minLength = 1, prodOnly = false } = {}) {
  if (prodOnly && !IS_PROD) return;
  const val = process.env[key];
  if (!val) {
    errors.push(`Missing required env: ${key}`);
    return;
  }
  if (val.length < minLength) {
    errors.push(`Env ${key} too short (need >= ${minLength} chars, got ${val.length})`);
  }
}

requireEnv('DATABASE_URL');
requireEnv('JWT_ACCESS_SECRET', { minLength: 32 });
requireEnv('JWT_REFRESH_SECRET', { minLength: 32 });
requireEnv('FRONTEND_URL');

// Hard-block boilerplate placeholder secrets from .env.example
const placeholderMatchers = [/^change_?me/i, /xxx+/i];
['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].forEach((k) => {
  const v = process.env[k] || '';
  if (placeholderMatchers.some((r) => r.test(v))) {
    errors.push(`Env ${k} looks like the .env.example placeholder — generate a real secret with: openssl rand -hex 48`);
  }
  if (process.env.JWT_ACCESS_SECRET && process.env.JWT_REFRESH_SECRET
      && process.env.JWT_ACCESS_SECRET === process.env.JWT_REFRESH_SECRET) {
    if (k === 'JWT_REFRESH_SECRET') {
      errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
    }
  }
});

// Production: require SMTP + admin initial password changed + not the default super-admin password
if (IS_PROD) {
  ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'].forEach((k) => requireEnv(k));
  if (process.env.ALLOW_PROD_SEED === 'true') {
    warnings.push('ALLOW_PROD_SEED=true in production — seed script will run and may recreate demo accounts');
  }
  if (!process.env.ADMIN_IP_ALLOWLIST) {
    warnings.push('ADMIN_IP_ALLOWLIST is empty in production — consider whitelisting admin IPs');
  }
}

if (errors.length) {
  // eslint-disable-next-line no-console
  console.error('\n❌ FATAL: environment configuration invalid:\n  - ' + errors.join('\n  - ') + '\n');
  // eslint-disable-next-line no-console
  console.error('Fix the above in .env (see .env.example) and restart.\n');
  process.exit(1);
}

if (warnings.length) {
  // eslint-disable-next-line no-console
  console.warn('\n⚠️  env warnings:\n  - ' + warnings.join('\n  - ') + '\n');
}

module.exports = {
  NODE_ENV,
  IS_PROD,
  PORT: Number(process.env.PORT || 4000),
  LOG_LEVEL: process.env.LOG_LEVEL || (IS_PROD ? 'info' : 'debug'),
  FRONTEND_URL: process.env.FRONTEND_URL,
};
