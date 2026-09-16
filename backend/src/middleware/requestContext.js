const { randomUUID } = require('crypto');
const { runWithRequestContext } = require('../config/logger');

function requestContext(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const requestId = typeof incoming === 'string' && incoming.trim() ? incoming.trim() : randomUUID();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  runWithRequestContext({ requestId }, () => next());
}

module.exports = {
  requestContext
};
