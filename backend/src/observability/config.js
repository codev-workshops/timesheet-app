const packageInfo = require('../../package.json');

const configuredPort = process.env.PROMETHEUS_PORT;
const prometheusPort = configuredPort && /^\d+$/.test(configuredPort)
  ? Number.parseInt(configuredPort, 10)
  : undefined;

module.exports = {
  serviceName: process.env.OTEL_SERVICE_NAME || 'timesheet-backend',
  serviceVersion: packageInfo.version,
  metricsPath: process.env.METRICS_PATH || '/metrics',
  prometheusPort: Number.isInteger(prometheusPort)
    && prometheusPort > 0
    && prometheusPort <= 65535
    ? prometheusPort
    : undefined,
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info')
};
