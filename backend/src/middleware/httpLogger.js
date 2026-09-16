const { logger } = require('../config/logger');

function httpLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const fields = {
      method: req.method,
      url: req.originalUrl || req.url,
      status: res.statusCode,
      responseTimeMs: Math.round(durationMs * 1000) / 1000,
      contentLength: res.getHeader('content-length'),
      userAgent: req.headers['user-agent'],
      requestId: req.requestId
    };

    if (res.statusCode >= 500) {
      logger.error('HTTP request', fields);
    } else if (res.statusCode >= 400) {
      logger.warn('HTTP request', fields);
    } else {
      logger.info('HTTP request', fields);
    }
  });

  next();
}

module.exports = {
  httpLogger
};
