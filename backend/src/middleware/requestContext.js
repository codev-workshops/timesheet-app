const crypto = require('crypto');
const { trace } = require('@opentelemetry/api');
const logger = require('../config/logger');

function requestContext(req, res, next) {
  const requestId = req.get('X-Request-Id') || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  req.log = logger.child({ requestId });

  const span = trace.getActiveSpan();
  if (span) {
    span.setAttribute('request_id', requestId);
  }

  next();
}

module.exports = { requestContext };
