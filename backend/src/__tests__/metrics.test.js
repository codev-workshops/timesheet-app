const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  register,
  dbErrorsTotal,
  dbRows,
  dbFileExists,
  dbFileSizeBytes,
  processUptimeSeconds,
  refreshMetrics,
  metricsMiddleware,
  metricsHandler
} = require('../metrics');
const { getDatabase } = require('../database/init');
const { errorHandler } = require('../middleware/errorHandler');

describe('Metrics', () => {
  const originalDbPath = process.env.DATABASE_PATH;

  afterEach(() => {
    if (originalDbPath === undefined) {
      delete process.env.DATABASE_PATH;
    } else {
      process.env.DATABASE_PATH = originalDbPath;
    }
    jest.clearAllMocks();
  });

  describe('registry', () => {
    test('registers all custom metrics', async () => {
      const names = (await register.getMetricsAsArray()).map((m) => m.name);

      expect(names).toContain('http_request_duration_seconds');
      expect(names).toContain('db_errors_total');
      expect(names).toContain('db_rows');
      expect(names).toContain('db_file_exists');
      expect(names).toContain('db_file_size_bytes');
      expect(names).toContain('process_uptime_seconds');
    });

    test('collects default process metrics', async () => {
      const names = (await register.getMetricsAsArray()).map((m) => m.name);

      expect(names).toContain('process_start_time_seconds');
      expect(names).toContain('process_resident_memory_bytes');
    });
  });

  describe('metricsMiddleware', () => {
    test('records request duration with method, route and status labels', (done) => {
      const req = { method: 'GET', path: '/api/clients', route: { path: '/api/clients' } };
      const listeners = {};
      const res = {
        statusCode: 200,
        on: (event, cb) => { listeners[event] = cb; }
      };
      const next = jest.fn();

      metricsMiddleware(req, res, next);
      expect(next).toHaveBeenCalled();

      listeners.finish();

      register.getSingleMetric('http_request_duration_seconds').get()
        .then((data) => {
          const recorded = data.values.find(
            (v) => v.labels.method === 'GET' &&
              v.labels.route === '/api/clients' &&
              String(v.labels.status_code) === '200' &&
              v.metricName === 'http_request_duration_seconds_count'
          );
          expect(recorded.value).toBeGreaterThanOrEqual(1);
          done();
        })
        .catch(done);
    });
  });

  describe('db_errors_total', () => {
    test('increments via errorHandler on SQLITE_ errors', async () => {
      const before = (await dbErrorsTotal.get()).values
        .filter((v) => v.labels.code === 'SQLITE_BUSY')
        .reduce((sum, v) => sum + v.value, 0);

      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      errorHandler({ code: 'SQLITE_BUSY', message: 'locked' }, {}, res, jest.fn());

      const after = (await dbErrorsTotal.get()).values
        .filter((v) => v.labels.code === 'SQLITE_BUSY')
        .reduce((sum, v) => sum + v.value, 0);

      expect(after).toBe(before + 1);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('refreshMetrics', () => {
    test('sets db_rows for each tracked table', async () => {
      const db = getDatabase();
      db.get.mockImplementation((query, cb) => cb(null, { count: 7 }));

      await refreshMetrics();

      const values = (await dbRows.get()).values;
      for (const table of ['users', 'clients', 'work_entries']) {
        const entry = values.find((v) => v.labels.table === table);
        expect(entry).toBeDefined();
        expect(entry.value).toBe(7);
      }
      expect((await processUptimeSeconds.get()).values[0].value).toBeGreaterThanOrEqual(0);
    });

    test('reports db_file gauges when DATABASE_PATH points to a real file', async () => {
      const tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tsdb-')), 'timesheet.db');
      fs.writeFileSync(tmpFile, 'test');
      process.env.DATABASE_PATH = tmpFile;

      const db = getDatabase();
      db.get.mockImplementation((query, cb) => cb(null, { count: 0 }));

      await refreshMetrics();

      expect((await dbFileExists.get()).values[0].value).toBe(1);
      expect((await dbFileSizeBytes.get()).values[0].value).toBe(4);
    });

    test('reports db_file_exists = 0 when the database file is missing', async () => {
      process.env.DATABASE_PATH = path.join(os.tmpdir(), `missing-${Date.now()}.db`);

      const db = getDatabase();
      db.get.mockImplementation((query, cb) => cb(null, { count: 0 }));

      await refreshMetrics();

      expect((await dbFileExists.get()).values[0].value).toBe(0);
      expect((await dbFileSizeBytes.get()).values[0].value).toBe(0);
    });
  });

  describe('metricsHandler', () => {
    test('responds with the Prometheus exposition format', async () => {
      const db = getDatabase();
      db.get.mockImplementation((query, cb) => cb(null, { count: 0 }));

      const res = {
        set: jest.fn(),
        end: jest.fn(),
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await metricsHandler({}, res);

      expect(res.set).toHaveBeenCalledWith('Content-Type', register.contentType);
      const body = res.end.mock.calls[0][0];
      expect(body).toContain('# HELP http_request_duration_seconds');
      expect(body).toContain('# TYPE db_errors_total counter');
    });
  });
});
