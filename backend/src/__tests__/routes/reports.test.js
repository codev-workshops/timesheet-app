const request = require('supertest');
const express = require('express');
const { getDatabase } = require('../../database/init');
const fs = require('fs');
const path = require('path');

jest.mock('../../database/init');
jest.mock('fs');
jest.mock('csv-writer', () => ({
  createObjectCsvWriter: jest.fn(() => ({
    writeRecords: jest.fn().mockResolvedValue(undefined)
  }))
}));
jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => ({
    fontSize: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    moveDown: jest.fn().mockReturnThis(),
    moveTo: jest.fn().mockReturnThis(),
    lineTo: jest.fn().mockReturnThis(),
    stroke: jest.fn().mockReturnThis(),
    addPage: jest.fn().mockReturnThis(),
    pipe: jest.fn(),
    end: jest.fn(),
    y: 100
  }));
});

const reportRoutes = require('../../routes/reports');
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = req.headers['x-test-user'] || 'test@example.com';
    next();
  }
}));

const app = express();
app.use(express.json());
app.use('/api/reports', reportRoutes);

describe('Report Routes', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      all: jest.fn(),
      get: jest.fn()
    };
    getDatabase.mockReturnValue(mockDb);
    
    // Mock fs methods
    fs.existsSync = jest.fn().mockReturnValue(true);
    fs.mkdirSync = jest.fn();
    fs.unlink = jest.fn((path, callback) => callback(null));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/reports/client/:clientId', () => {
    test('should return client report with work entries', async () => {
      const mockClient = { id: 1, name: 'Test Client' };
      const mockWorkEntries = [
        { id: 1, hours: 5.5, description: 'Work 1', date: '2024-01-01' },
        { id: 2, hours: 3.0, description: 'Work 2', date: '2024-01-02' }
      ];

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, mockClient);
      });

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
      const mockClient = { id: 1, name: 'Empty Client' };

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, mockClient);
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      const response = await request(app).get('/api/reports/client/1');

      expect(response.status).toBe(200);
      expect(response.body.totalHours).toBe(0);
      expect(response.body.entryCount).toBe(0);
    });

    test('should return 404 if client not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

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
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/reports/client/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should handle database error when fetching work entries', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Test Client' });
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/reports/client/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should filter work entries by user email', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Test Client' });
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        expect(params).toEqual([1, 'test@example.com']);
        callback(null, []);
      });

      await request(app).get('/api/reports/client/1');

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
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app).get('/api/reports/export/csv/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
    });

    test('should handle database error when fetching client', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should handle database error when fetching work entries', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Test Client' });
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('GET /api/reports/export/pdf/:clientId', () => {
    test('should return 400 for invalid client ID', async () => {
      const response = await request(app).get('/api/reports/export/pdf/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
    });

    test('should return 404 if client not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app).get('/api/reports/export/pdf/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
    });

    test('should handle database error', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('Data Isolation', () => {
    test('should only return data for authenticated user', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        expect(params).toContain('test@example.com');
        callback(null, { id: 1, name: 'Test Client' });
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        expect(params).toContain('test@example.com');
        callback(null, []);
      });

      await request(app).get('/api/reports/client/1');

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['test@example.com']),
        expect.any(Function)
      );
    });
  });

  describe('Hours Calculation', () => {
    test('should correctly sum decimal hours', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Test Client' });
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, [
          { hours: 2.5 },
          { hours: 3.75 },
          { hours: 1.25 }
        ]);
      });

      const response = await request(app).get('/api/reports/client/1');

      expect(response.body.totalHours).toBe(7.5);
    });

    test('should handle integer hours', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Test Client' });
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, [
          { hours: 8 },
          { hours: 4 }
        ]);
      });

      const response = await request(app).get('/api/reports/client/1');

      expect(response.body.totalHours).toBe(12);
    });
  });

  describe('CSV Export Success Path', () => {
    test('should handle CSV write error', async () => {
      const mockClient = { id: 1, name: 'Test Client' };
      const mockWorkEntries = [
        { date: '2024-01-01', hours: 5, description: 'Work 1', created_at: '2024-01-01' }
      ];

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, mockClient);
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, mockWorkEntries);
      });

      const csvWriter = require('csv-writer');
      csvWriter.createObjectCsvWriter.mockReturnValue({
        writeRecords: jest.fn().mockRejectedValue(new Error('Write failed'))
      });

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to generate CSV report' });
    });

    test('should verify CSV export calls correct database queries', async () => {
      const mockClient = { id: 1, name: 'Test Client' };

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, mockClient);
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      const csvWriter = require('csv-writer');
      csvWriter.createObjectCsvWriter.mockReturnValue({
        writeRecords: jest.fn().mockRejectedValue(new Error('Write failed'))
      });

      await request(app).get('/api/reports/export/csv/1');

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, name FROM clients'),
        expect.arrayContaining([1, 'test@example.com']),
        expect.any(Function)
      );
    });

    test('should create temp directory if it does not exist', async () => {
      const mockClient = { id: 1, name: 'Test Client' };
      const mockWorkEntries = [
        { date: '2024-01-01', hours: 5, description: 'Work 1', created_at: '2024-01-01' }
      ];

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, mockClient);
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, mockWorkEntries);
      });

      fs.existsSync.mockReturnValue(false);

      const csvWriter = require('csv-writer');
      csvWriter.createObjectCsvWriter.mockReturnValue({
        writeRecords: jest.fn().mockRejectedValue(new Error('Write failed'))
      });

      await request(app).get('/api/reports/export/csv/1');

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    test('should not create temp directory if it exists', async () => {
      const mockClient = { id: 1, name: 'Test Client' };
      const mockWorkEntries = [];

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, mockClient);
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, mockWorkEntries);
      });

      fs.existsSync.mockReturnValue(true);

      const csvWriter = require('csv-writer');
      csvWriter.createObjectCsvWriter.mockReturnValue({
        writeRecords: jest.fn().mockRejectedValue(new Error('Write failed'))
      });

      await request(app).get('/api/reports/export/csv/1');

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });


  describe('PDF Export Success Path', () => {
    test('should handle database error when fetching work entries for PDF', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Test Client' });
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should verify PDF export calls correct database queries', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Test Client' });
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      await request(app).get('/api/reports/export/pdf/1');

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, name FROM clients'),
        expect.arrayContaining([1, 'test@example.com']),
        expect.any(Function)
      );
    });
  });

  describe('Per-user isolation across two users', () => {
    const clientsTable = [
      { id: 1, name: 'Alice Client', user_email: 'alice@example.com' },
      { id: 2, name: 'Bob Client', user_email: 'bob@example.com' }
    ];
    const entriesTable = [
      { id: 10, client_id: 1, user_email: 'alice@example.com', hours: 4, description: 'A', date: '2024-01-01' },
      { id: 11, client_id: 2, user_email: 'bob@example.com', hours: 6, description: 'B', date: '2024-01-02' }
    ];

    beforeEach(() => {
      mockDb.get.mockImplementation((query, [id, email], callback) => {
        const row = clientsTable.find(c => c.id === id && c.user_email === email);
        callback(null, row ? { id: row.id, name: row.name } : undefined);
      });
      mockDb.all.mockImplementation((query, [clientId, email], callback) => {
        callback(null, entriesTable
          .filter(e => e.client_id === clientId && e.user_email === email)
          .map(({ id, hours, description, date }) => ({ id, hours, description, date })));
      });
    });

    test('owner sees only their own client report', async () => {
      const response = await request(app)
        .get('/api/reports/client/1')
        .set('x-test-user', 'alice@example.com');

      expect(response.status).toBe(200);
      expect(response.body.client).toEqual({ id: 1, name: 'Alice Client' });
      expect(response.body.totalHours).toBe(4);
      expect(response.body.entryCount).toBe(1);
    });

    test.each(['client', 'export/csv', 'export/pdf'])(
      'GET /api/reports/%s/:id returns 404 for another user\'s client',
      async (route) => {
        const response = await request(app)
          .get(`/api/reports/${route}/1`)
          .set('x-test-user', 'bob@example.com');

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'Client not found' });
        expect(mockDb.get).toHaveBeenCalledWith(
          expect.stringContaining('user_email = ?'),
          [1, 'bob@example.com'],
          expect.any(Function)
        );
        expect(mockDb.all).not.toHaveBeenCalled();
      }
    );
  });

  describe('sumHours helper via client report', () => {
    test('parses string hours as floats', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Test Client' });
      });
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, [{ hours: '2.5' }, { hours: '1.25' }]);
      });

      const response = await request(app).get('/api/reports/client/1');

      expect(response.status).toBe(200);
      expect(response.body.totalHours).toBe(3.75);
    });
  });

  describe('CSV export download', () => {
    const csvWriter = require('csv-writer');
    let downloadSpy;
    let consoleErrorSpy;

    beforeEach(() => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Acme Co. & Sons' });
      });
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, [{ date: '2024-01-01', hours: 5, description: 'Work', created_at: '2024-01-01' }]);
      });
      csvWriter.createObjectCsvWriter.mockReturnValue({
        writeRecords: jest.fn().mockResolvedValue(undefined)
      });
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      downloadSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    function mockDownload(downloadErr) {
      downloadSpy = jest.spyOn(express.response, 'download')
        .mockImplementation(function (filePath, filename, callback) {
          this.attachment(filename);
          this.status(200).send('csv-content');
          callback(downloadErr);
        });
    }

    test('writes records with sanitized filename, sends file and deletes temp file', async () => {
      mockDownload(null);

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(200);
      expect(response.text).toBe('csv-content');

      const [tempPath, filename] = downloadSpy.mock.calls[0];
      expect(filename).toMatch(/^Acme_Co____Sons_report_[0-9T-]+Z\.csv$/);
      expect(path.basename(tempPath)).toBe(filename);
      expect(response.headers['content-disposition']).toContain(filename);

      const writerConfig = csvWriter.createObjectCsvWriter.mock.calls[0][0];
      expect(writerConfig.path).toBe(tempPath);
      expect(writerConfig.header.map(h => h.id)).toEqual(['date', 'hours', 'description', 'created_at']);
      const writer = csvWriter.createObjectCsvWriter.mock.results[0].value;
      expect(writer.writeRecords).toHaveBeenCalledWith([
        { date: '2024-01-01', hours: 5, description: 'Work', created_at: '2024-01-01' }
      ]);

      expect(fs.unlink).toHaveBeenCalledWith(tempPath, expect.any(Function));
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('logs send and unlink errors but still attempts cleanup', async () => {
      mockDownload(new Error('send failed'));
      fs.unlink = jest.fn((p, callback) => callback(new Error('unlink failed')));

      await request(app).get('/api/reports/export/csv/1');

      expect(fs.unlink).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error sending file:', expect.any(Error));
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error deleting temp file:', expect.any(Error));
    });
  });

  describe('PDF export generation', () => {
    const PDFDocument = require('pdfkit');

    function makeDoc(y) {
      const doc = {
        y,
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        moveTo: jest.fn().mockReturnThis(),
        lineTo: jest.fn().mockReturnThis(),
        stroke: jest.fn().mockReturnThis(),
        addPage: jest.fn().mockReturnThis(),
        pipe: jest.fn((stream) => { doc.stream = stream; }),
        end: jest.fn(() => doc.stream.end('%PDF-mock'))
      };
      PDFDocument.mockImplementationOnce(() => doc);
      return doc;
    }

    function mockData(clientName, entries) {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: clientName });
      });
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, entries);
      });
    }

    test('streams PDF with headers, totals and entries', async () => {
      const doc = makeDoc(100);
      mockData('Acme Co.', [
        { date: '2024-01-02', hours: 2.5, description: 'Design' },
        { date: '2024-01-01', hours: '1.25', description: null }
      ]);

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition'])
        .toMatch(/^attachment; filename="Acme_Co__report_[0-9T-]+Z\.pdf"$/);

      const texts = doc.text.mock.calls.map(c => c[0]);
      expect(texts).toContain('Time Report for Acme Co.');
      expect(texts).toContain('Total Hours: 3.75');
      expect(texts).toContain('Total Entries: 2');
      expect(texts).toContain('Design');
      expect(texts).toContain('No description');
      expect(texts).toContain('1.25');
      expect(doc.addPage).not.toHaveBeenCalled();
      expect(doc.end).toHaveBeenCalledTimes(1);
    });

    test('adds a separator line after every 5 entries', async () => {
      const doc = makeDoc(100);
      const entries = Array.from({ length: 5 }, (_, i) => ({
        date: `2024-01-0${i + 1}`, hours: 1, description: `Task ${i}`
      }));
      mockData('Client', entries);

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(200);
      // one header line + one separator after the 5th entry
      expect(doc.stroke).toHaveBeenCalledTimes(2);
      expect(doc.text.mock.calls.map(c => c[0])).toContain('Total Hours: 5.00');
    });

    test('adds a new page when content passes the page bottom', async () => {
      const doc = makeDoc(750);
      mockData('Client', [{ date: '2024-01-01', hours: 8, description: 'Long day' }]);

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(200);
      expect(doc.addPage).toHaveBeenCalledTimes(1);
    });

    test('generates PDF with zero totals for a client with no entries', async () => {
      const doc = makeDoc(100);
      mockData('Empty', []);

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(200);
      const texts = doc.text.mock.calls.map(c => c[0]);
      expect(texts).toContain('Total Hours: 0.00');
      expect(texts).toContain('Total Entries: 0');
    });
  });
});
