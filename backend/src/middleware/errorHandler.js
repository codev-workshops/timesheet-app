const logger = require('../config/logger');

function errorHandler(err, req, res, next) {
  const log = req.log || logger;
  const status = err.isJoi ? 400 : (err.status || 500);
  log.log(status >= 500 ? 'error' : 'warn', 'request failed', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl || req.path,
    status,
    severity: status >= 500 ? 'error' : 'warn',
    err: logger.serializeError(err)
  });

  // Joi validation errors
  if (err.isJoi) {
    return res.status(400).json({
      error: 'Validation error',
      details: err.details.map(detail => detail.message)
    });
  }

  // SQLite errors
  if (err.code && err.code.startsWith('SQLITE_')) {
    return res.status(500).json({
      error: 'Database error',
      message: 'An error occurred while processing your request'
    });
  }

  // Default error
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
}

module.exports = {
  errorHandler
};
