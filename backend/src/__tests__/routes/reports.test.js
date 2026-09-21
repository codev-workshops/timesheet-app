const request = require('supertest');
const express = require('express');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');
jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => {
    const doc = {
      fontSize: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      moveDown: jest.fn().mockReturnThis(),
      moveTo: jest.fn().mockReturnThis(),
      lineTo: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      addPage: jest.fn().mockReturnThis(),
      pipe: jest.fn((dest) => {
        doc._dest = dest;
        return dest;
      }),
      end: jest.fn(() => {
        if (doc._dest) doc._dest.end();
      }),
      y: 100
    };
    return doc;
  });
});

const reportRoutes = require('../../routes/reports');
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = 'test@example.com';
    next();
  }
}));

const app = express();
app.use(express.json());
app.use('/api/reports', reportRoutes);

const isClientLookup = (query) => query.includes('FROM clients WHERE id = ?');
const isTotals = (query) => query.includes('COALESCE(SUM(hours), 0)') && query.includes('COUNT(*) AS entryCount');
const isSummaryTotals = (query) => query.includes('AS totalClients');

/**
 * Configure db.get so that the client lookup returns `client` and the SQL
 * aggregate returns `totals`. Either may be an Error to simulate a DB failure.
 */
function mockGet(mockDb, { client, totals = { totalHours: 0, entryCount: 0 } }) {
  mockDb.get.mockImplementation((query, params, callback) => {
    if (isClientLookup(query)) {
      return client instanceof Error ? callback(client, null) : callback(null, client);
    }
    if (isTotals(query)) {
      return totals instanceof Error ? callback(totals, null) : callback(null, totals);
    }
    callback(new Error(`Unexpected db.get query: ${query}`));
  });
}

/** Make db.each emit the given rows then call the completion callback. */
function mockEach(mockDb, rowsOrError) {
  mockDb.each.mockImplementation((query, params, rowCb, doneCb) => {
    if (rowsOrError instanceof Error) {
      rowCb(rowsOrError, null);
      return doneCb(rowsOrError, 0);
    }
    rowsOrError.forEach((row) => rowCb(null, row));
    doneCb(null, rowsOrError.length);
  });
}

