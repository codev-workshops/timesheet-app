const request = require('supertest');
const express = require('express');
const { getDatabase } = require('../../database/init');
const { createSequentialDb } = require('../helpers/sequentialDb');
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
    req.userEmail = 'test@example.com';
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


  describe('Invalid client ID guards', () => {
    test.each([
      ['/api/reports/client/abc'],
      ['/api/reports/export/csv/abc'],
      ['/api/reports/export/pdf/abc']
    ])('%s returns 400 without touching the database', async (url) => {
      const response = await request(app).get(url);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
      expect(getDatabase).not.toHaveBeenCalled();
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test.each([
      ['/api/reports/client/7'],
      ['/api/reports/export/csv/7'],
      ['/api/reports/export/pdf/7']
    ])('%s parses the numeric client ID', async (url) => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app).get(url);

      expect(response.status).toBe(404);
      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT id, name FROM clients WHERE id = ? AND user_email = ?',
        [7, 'test@example.com'],
        expect.any(Function)
      );
    });
  });

  describe('Report queries', () => {
    test.each([
      ['/api/reports/export/csv/1'],
      ['/api/reports/export/pdf/1']
    ])('%s fetches work entries scoped by client and user', async (url) => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Test Client' });
      });
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      await request(app).get(url);

      const [query, params] = mockDb.all.mock.calls[0];
      expect(query).toMatch(/SELECT hours, description, date, created_at\s+FROM work_entries\s+WHERE client_id = \? AND user_email = \?\s+ORDER BY date DESC/);
      expect(params).toEqual([1, 'test@example.com']);
    });

    test('client report fetches entries ordered by date', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Test Client' });
      });
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      await request(app).get('/api/reports/client/1');

      expect(mockDb.all.mock.calls[0][0]).toMatch(
        /SELECT id, hours, description, date, created_at, updated_at\s+FROM work_entries\s+WHERE client_id = \? AND user_email = \?\s+ORDER BY date DESC/
      );
    });
  });

  describe('CSV Export download and cleanup', () => {
    let downloadApp;
    let downloadError;
    let consoleErrorSpy;
    const csvWriter = require('csv-writer');
    const mockWorkEntries = [
      { date: '2024-01-01', hours: 5, description: 'Work 1', created_at: '2024-01-01' },
      { date: '2024-01-02', hours: 3, description: 'Work 2', created_at: '2024-01-02' }
    ];
    let writeRecords;

    beforeEach(() => {
      downloadError = null;
      downloadApp = express();
      downloadApp.use((req, res, next) => {
        res.download = jest.fn((filePath, filename, callback) => {
          res.status(200).json({ filePath, filename });
          callback(downloadError);
        });
        next();
      });
      downloadApp.use('/api/reports', reportRoutes);

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Acme Co.' });
      });
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, mockWorkEntries);
      });
      writeRecords = jest.fn().mockResolvedValue(undefined);
      csvWriter.createObjectCsvWriter.mockReturnValue({ writeRecords });
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    test('writes CSV to a sanitized temp file and downloads it', async () => {
      const response = await request(downloadApp).get('/api/reports/export/csv/1');

      expect(response.status).toBe(200);
      const { filePath, filename } = response.body;
      expect(filename).toMatch(/^Acme_Co__report_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.csv$/);
      expect(filePath).toBe(path.join(__dirname, '../../../temp', filename));

      expect(csvWriter.createObjectCsvWriter).toHaveBeenCalledWith({
        path: filePath,
        header: [
          { id: 'date', title: 'Date' },
          { id: 'hours', title: 'Hours' },
          { id: 'description', title: 'Description' },
          { id: 'created_at', title: 'Created At' }
        ]
      });
      expect(writeRecords).toHaveBeenCalledWith(mockWorkEntries);
      expect(fs.existsSync).toHaveBeenCalledWith(path.dirname(filePath));
    });

    test('deletes the temp file after a successful download', async () => {
      const response = await request(downloadApp).get('/api/reports/export/csv/1');

      expect(fs.unlink).toHaveBeenCalledTimes(1);
      expect(fs.unlink).toHaveBeenCalledWith(response.body.filePath, expect.any(Function));
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('creates the temp directory recursively when missing', async () => {
      fs.existsSync.mockReturnValue(false);

      const response = await request(downloadApp).get('/api/reports/export/csv/1');

      expect(fs.mkdirSync).toHaveBeenCalledWith(path.dirname(response.body.filePath), { recursive: true });
    });

    test('logs download errors and still deletes the temp file', async () => {
      downloadError = new Error('Client aborted');

      const response = await request(downloadApp).get('/api/reports/export/csv/1');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error sending file:', downloadError);
      expect(fs.unlink).toHaveBeenCalledWith(response.body.filePath, expect.any(Function));
    });

    test('logs temp-file cleanup errors', async () => {
      const unlinkError = new Error('EACCES');
      fs.unlink = jest.fn((filePath, callback) => callback(unlinkError));

      await request(downloadApp).get('/api/reports/export/csv/1');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error deleting temp file:', unlinkError);
    });

    test('logs CSV generation errors without downloading', async () => {
      const writeError = new Error('Write failed');
      writeRecords.mockRejectedValue(writeError);

      const response = await request(downloadApp).get('/api/reports/export/csv/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to generate CSV report' });
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error creating CSV:', writeError);
      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('PDF Export rendering', () => {
    const PDFDocument = require('pdfkit');

    function createPdfDocMock(y = 100) {
      let destination;
      return {
        y,
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        moveTo: jest.fn().mockReturnThis(),
        lineTo: jest.fn().mockReturnThis(),
        stroke: jest.fn().mockReturnThis(),
        addPage: jest.fn().mockReturnThis(),
        pipe: jest.fn((dest) => {
          destination = dest;
          return dest;
        }),
        end: jest.fn(() => destination.end())
      };
    }

    function buildEntries(count) {
      return Array.from({ length: count }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        hours: 1,
        description: `Task ${i + 1}`,
        created_at: '2024-01-01'
      }));
    }

    async function exportPdf(entries, doc) {
      PDFDocument.mockImplementationOnce(() => doc);
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Acme Co.' });
      });
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, entries);
      });
      return request(app).get('/api/reports/export/pdf/1');
    }

    test('streams a PDF with attachment headers', async () => {
      const doc = createPdfDocMock();

      const response = await exportPdf(buildEntries(1), doc);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toMatch(
        /^attachment; filename="Acme_Co__report_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.pdf"$/
      );
      expect(doc.pipe).toHaveBeenCalledTimes(1);
      expect(doc.end).toHaveBeenCalledTimes(1);
    });

    test('renders summary, table header and entry rows', async () => {
      const doc = createPdfDocMock(100);
      const entries = [
        { date: '2024-01-01', hours: 5.5, description: 'Work 1', created_at: '2024-01-01' },
        { date: '2024-01-02', hours: 3, description: null, created_at: '2024-01-02' }
      ];

      await exportPdf(entries, doc);

      expect(doc.fontSize.mock.calls).toEqual([[20], [14], [12]]);
      expect(doc.text.mock.calls).toEqual([
        ['Time Report for Acme Co.', { align: 'center' }],
        ['Total Hours: 8.50'],
        ['Total Entries: 2'],
        [expect.stringMatching(/^Generated: .+/)],
        ['Date', 50, 100, { width: 100 }],
        ['Hours', 150, 85, { width: 80 }],
        ['Description', 230, 85, { width: 300 }],
        ['2024-01-01', 50, 100, { width: 100 }],
        ['5.5', 150, 100, { width: 80 }],
        ['Work 1', 230, 100, { width: 300 }],
        ['2024-01-02', 50, 100, { width: 100 }],
        ['3', 150, 100, { width: 80 }],
        ['No description', 230, 100, { width: 300 }]
      ]);
      // title, summary, table header, header rule (0.5), then one per entry
      expect(doc.moveDown.mock.calls).toEqual([[], [], [], [0.5], [], []]);
      expect(doc.moveTo).toHaveBeenCalledWith(50, 100);
      expect(doc.lineTo).toHaveBeenCalledWith(550, 100);
    });

    test('adds a new page when the cursor is past the 700pt threshold', async () => {
      const doc = createPdfDocMock(701);

      await exportPdf(buildEntries(3), doc);

      expect(doc.addPage).toHaveBeenCalledTimes(3);
    });

    test('does not add a page when the cursor is exactly at 700pt', async () => {
      const doc = createPdfDocMock(700);

      await exportPdf(buildEntries(3), doc);

      expect(doc.addPage).not.toHaveBeenCalled();
    });

    test('adds a page only for entries rendered past the threshold', async () => {
      const doc = createPdfDocMock(100);
      doc.text.mockImplementation(function(value) {
        if (value === 'Task 2') {
          this.y = 750;
        }
        return this;
      });
      doc.addPage.mockImplementation(function() {
        this.y = 72;
        return this;
      });

      await exportPdf(buildEntries(3), doc);

      expect(doc.addPage).toHaveBeenCalledTimes(1);
      expect(doc.text).toHaveBeenCalledWith('2024-01-03', 50, 72, { width: 100 });
      expect(doc.text).toHaveBeenCalledWith('1', 150, 750, { width: 80 });
    });

    test.each([
      [4, 1],
      [5, 2],
      [9, 2],
      [10, 3]
    ])('with %i entries draws %i horizontal lines (header + every 5th entry)', async (count, lines) => {
      const doc = createPdfDocMock();

      await exportPdf(buildEntries(count), doc);

      expect(doc.moveTo).toHaveBeenCalledTimes(lines);
      expect(doc.lineTo).toHaveBeenCalledTimes(lines);
      expect(doc.stroke).toHaveBeenCalledTimes(lines);
      expect(doc.moveDown.mock.calls.filter((args) => args[0] === 0.5)).toHaveLength(lines);
    });

    test('draws the separator after the 5th entry, not before it', async () => {
      const doc = createPdfDocMock();
      const order = [];
      doc.text.mockImplementation(function(value) {
        order.push(value);
        return this;
      });
      doc.stroke.mockImplementation(function() {
        order.push('<separator>');
        return this;
      });

      await exportPdf(buildEntries(6), doc);

      const separators = order.reduce((acc, v, i) => (v === '<separator>' ? [...acc, i] : acc), []);
      expect(separators).toHaveLength(2);
      expect(order[separators[1] - 1]).toBe('Task 5');
      expect(order[separators[1] + 1]).toBe('2024-01-06');
    });
  });


  describe('Database contract and error logging', () => {
    const HEADERS = null;
    const cases = [
      {
        name: 'client logs and returns 500 when client lookup fails',
        method: 'get', url: '/api/reports/client/3', failAt: 1, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['get', 'SELECT id, name FROM clients WHERE id = ? AND user_email = ?', [3, 'test@example.com']]]
      },
      {
        name: 'client logs and returns 500 when entries query fails',
        method: 'get', url: '/api/reports/client/3', failAt: 2, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['get', 'SELECT id, name FROM clients WHERE id = ? AND user_email = ?', [3, 'test@example.com']], ['all', expect.stringMatching(/^SELECT id, hours, description, date, created_at, updated_at\s+FROM work_entries\s+WHERE client_id = \? AND user_email = \?\s+ORDER BY date DESC$/), [3, 'test@example.com']]]
      },
      {
        name: 'export/csv logs and returns 500 when client lookup fails',
        method: 'get', url: '/api/reports/export/csv/3', failAt: 1, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['get', 'SELECT id, name FROM clients WHERE id = ? AND user_email = ?', [3, 'test@example.com']]]
      },
      {
        name: 'export/csv logs and returns 500 when entries query fails',
        method: 'get', url: '/api/reports/export/csv/3', failAt: 2, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['get', 'SELECT id, name FROM clients WHERE id = ? AND user_email = ?', [3, 'test@example.com']], ['all', expect.stringMatching(/^SELECT hours, description, date, created_at\s+FROM work_entries\s+WHERE client_id = \? AND user_email = \?\s+ORDER BY date DESC$/), [3, 'test@example.com']]]
      },
      {
        name: 'export/pdf logs and returns 500 when client lookup fails',
        method: 'get', url: '/api/reports/export/pdf/3', failAt: 1, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['get', 'SELECT id, name FROM clients WHERE id = ? AND user_email = ?', [3, 'test@example.com']]]
      },
      {
        name: 'export/pdf logs and returns 500 when entries query fails',
        method: 'get', url: '/api/reports/export/pdf/3', failAt: 2, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['get', 'SELECT id, name FROM clients WHERE id = ? AND user_email = ?', [3, 'test@example.com']], ['all', expect.stringMatching(/^SELECT hours, description, date, created_at\s+FROM work_entries\s+WHERE client_id = \? AND user_email = \?\s+ORDER BY date DESC$/), [3, 'test@example.com']]]
      }
    ];

    let consoleErrorSpy;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    test.each(cases)('$name', async ({ method, url, body, failAt, rows, calls, status, error, log }) => {
      const dbError = new Error('Database error');
      const db = createSequentialDb({ failAt, error: dbError, rows });
      getDatabase.mockReturnValue(db);

      let req = request(app)[method](url);
      if (HEADERS) {
        req = req.set(HEADERS);
      }
      const response = await (body ? req.send(body) : req);

      expect(response.status).toBe(status);
      expect(response.body).toEqual({ error });
      expect(db.calls).toEqual(calls);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(log, dbError);
    });

  });
});
