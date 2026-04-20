// Boot order matters: env validation MUST run before anything else imports
// from process.env (prisma, jwt, etc).
const env = require('./config/env');
const { logger, httpLogger } = require('./utils/logger');

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const prisma = require('./prisma');
const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exams');
const sessionRoutes = require('./routes/sessions');
const userRoutes = require('./routes/user');
const essayRoutes = require('./routes/essays');
const passwordResetRoutes = require('./routes/passwordReset');
const adminAuthRoutes = require('./routes/adminAuth');
const adminUserRoutes = require('./routes/adminUsers');
const adminStatsRoutes = require('./routes/adminStats');
const adminExamRoutes = require('./routes/adminExams');
const { ipAllowlist } = require('./middleware/admin');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const essayQueue = require('./services/essayQueue');

const app = express();

app.set('trust proxy', 1);

// --- Security headers ---
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", env.FRONTEND_URL],
        mediaSrc: ["'self'", 'https:'],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: env.IS_PROD ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: env.IS_PROD ? { maxAge: 63072000, includeSubDomains: true, preload: true } : false,
  })
);

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(httpLogger);

// --- Rate limiters ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please retry later' },
});
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin login attempts' },
});
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests' },
});
const adminApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

// --- Static audio (FEI sample exam MP3s and future CDN fallback) ---
// Mounted under /api/* so the Vite dev proxy forwards it automatically.
// Files live outside git (see .gitignore). No auth — this is public study material.
app.use(
  '/api/audio/fei',
  express.static(path.join(__dirname, '..', 'content', 'fei-samples'), {
    fallthrough: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  })
);

// --- Health ---
app.get('/api/health', async (_req, res) => {
  const health = { status: 'ok', service: 'delfluent-backend', ts: Date.now(), db: 'unknown' };
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.db = 'ok';
  } catch (e) {
    health.status = 'degraded';
    health.db = 'error';
  }
  res.status(health.status === 'ok' ? 200 : 503).json(health);
});

// --- Public APIs ---
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/auth', passwordResetLimiter, passwordResetRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/user', userRoutes);
app.use('/api/user/essays', essayRoutes);

// --- Admin APIs ---
app.use('/api/admin', ipAllowlist);
app.use('/api/admin/auth', adminLoginLimiter, adminAuthRoutes);
app.use('/api/admin/users', adminApiLimiter, adminUserRoutes);
app.use('/api/admin/stats', adminApiLimiter, adminStatsRoutes);
app.use('/api/admin/exams', adminApiLimiter, adminExamRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'DELFluent backend started');
  // Kick off the AI essay grader worker. Missing DEEPSEEK_API_KEY is tolerated
  // in dev (env.js only warns): worker will try to claim rows, aiGrader will
  // throw AI_NOT_CONFIGURED, the queue will mark them 'error' with a clear
  // message. Production startup already failed in env.js if key was missing.
  essayQueue.startWorker().catch((err) => {
    logger.error({ err }, 'essayQueue.startWorker.fail');
  });
});

// --- Graceful shutdown ---
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'graceful shutdown initiated');
  // Stop accepting new connections.
  server.close(async (err) => {
    if (err) logger.error({ err }, 'error while closing http server');
    // Let in-flight AI grading finish (or time out at 12s) before tearing
    // down the DB connection — otherwise prisma.update in processOne would
    // race with prisma.disconnect.
    await essayQueue.drain({ timeoutMs: 12000 }).catch((e) => {
      logger.error({ err: e }, 'essayQueue.drain.fail');
    });
    await prisma.disconnect();
    logger.info('shutdown complete');
    process.exit(err ? 1 : 0);
  });
  // Safety net: force exit after 15s.
  setTimeout(() => {
    logger.error('force exit after shutdown timeout');
    process.exit(1);
  }, 15000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandledRejection');
  shutdown('unhandledRejection');
});
