const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'timesheet-app-backend' },
  transports: [new winston.transports.Console()],
  silent: process.env.NODE_ENV === 'test' && !process.env.LOG_IN_TESTS
});

function serializeError(err) {
  if (!err) return undefined;
  if (!(err instanceof Error)) return err;
  return { message: err.message, name: err.name, code: err.code, stack: err.stack };
}

logger.serializeError = serializeError;

module.exports = logger;
