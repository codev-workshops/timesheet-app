const {
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpRequestErrorsTotal
} = require('../config/metrics');

function resolveRoute(req) {
  if (req.route && req.route.path) {
    return `${req.baseUrl || ''}${req.route.path}`;
  }
  if (req.baseUrl) {
    return req.baseUrl;
  }
  return 'unmatched';
}

function metricsMiddleware(req, res, next) {
  const endTimer = httpRequestDurationSeconds.startTimer();

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
  metricsMiddleware
};
