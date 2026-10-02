const client = require('prom-client');
const fs = require('fs');
const { getDatabase } = require('./database/init');

const register = new client.Registry();

// Default metrics: process.memoryUsage(), process_start_time_seconds, event loop lag, GC, etc.
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register]
});

const dbErrorsTotal = new client.Counter({
  name: 'db_errors_total',
  help: 'Database errors by SQLite error code',
  labelNames: ['code'],
  registers: [register]
});

const dbRows = new client.Gauge({
  name: 'db_rows',
  help: 'Row count per table, refreshed on each scrape (data-loss signal)',
  labelNames: ['table'],
  registers: [register]
});

const dbFileExists = new client.Gauge({
  name: 'db_file_exists',
  help: 'Whether the SQLite database file exists (1 = exists, 0 = missing)',
  registers: [register]
});

const dbFileSizeBytes = new client.Gauge({
  name: 'db_file_size_bytes',
  help: 'SQLite database file size in bytes (shrinking file signals data loss)',
  registers: [register]
});

const processUptimeSeconds = new client.Gauge({
  name: 'process_uptime_seconds',
  help: 'Seconds since process start; resets to 0 on restart (crash-loop signal)',
  registers: [register]
});

const TABLES = ['users', 'clients', 'work_entries'];
const startTime = Date.now();

function countRows(database, table) {
  return new Promise((resolve) => {
    database.get(`SELECT COUNT(*) AS count FROM ${table}`, (err, row) => {
      resolve(err ? -1 : row.count);
    });
  });
}

async function refreshMetrics() {
  processUptimeSeconds.set((Date.now() - startTime) / 1000);

  let database;
  try {
    database = getDatabase();
  } catch (err) {
    console.error('Failed to get database for metrics refresh:', err);
    return;
  }

  for (const table of TABLES) {
    dbRows.set({ table }, await countRows(database, table));
  }

  const dbPath = process.env.DATABASE_PATH;
  if (dbPath && dbPath !== ':memory:') {
    try {
      const stats = fs.statSync(dbPath);
      dbFileExists.set(1);
      dbFileSizeBytes.set(stats.size);
    } catch (err) {
      dbFileExists.set(0);
      dbFileSizeBytes.set(0);
    }
  }
}

function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = (req.route && req.route.path) || req.baseUrl || req.path;
    httpRequestDuration
      .labels(req.method, route, res.statusCode)
      .observe(durationSeconds);
  });
  next();
}

async function metricsHandler(req, res) {
  try {
    await refreshMetrics();
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    console.error('Failed to render metrics:', err);
    res.status(500).json({ error: 'Failed to render metrics' });
  }
}

module.exports = {
  register,
  httpRequestDuration,
  dbErrorsTotal,
  dbRows,
  dbFileExists,
  dbFileSizeBytes,
  processUptimeSeconds,
  refreshMetrics,
  metricsMiddleware,
  metricsHandler
};
