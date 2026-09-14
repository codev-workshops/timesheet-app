const logger = require('../config/logger');

const ROUTE_KEY = Symbol('routeTemplate');

// Express unwinds req.baseUrl when a router exits via next(err), so the mount
// path is lost by the time 'finish' fires. Capture "<baseUrl><route.path>" the
// moment Express assigns req.route inside the router instead.
function captureRoute(req) {
  if (Object.prototype.hasOwnProperty.call(req, 'route')) return;
  let route;
  Object.defineProperty(req, 'route', {
    configurable: true,
    enumerable: true,
    get() { return route; },
    set(value) {
      route = value;
      if (value && value.path) req[ROUTE_KEY] = joinRoute(req.baseUrl, value.path);
    }
  });
}

function joinRoute(baseUrl, routePath) {
  const full = `${baseUrl || ''}${routePath}`;
  return full.length > 1 ? full.replace(/\/+$/, '') : full;
}

function routeTemplate(req) {
  if (req[ROUTE_KEY]) return req[ROUTE_KEY];
  if (req.route && req.route.path) return joinRoute(req.baseUrl, req.route.path);
  return 'unmatched';
}

function requestLogger(req, res, next) {
  captureRoute(req);
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const log = req.log || logger;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log.log(level, 'http request', {
      requestId: req.requestId,
      method: req.method,
      route: routeTemplate(req),
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 1000) / 1000,
      contentLength: res.get('Content-Length'),
      userAgent: req.get('user-agent'),
      ip: req.ip
    });
  });

  next();
}

module.exports = { requestLogger, routeTemplate, captureRoute };
