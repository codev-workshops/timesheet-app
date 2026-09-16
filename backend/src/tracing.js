const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');

const DIAG_LEVELS = {
  none: DiagLogLevel.NONE,
  error: DiagLogLevel.ERROR,
  warn: DiagLogLevel.WARN,
  info: DiagLogLevel.INFO,
  debug: DiagLogLevel.DEBUG
};

const SERVICE_NAME = 'timesheet-backend';
const DEFAULT_ENDPOINT = 'http://localhost:4318/v1/traces';

const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
const isDisabled = process.env.OTEL_SDK_DISABLED === 'true';

let sdk = null;

function resolveEndpoint() {
  if (process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
    return process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  }
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces`;
  }
  return DEFAULT_ENDPOINT;
}

function startTracing() {
  if (sdk || isTest || isDisabled) {
    return sdk;
  }

  // Export failures (e.g. no collector running) are silent unless OTEL_LOG_LEVEL is set.
  const diagLevel = DIAG_LEVELS[(process.env.OTEL_LOG_LEVEL || 'none').toLowerCase()];
  if (diagLevel !== undefined && diagLevel !== DiagLogLevel.NONE) {
    diag.setLogger(new DiagConsoleLogger(), diagLevel);
  }

  try {
    sdk = new NodeSDK({
      serviceName: SERVICE_NAME,
      traceExporter: new OTLPTraceExporter({ url: resolveEndpoint() }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false }
        })
      ]
    });
    sdk.start();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('OpenTelemetry initialization failed; continuing without tracing', err);
    sdk = null;
    return null;
  }

  const shutdown = () => {
    sdk.shutdown().catch(() => {}).finally(() => process.exit(0));
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  return sdk;
}

startTracing();

module.exports = {
  startTracing,
  resolveEndpoint
};
