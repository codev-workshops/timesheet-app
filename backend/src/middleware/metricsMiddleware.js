const {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpRequestErrorsTotal
} = require('../config/metrics');

const UNMATCHED_ROUTE = 'unmatched';

/**
 * Express assigns `req.route` when a route matches and restores `req.baseUrl`
 * as routers unwind (e.g. when an error is forwarded to the error handler), so
 * the mount path is captured at match time via a `req.route` setter.
 */
function trackMatchedRoute(req) {
  let matchedRoute;
  Object.defineProperty(req, 'route', {
    configurable: true,
    enumerable: true,
    get() {
      return matchedRoute;
    },
    set(route) {
      matchedRoute = route;
      req.matchedRoutePath = `${req.baseUrl || ''}${route && route.path ? route.path : ''}`;
    }
  });
}

function resolveRoute(req) {
  if (req.matchedRoutePath) {
    return req.matchedRoutePath;
  }
  if (req.baseUrl) {
    return req.baseUrl;
  }
  return UNMATCHED_ROUTE;
}

function metricsMiddleware(req, res, next) {
  const endTimer = httpRequestDurationSeconds.startTimer();
  trackMatchedRoute(req);

  res.on('finish', () => {
    const labels = {
      method: req.method,
      route: resolveRoute(req),
      status_code: String(res.statusCode)
    };

    endTimer(labels);
    httpRequestsTotal.inc(labels);
    if (res.statusCode >= 400) {
      httpRequestErrorsTotal.inc(labels);
    }
  });

  next();
}

module.exports = {
  metricsMiddleware,
  resolveRoute
};
