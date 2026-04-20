const pino = require('pino');
const pinoHttp = require('pino-http');
const { randomUUID } = require('crypto');
const { IS_PROD, LOG_LEVEL } = require('../config/env');

const logger = pino({
  level: LOG_LEVEL,
  base: { service: 'delfluent-backend' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-admin-password"]',
      'req.body.password',
      'req.body.newPassword',
      'req.body.refreshToken',
      'req.body.token',
      'req.body.pendingToken',
      'req.body.code',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(IS_PROD
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true, translateTime: 'HH:MM:ss' } } }),
});

const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.headers['x-request-id'] || randomUUID(),
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customProps: (req) => ({ requestId: req.id }),
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

module.exports = { logger, httpLogger };
