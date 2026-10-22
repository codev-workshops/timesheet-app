const crypto = require('crypto');
const pinoHttp = require('pino-http');
const { trace } = require('@opentelemetry/api');
const { logger } = require('./logger');
const { metricsPath } = require('./config');

function genReqId(req, res) {
  const requestId = req.headers['x-request-id'];
  const correlationId = req.headers['x-correlation-id'];
  const candidate = typeof requestId === 'string' ? requestId : correlationId;
  const id = typeof candidate === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate)
    ? candidate
    : crypto.randomUUID();

  res.setHeader('X-Request-Id', id);
  trace.getActiveSpan()?.setAttribute('request.id', id);
  return id;
}

const httpLogger = pinoHttp({
  logger,
  quietReqLogger: true,
  customAttributeKeys: { reqId: 'req_id' },
  genReqId,
  customLogLevel: (req, res, err) => (
    err || res.statusCode >= 500
      ? 'error'
      : res.statusCode >= 400
        ? 'warn'
        : 'info'
  ),
  autoLogging: {
    ignore: (req) => {
      const path = req.url.split('?')[0];
      return path === metricsPath || path.startsWith('/health');
    }
  }
});

module.exports = { httpLogger, genReqId };