describe('Report Routes', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      all: jest.fn(),
      get: jest.fn(),
      each: jest.fn()
    };
    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/reports/summary', () => {
    test('should return SQL aggregates and 5 most recent entries', async () => {
      const recent = [
        { id: 3, client_id: 1, hours: 2, date: '2024-03-01', client_name: 'A' },
        { id: 2, client_id: 1, hours: 1.5, date: '2024-02-01', client_name: 'A' }
      ];
      mockDb.get.mockImplementation((query, params, callback) => {
        expect(isSummaryTotals(query)).toBe(true);
        expect(params).toEqual(['test@example.com', 'test@example.com', 'test@example.com']);
        callback(null, { totalClients: 4, totalEntries: 120, totalHours: 355.25 });
      });
      mockDb.all.mockImplementation((query, params, callback) => {
        expect(query).toContain('LIMIT 5');
        expect(query).toContain('c.name as client_name');
        expect(params).toEqual(['test@example.com']);
        callback(null, recent);
      });

      const response = await request(app).get('/api/reports/summary');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        totalClients: 4,
        totalEntries: 120,
        totalHours: 355.25,
        recentEntries: recent
      });
    });

    test('should return zeros and empty list for a new user', async () => {
      mockDb.get.mockImplementation((query, params, callback) =>
        callback(null, { totalClients: 0, totalEntries: 0, totalHours: 0 })
      );
      mockDb.all.mockImplementation((query, params, callback) => callback(null, []));

      const response = await request(app).get('/api/reports/summary');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ totalClients: 0, totalEntries: 0, totalHours: 0, recentEntries: [] });
    });

    test('should handle database error on totals', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(new Error('boom'), null));

      const response = await request(app).get('/api/reports/summary');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      expect(mockDb.all).not.toHaveBeenCalled();
    });

    test('should handle database error on recent entries', async () => {
      mockDb.get.mockImplementation((query, params, callback) =>
        callback(null, { totalClients: 1, totalEntries: 1, totalHours: 1 })
      );
      mockDb.all.mockImplementation((query, params, callback) => callback(new Error('boom'), null));

      const response = await request(app).get('/api/reports/summary');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should scope every query by user_email', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        expect(query).toContain('user_email = ?');
        expect(params).toContain('test@example.com');
        callback(null, { totalClients: 0, totalEntries: 0, totalHours: 0 });
      });
      mockDb.all.mockImplementation((query, params, callback) => {
        expect(query).toContain('we.user_email = ?');
        expect(params).toContain('test@example.com');
        callback(null, []);
      });

      await request(app).get('/api/reports/summary');

      expect(mockDb.get).toHaveBeenCalledTimes(1);
      expect(mockDb.all).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/reports/client/:clientId', () => {
    test('should return client report with work entries', async () => {
      const mockClient = { id: 1, name: 'Test Client' };
      const mockWorkEntries = [
        { id: 1, hours: 5.5, description: 'Work 1', date: '2024-01-01' },
        { id: 2, hours: 3.0, description: 'Work 2', date: '2024-01-02' }
      ];

      mockGet(mockDb, { client: mockClient, totals: { totalHours: 8.5, entryCount: 2 } });
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, mockWorkEntries);
      });

      const response = await request(app).get('/api/reports/client/1');

      expect(response.status).toBe(200);
      expect(response.body.client).toEqual(mockClient);
      expect(response.body.workEntries).toEqual(mockWorkEntries);
      expect(response.body.totalHours).toBe(8.5);
      expect(response.body.entryCount).toBe(2);
    });

    test('should return report with zero hours for client with no entries', async () => {
      mockGet(mockDb, { client: { id: 1, name: 'Empty Client' }, totals: { totalHours: 0, entryCount: 0 } });
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      const response = await request(app).get('/api/reports/client/1');

      expect(response.status).toBe(200);
      expect(response.body.totalHours).toBe(0);
      expect(response.body.entryCount).toBe(0);
    });

    test('should take totalHours/entryCount from the SQL aggregate, not the returned rows', async () => {
      mockGet(mockDb, { client: { id: 1, name: 'Test Client' }, totals: { totalHours: 1000.5, entryCount: 400 } });
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, [{ id: 1, hours: 1 }]);
      });

      const response = await request(app).get('/api/reports/client/1');

      expect(response.body.totalHours).toBe(1000.5);
      expect(response.body.entryCount).toBe(400);
    });

    test('should return 404 if client not found', async () => {
      mockGet(mockDb, { client: null });

      const response = await request(app).get('/api/reports/client/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
    });

    test('should return 400 for invalid client ID', async () => {
      const response = await request(app).get('/api/reports/client/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
    });

    test('should handle database error when fetching client', async () => {
      mockGet(mockDb, { client: new Error('Database error') });

      const response = await request(app).get('/api/reports/client/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should handle database error when computing totals', async () => {
      mockGet(mockDb, { client: { id: 1, name: 'Test Client' }, totals: new Error('Database error') });

      const response = await request(app).get('/api/reports/client/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      expect(mockDb.all).not.toHaveBeenCalled();
    });

    test('should handle database error when fetching work entries', async () => {
      mockGet(mockDb, { client: { id: 1, name: 'Test Client' } });
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/reports/client/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should filter work entries and aggregate by client and user email', async () => {
      mockGet(mockDb, { client: { id: 1, name: 'Test Client' } });
      mockDb.all.mockImplementation((query, params, callback) => {
        expect(params).toEqual([1, 'test@example.com']);
        callback(null, []);
      });

      await request(app).get('/api/reports/client/1');

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringMatching(/COALESCE\(SUM\(hours\), 0\) AS totalHours, COUNT\(\*\) AS entryCount[\s\S]*WHERE client_id = \? AND user_email = \?/),
        [1, 'test@example.com'],
        expect.any(Function)
      );
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE client_id = ? AND user_email = ?'),
        [1, 'test@example.com'],
        expect.any(Function)
      );
    });
  });

  describe('GET /api/reports/export/csv/:clientId', () => {
    test('should return 400 for invalid client ID', async () => {
      const response = await request(app).get('/api/reports/export/csv/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
    });

    test('should return 404 if client not found', async () => {
      mockGet(mockDb, { client: null });

      const response = await request(app).get('/api/reports/export/csv/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
      expect(mockDb.each).not.toHaveBeenCalled();
    });

    test('should handle database error when fetching client', async () => {
      mockGet(mockDb, { client: new Error('Database error') });

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should return 500 JSON when the work entries query fails before streaming', async () => {
      mockGet(mockDb, { client: { id: 1, name: 'Test Client' } });
      mockEach(mockDb, new Error('Database error'));

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to generate CSV report' });
    });
  });

  describe('CSV Export Success Path', () => {
    test('should stream CSV with header row and one line per entry', async () => {
      mockGet(mockDb, { client: { id: 1, name: 'Test Client' } });
      mockEach(mockDb, [
        { date: '2024-01-02', hours: 5, description: 'Work 1', created_at: '2024-01-02 10:00:00' },
        { date: '2024-01-01', hours: 2.5, description: null, created_at: '2024-01-01 09:00:00' }
      ]);

      const response = await request(app).get('/api/reports/export/csv/1').buffer(true).parse((res, cb) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => cb(null, data));
      });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/^text\/csv/);
      expect(response.headers['content-disposition']).toMatch(/^attachment; filename="Test_Client_report_.*\.csv"$/);
      expect(response.body).toBe(
        'Date,Hours,Description,Created At\n' +
          '2024-01-02,5,Work 1,2024-01-02 10:00:00\n' +
          '2024-01-01,2.5,,2024-01-01 09:00:00\n'
      );
    });

    test('should quote fields containing commas, quotes or newlines', async () => {
      mockGet(mockDb, { client: { id: 1, name: 'Acme, Inc.' } });
      mockEach(mockDb, [
        { date: '2024-01-01', hours: 1, description: 'Said "hi", then\nleft', created_at: 'x' }
      ]);

      const response = await request(app).get('/api/reports/export/csv/1').buffer(true).parse((res, cb) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => cb(null, data));
      });

      expect(response.headers['content-disposition']).toContain('filename="Acme__Inc__report_');
      expect(response.body).toBe(
        'Date,Hours,Description,Created At\n' + '2024-01-01,1,"Said ""hi"", then\nleft",x\n'
      );
    });

    test('should send header-only CSV when the client has no entries', async () => {
      mockGet(mockDb, { client: { id: 1, name: 'Empty' } });
      mockEach(mockDb, []);

      const response = await request(app).get('/api/reports/export/csv/1').buffer(true).parse((res, cb) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => cb(null, data));
      });

      expect(response.status).toBe(200);
      expect(response.body).toBe('Date,Hours,Description,Created At\n');
    });

    test('should query work entries scoped by client and user email', async () => {
      mockGet(mockDb, { client: { id: 1, name: 'Test Client' } });
      mockEach(mockDb, []);

      await request(app).get('/api/reports/export/csv/1');

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, name FROM clients'),
        expect.arrayContaining([1, 'test@example.com']),
        expect.any(Function)
      );
      expect(mockDb.each).toHaveBeenCalledWith(
        expect.stringContaining('WHERE client_id = ? AND user_email = ?'),
        [1, 'test@example.com'],
        expect.any(Function),
        expect.any(Function)
      );
    });
  });

  describe('GET /api/reports/export/pdf/:clientId', () => {
    test('should return 400 for invalid client ID', async () => {
      const response = await request(app).get('/api/reports/export/pdf/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
    });

    test('should return 404 if client not found', async () => {
      mockGet(mockDb, { client: null });

      const response = await request(app).get('/api/reports/export/pdf/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
    });

    test('should handle database error', async () => {
      mockGet(mockDb, { client: new Error('Database error') });

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should handle database error when computing totals', async () => {
      mockGet(mockDb, { client: { id: 1, name: 'Test Client' }, totals: new Error('Database error') });

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('Data Isolation', () => {
    test('should only return data for authenticated user', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        expect(params).toContain('test@example.com');
        if (isClientLookup(query)) return callback(null, { id: 1, name: 'Test Client' });
        callback(null, { totalHours: 0, entryCount: 0 });
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        expect(params).toContain('test@example.com');
        callback(null, []);
      });

      await request(app).get('/api/reports/client/1');

      expect(mockDb.get).toHaveBeenCalledTimes(2);
      for (const call of mockDb.get.mock.calls) {
        expect(call[1]).toEqual(expect.arrayContaining(['test@example.com']));
      }
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['test@example.com']),
        expect.any(Function)
      );
    });
  });

  describe('PDF Export Success Path', () => {
    test('should handle database error when fetching work entries for PDF', async () => {
      mockGet(mockDb, { client: { id: 1, name: 'Test Client' } });
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should render totals from the SQL aggregate', async () => {
      const PDFDocument = require('pdfkit');
      mockGet(mockDb, { client: { id: 1, name: 'Test Client' }, totals: { totalHours: 12.5, entryCount: 3 } });
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, [{ date: '2024-01-01', hours: 12.5, description: 'x' }]);
      });

      await request(app).get('/api/reports/export/pdf/1');

      const doc = PDFDocument.mock.results[PDFDocument.mock.results.length - 1].value;
      expect(doc.text).toHaveBeenCalledWith('Total Hours: 12.50');
      expect(doc.text).toHaveBeenCalledWith('Total Entries: 3');
      expect(doc.pipe).toHaveBeenCalled();
      expect(doc.end).toHaveBeenCalled();
    });

    test('should verify PDF export calls correct database queries', async () => {
      mockGet(mockDb, { client: { id: 1, name: 'Test Client' } });
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      await request(app).get('/api/reports/export/pdf/1');

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, name FROM clients'),
        expect.arrayContaining([1, 'test@example.com']),
        expect.any(Function)
      );
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('COALESCE(SUM(hours), 0)'),
        [1, 'test@example.com'],
        expect.any(Function)
      );
    });
  });
});
