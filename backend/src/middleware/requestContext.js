const crypto = require('crypto');
const { trace } = require('@opentelemetry/api');
const logger = require('../config/logger');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function requestContext(req, res, next) {
  const incoming = req.get('X-Request-Id');
  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : crypto.randomUUID();
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
