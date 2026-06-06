// Startup environment validation. Import at the top of src/index.js so the
// process fails fast (exit 1) if anything critical is missing or dangerously
// weak. Never ship to production without a .env that passes this check.
//
// IMPORTANT: load backend/.env regardless of current working directory.
// Users sometimes start the server from repo root (e.g. `node backend/src/index.js`),
// which would otherwise make dotenv look for <repo>/.env and miss backend/.env.
const path = require('path');
const fs = require('fs');
require('dotenv').config({
  override: true,
  path: path.resolve(__dirname, '../../.env'),
});

// Local override (gitignored). Useful for pointing DATABASE_URL at a dev
// Neon branch without editing the production .env. Loaded AFTER .env so its
// values win.
const localEnv = path.resolve(__dirname, '../../.env.local');
if (fs.existsSync(localEnv)) {
  require('dotenv').config({ override: true, path: localEnv });
}

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
if (!IS_PROD && !process.env.DEEPSEEK_API_KEY) {
  warnings.push('DEEPSEEK_API_KEY is not set — DeepSeek essay grading will 503 until configured');
}
if (!process.env.DASHSCOPE_API_KEY) {
  warnings.push('DASHSCOPE_API_KEY is not set — Qwen essay tiers disabled until configured');
}
if (!process.env.OPENAI_API_KEY) {
  warnings.push('OPENAI_API_KEY is not set — Whisper STT (oral transcription) will fail until configured');
}

// Oral AI: Whisper STT + DeepSeek grading. Enabled unless explicitly disabled.
const ENABLE_ORAL_AI = process.env.ENABLE_ORAL_AI !== 'false';
if (ENABLE_ORAL_AI && !process.env.DEEPSEEK_API_KEY) {
  errors.push('Oral AI grading requires DEEPSEEK_API_KEY');
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
const STRIPE_CONFIGURED = !!(
  process.env.STRIPE_SECRET_KEY &&
  process.env.STRIPE_WEBHOOK_SECRET
);

// Feature flags for the China-direct channels. Default OFF — overseas deploy
// uses Stripe (which itself supports wechat_pay/alipay payment methods), so
// the direct WeChat V3 / Alipay routes stay dormant unless explicitly enabled.
const ENABLE_DIRECT_WECHAT = process.env.ENABLE_DIRECT_WECHAT === 'true';
const ENABLE_DIRECT_ALIPAY = process.env.ENABLE_DIRECT_ALIPAY === 'true';

if (IS_PROD) {
  if (!WECHAT_CONFIGURED && !ALIPAY_CONFIGURED && !STRIPE_CONFIGURED) {
    errors.push('No payment channel configured — set WECHAT_*, ALIPAY_* or STRIPE_* (see .env.example)');
  }
  // Only require the public base URL if a China-direct channel is BOTH configured
  // AND turned on — its notify callbacks need a public HTTPS URL.
  if ((ENABLE_DIRECT_WECHAT && WECHAT_CONFIGURED) || (ENABLE_DIRECT_ALIPAY && ALIPAY_CONFIGURED)) {
    if (!process.env.PAY_PUBLIC_BASE_URL) {
      errors.push('PAY_PUBLIC_BASE_URL is required when ENABLE_DIRECT_WECHAT/ALIPAY=true (must be HTTPS, used by channel notify callbacks)');
    } else if (!/^https:\/\//.test(process.env.PAY_PUBLIC_BASE_URL)) {
      errors.push('PAY_PUBLIC_BASE_URL must start with https:// (channels reject insecure notify URLs)');
    }
  }
  if (process.env.PAY_MOCK_ENABLED === 'true') {
    errors.push('PAY_MOCK_ENABLED=true is forbidden in production — remove it from .env');
  }
  if (STRIPE_CONFIGURED) {
    const adaptive = process.env.STRIPE_ADAPTIVE_PRICING !== 'false';
    const embedded = process.env.STRIPE_CHECKOUT_UI !== 'hosted'
      && (process.env.STRIPE_CHECKOUT_UI === 'embedded' || adaptive);
    if (embedded && !process.env.STRIPE_PUBLISHABLE_KEY) {
      warnings.push('STRIPE_PUBLISHABLE_KEY not set — embedded checkout requires the publishable key on the frontend');
    }
    if (!embedded) {
      if (!process.env.STRIPE_CHECKOUT_SUCCESS_URL || !process.env.STRIPE_CHECKOUT_CANCEL_URL) {
        warnings.push('STRIPE_CHECKOUT_SUCCESS_URL / STRIPE_CHECKOUT_CANCEL_URL not set — hosted Stripe checkout will fall back to FRONTEND_URL based redirects');
      }
    }
  }
} else {
  if (!WECHAT_CONFIGURED) warnings.push('WECHAT_* not fully set — /api/pay/wechat/* will operate in mock mode');
  if (!ALIPAY_CONFIGURED) warnings.push('ALIPAY_* not fully set — /api/pay/alipay/* will operate in mock mode');
  if (!STRIPE_CONFIGURED) warnings.push('STRIPE_* not fully set — /api/pay/stripe/* will 503 until configured');
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
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  ENABLE_ORAL_AI,

  // Payments
  WECHAT_CONFIGURED,
  ALIPAY_CONFIGURED,
  STRIPE_CONFIGURED,
  ENABLE_DIRECT_WECHAT,
  ENABLE_DIRECT_ALIPAY,
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
  STRIPE: {
    SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
    PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
    WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
    CHECKOUT_SUCCESS_URL: process.env.STRIPE_CHECKOUT_SUCCESS_URL || '',
    CHECKOUT_CANCEL_URL: process.env.STRIPE_CHECKOUT_CANCEL_URL || '',
    // Adaptive Pricing: Stripe converts anchor-currency prices at Checkout (150+ countries).
    // Set STRIPE_ADAPTIVE_PRICING=false to revert to fixed multi-currency catalog.
    ADAPTIVE_PRICING: process.env.STRIPE_ADAPTIVE_PRICING !== 'false',
    ANCHOR_CURRENCY: (process.env.STRIPE_ANCHOR_CURRENCY || 'EUR').toUpperCase(),
    // embedded (default when adaptive) = ui_mode elements + Currency Selector on site.
    // hosted = redirect to Stripe hosted page. Set STRIPE_CHECKOUT_UI=hosted to force.
    CHECKOUT_UI: process.env.STRIPE_CHECKOUT_UI || 'embedded',
  },
};
