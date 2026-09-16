const { AsyncLocalStorage } = require('async_hooks');
const winston = require('winston');

const requestContextStorage = new AsyncLocalStorage();

function getRequestId() {
  const store = requestContextStorage.getStore();
  return store ? store.requestId : undefined;
}

function runWithRequestContext(context, callback) {
  return requestContextStorage.run(context, callback);
}

const injectRequestId = winston.format((info) => {
  const requestId = getRequestId();
  if (requestId && info.requestId === undefined) {
    info.requestId = requestId;
  }
  return info;
});

const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
const level = process.env.LOG_LEVEL || (isTest ? 'silent' : 'info');

const logger = winston.createLogger({
  level: level === 'silent' ? 'info' : level,
  silent: level === 'silent',
  defaultMeta: { service: 'timesheet-backend' },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    injectRequestId(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

module.exports = {
  logger,
  getRequestId,
  runWithRequestContext,
  requestContextStorage
};
