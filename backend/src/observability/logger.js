const pino = require('pino');
const { isSpanContextValid, trace } = require('@opentelemetry/api');
const { logLevel, serviceName } = require('./config');

function traceMixin() {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext || !isSpanContextValid(spanContext)) return {};

  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: spanContext.traceFlags.toString(16).padStart(2, '0')
  };
}

const logger = pino({
  level: logLevel,
  base: { service: serviceName },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label })
  },
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]'
  ],
  mixin: traceMixin
});

function createLogger(moduleName) {
  return logger.child({ module: moduleName });
}

module.exports = { logger, createLogger, traceMixin };
