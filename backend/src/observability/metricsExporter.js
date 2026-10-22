const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { metricsPath, prometheusPort } = require('./config');

const prometheusExporter = new PrometheusExporter({
  preventServerStart: !prometheusPort,
  port: prometheusPort || 9464,
  endpoint: metricsPath
});

module.exports = { prometheusExporter };
