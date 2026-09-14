// Centralized runtime configuration. All process.env reads for feature flags
// live here; the rest of the app imports this module instead of touching env.
// Values are evaluated once at startup — changing a flag requires a restart.

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

function flag(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined) {
    return defaultValue;
  }
  return TRUTHY.has(String(raw).trim().toLowerCase());
}

module.exports = Object.freeze({
  flag,
  features: Object.freeze({
    csvExport: flag('FEATURE_CSV_EXPORT', true),
    pdfReports: flag('FEATURE_PDF_REPORTS', true),
  }),
});
