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

// AI writing graders: required in production (feature is a paid-tier entitlement).
// In dev we only warn — calls to a missing provider return 503 at call time, not at boot.
// At least ONE provider must be configured in prod, but we check each independently so
// the error message is clear (we don't try to short-circuit "either one is fine").
requireEnv('DEEPSEEK_API_KEY', { minLength: 30, prodOnly: true });
requireEnv('DASHSCOPE_API_KEY', { minLength: 30, prodOnly: true });
if (!IS_PROD && !process.env.DEEPSEEK_API_KEY) {
  warnings.push('DEEPSEEK_API_KEY is not set — DeepSeek essay grading will 503 until configured');
}
if (!IS_PROD && !process.env.DASHSCOPE_API_KEY) {
  warnings.push('DASHSCOPE_API_KEY is not set — Qwen essay grading will 503 until configured');
}

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

// Payments (WeChat V3 / Alipay). In production at least one channel must be fully configured.
const WECHAT_CONFIGURED = !!(
  process.env.WECHAT_APP_ID &&
  process.env.WECHAT_MCHID &&
  process.env.WECHAT_SERIAL_NO &&
  process.env.WECHAT_APIV3_KEY &&
  process.env.WECHAT_PRIVATE_KEY_PEM &&
  process.env.WECHAT_PLATFORM_CERT_PEM
);
const ALIPAY_CONFIGURED = !!(
  process.env.ALIPAY_APP_ID &&
  process.env.ALIPAY_PRIVATE_KEY_PEM &&
  process.env.ALIPAY_PUBLIC_KEY_PEM
);

if (IS_PROD) {
  if (!WECHAT_CONFIGURED && !ALIPAY_CONFIGURED) {
    errors.push('No payment channel configured — set either WECHAT_* or ALIPAY_* (see .env.example)');
  }
  if (!process.env.PAY_PUBLIC_BASE_URL) {
    errors.push('PAY_PUBLIC_BASE_URL is required in production (must be HTTPS, used by channel notify callbacks)');
  } else if (!/^https:\/\//.test(process.env.PAY_PUBLIC_BASE_URL)) {
    errors.push('PAY_PUBLIC_BASE_URL must start with https:// (channels reject insecure notify URLs)');
  }
  if (process.env.PAY_MOCK_ENABLED === 'true') {
    errors.push('PAY_MOCK_ENABLED=true is forbidden in production — remove it from .env');
  }
} else {
  if (!WECHAT_CONFIGURED) warnings.push('WECHAT_* not fully set — /api/pay/wechat/* will operate in mock mode');
  if (!ALIPAY_CONFIGURED) warnings.push('ALIPAY_* not fully set — /api/pay/alipay/* will operate in mock mode');
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
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY || '',
  DASHSCOPE_BASE_URL: process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',

  // Payments
  WECHAT_CONFIGURED,
  ALIPAY_CONFIGURED,
  PAY_PUBLIC_BASE_URL: process.env.PAY_PUBLIC_BASE_URL || '',
  PAY_MOCK_ENABLED: process.env.PAY_MOCK_ENABLED === 'true',
  WECHAT: {
    APP_ID: process.env.WECHAT_APP_ID || '',
    MCHID: process.env.WECHAT_MCHID || '',
    SERIAL_NO: process.env.WECHAT_SERIAL_NO || '',
    APIV3_KEY: process.env.WECHAT_APIV3_KEY || '',
    PRIVATE_KEY_PEM: process.env.WECHAT_PRIVATE_KEY_PEM || '',
    PLATFORM_CERT_PEM: process.env.WECHAT_PLATFORM_CERT_PEM || '',
  },
  ALIPAY: {
    APP_ID: process.env.ALIPAY_APP_ID || '',
    PRIVATE_KEY_PEM: process.env.ALIPAY_PRIVATE_KEY_PEM || '',
    PUBLIC_KEY_PEM: process.env.ALIPAY_PUBLIC_KEY_PEM || '',
    GATEWAY: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
  },
};
