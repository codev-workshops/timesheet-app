let sdk;

if (process.env.OTEL_SDK_DISABLED !== 'true') {
  const { NodeSDK, tracing } = require('@opentelemetry/sdk-node');
  const { resourceFromAttributes } = require('@opentelemetry/resources');
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { serviceName, serviceVersion, metricsPath } = require('./config');
  const { prometheusExporter } = require('./metricsExporter');
  const { instrumentSqlite3 } = require('./sqliteInstrumentation');

  const traceExportConfigured = Boolean(
    process.env.OTEL_TRACES_EXPORTER
    || process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
  );
  const options = {
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion
    }),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-pino': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (req) => req.url.split('?')[0] === metricsPath
      }
    })],
    metricReader: prometheusExporter
  };

  if (!traceExportConfigured) {
    options.spanProcessors = [new tracing.NoopSpanProcessor()];
  }

  sdk = new NodeSDK(options);
  sdk.start();
  instrumentSqlite3(require('sqlite3'));

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    sdk.shutdown()
      .catch((err) => console.error('OpenTelemetry shutdown failed:', err))
      .finally(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

module.exports = { sdk };
