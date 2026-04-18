const { Prisma } = require('@prisma/client');
const { logger } = require('../utils/logger');
const { IS_PROD } = require('../config/env');

// 404 for unmatched routes
function notFoundHandler(req, res, _next) {
  res.status(404).json({ error: 'Not found', path: req.originalUrl, requestId: req.id });
}

// Central error handler. Never leak internal details in production.
function errorHandler(err, req, res, _next) {
  const requestId = req.id;

  // --- Zod validation errors ---
  if (err?.name === 'ZodError') {
    const details = err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    logger.warn({ err, requestId }, 'validation failed');
    return res.status(400).json({ error: 'Validation failed', details, requestId });
  }

  // --- JWT errors ---
  if (err?.name === 'TokenExpiredError' || err?.name === 'JsonWebTokenError' || err?.name === 'NotBeforeError') {
    logger.warn({ err, requestId }, 'jwt error');
    return res.status(401).json({ error: 'Invalid or expired token', requestId });
  }

  // --- Prisma errors (map the ones we care about; never leak details) ---
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: unique constraint violation
    if (err.code === 'P2002') {
      const fields = Array.isArray(err.meta?.target) ? err.meta.target : [];
      logger.warn({ err, requestId, fields }, 'prisma unique violation');
      return res.status(409).json({ error: 'Conflict: resource already exists', fields, requestId });
    }
    // P2025: record not found (when using exclusive ops)
    if (err.code === 'P2025') {
      logger.warn({ err, requestId }, 'prisma record not found');
      return res.status(404).json({ error: 'Not found', requestId });
    }
    // P2003: foreign key violation
    if (err.code === 'P2003') {
      logger.warn({ err, requestId }, 'prisma fk violation');
      return res.status(409).json({ error: 'Related resource constraint', requestId });
    }
    // Other known Prisma errors: treat as 400 generic
    logger.error({ err, requestId }, 'prisma known request error');
    return res.status(400).json({ error: 'Database request error', code: err.code, requestId });
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.error({ err, requestId }, 'prisma validation error');
    return res.status(400).json({ error: 'Database validation error', requestId });
  }

  // --- Explicit HTTP-style errors (e.g. `const e = new Error('x'); e.status = 403; throw e`) ---
  if (err?.status && err.status < 500) {
    logger.warn({ err, requestId }, 'handled http error');
    return res.status(err.status).json({ error: err.message || 'Request error', requestId });
  }

  // --- Unknown: 500 ---
  logger.error({ err, requestId }, 'unhandled error');
  const body = { error: 'Internal server error', requestId };
  if (!IS_PROD) {
    body.message = err?.message;
    body.stack = err?.stack;
  }
  res.status(500).json(body);
}

module.exports = { errorHandler, notFoundHandler };
