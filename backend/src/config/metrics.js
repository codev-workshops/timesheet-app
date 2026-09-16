const client = require('prom-client');

const registry = new client.Registry();
registry.setDefaultLabels({ service: 'timesheet-backend' });

client.collectDefaultMetrics({ register: registry });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry]
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry]
});

const httpRequestErrorsTotal = new client.Counter({
  name: 'http_request_errors_total',
  help: 'Total number of HTTP requests that resulted in a 4xx or 5xx status',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry]
});

module.exports = {
  registry,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  httpRequestErrorsTotal
};
