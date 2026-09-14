const client = require('prom-client');
const { routeTemplate, captureRoute, onResponseDone } = require('../middleware/requestLogger');

const registry = new client.Registry();
registry.setDefaultLabels({ service: 'timesheet-app-backend' });
client.collectDefaultMetrics({ register: registry });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry]
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry]
});

// Error rate is derived in PromQL from the counter, e.g.
//   sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))

const EXCLUDED_FROM_HISTOGRAM = new Set(['/health', '/metrics']);

function metricsMiddleware(req, res, next) {
  captureRoute(req);
  const start = process.hrtime.bigint();

  onResponseDone(res, (aborted) => {
    const labels = {
      method: req.method,
      route: routeTemplate(req),
      status_code: aborted ? 'aborted' : String(res.statusCode)
    };
    httpRequestsTotal.inc(labels);

    if (!EXCLUDED_FROM_HISTOGRAM.has(req.path)) {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      httpRequestDurationSeconds.observe(labels, seconds);
    }
  });

  next();
}

async function metricsHandler(req, res) {
  res.set('Content-Type', registry.contentType);
  res.end(await registry.metrics());
}

module.exports = {
  registry,
  metricsMiddleware,
  metricsHandler,
  httpRequestsTotal,
  httpRequestDurationSeconds
};
