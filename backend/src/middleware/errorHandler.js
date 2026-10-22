const { createLogger } = require('../observability/logger');

const log = createLogger('middleware/errorHandler');

function errorHandler(err, req, res, next) {
  log.error({
    err,
    req_id: req.id,
    method: req.method,
    url: req.originalUrl
  }, 'Unhandled request error');

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
