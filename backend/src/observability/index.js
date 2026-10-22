const { metrics, trace } = require('@opentelemetry/api');
const { serviceName, serviceVersion, metricsPath } = require('./config');
const { prometheusExporter } = require('./metricsExporter');
const { httpLogger } = require('./httpLogger');
const { logger, createLogger } = require('./logger');
const { registerHealthRoutes } = require('./health');

function applyObservability(app) {
  app.use(httpLogger);
  app.get(metricsPath, (req, res) => prometheusExporter.getMetricsRequestHandler(req, res));
}

module.exports = {
  applyObservability,
  logger,
  createLogger,
  registerHealthRoutes,
  tracer: trace.getTracer(serviceName, serviceVersion),
  meter: metrics.getMeter(serviceName, serviceVersion)
};
