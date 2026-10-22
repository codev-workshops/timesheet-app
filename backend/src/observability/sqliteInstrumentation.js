const {
  context,
  SpanKind,
  SpanStatusCode,
  trace
} = require('@opentelemetry/api');
const { serviceName, serviceVersion } = require('./config');

const tracer = trace.getTracer(serviceName, serviceVersion);
const PATCHED = Symbol.for('timesheet.sqlite3.instrumented');
const METHODS = ['run', 'get', 'all', 'exec'];

function instrumentSqlite3(sqlite3) {
  const prototype = sqlite3 && sqlite3.Database && sqlite3.Database.prototype;
  if (!prototype || prototype[PATCHED]) return;

  Object.defineProperty(prototype, PATCHED, { value: true });

  METHODS.forEach((method) => {
    const original = prototype[method];
    if (typeof original !== 'function') return;

    prototype[method] = function instrumentedSqliteMethod(...args) {
      const callbackIndex = args.length - 1;
      const callback = args[callbackIndex];
      if (typeof callback !== 'function') {
        return original.apply(this, args);
      }

      const sql = typeof args[0] === 'string' ? args[0] : '';
      const operation = sql.match(/^\s*([a-z]+)/i)?.[1]?.toUpperCase() || 'UNKNOWN';
      const parentCtx = context.active();
      const span = tracer.startSpan(`sqlite.${method}`, {
        kind: SpanKind.CLIENT,
        attributes: {
          'db.system.name': 'sqlite',
          'db.operation.name': operation,
          'db.query.text': sql.slice(0, 1000)
        }
      }, parentCtx);

      args[callbackIndex] = function instrumentedSqliteCallback(err, ...callbackArgs) {
        if (err) {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        }
        span.end();
        return context.with(parentCtx, () => callback.apply(this, [err, ...callbackArgs]));
      };

      return context.with(parentCtx, () => original.apply(this, args));
    };
  });
}

module.exports = { instrumentSqlite3 };
