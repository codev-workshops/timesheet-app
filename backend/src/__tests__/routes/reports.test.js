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

  describe('GET /api/reports/client/:clientId - tenant isolation and totals', () => {
    test('should return 404 and skip the work-entries query when the client belongs to another user', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, undefined));

      const response = await request(app).get('/api/reports/client/7');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
      expect(mockDb.get.mock.calls[0][1]).toEqual([7, 'test@example.com']);
      expect(mockDb.all).not.toHaveBeenCalled();
    });

    test('should not query work entries when the client lookup fails', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(new Error('Database error')));

      const response = await request(app).get('/api/reports/client/7');

      expect(response.status).toBe(500);
      expect(mockDb.all).not.toHaveBeenCalled();
    });

    test('should scope both queries to the user and sum hours stored as strings', async () => {
      const client = { id: 7, name: 'Acme' };
      const entries = [
        { id: 1, hours: '1.5', description: 'A', date: '2024-01-02' },
        { id: 2, hours: '2.25', description: 'B', date: '2024-01-01' }
      ];
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, client));
      mockDb.all.mockImplementationOnce((query, params, callback) => callback(null, entries));

      const response = await request(app).get('/api/reports/client/7');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ client, workEntries: entries, totalHours: 3.75, entryCount: 2 });
      expect(mockDb.get.mock.calls[0][1]).toEqual([7, 'test@example.com']);
      expect(mockDb.all.mock.calls[0][1]).toEqual([7, 'test@example.com']);
    });
  });

  describe('GET /api/reports/export/csv/:clientId - file generation', () => {
    const client = { id: 7, name: 'Acme Corp!' };
    const entries = [
      { date: '2024-01-02', hours: 2, description: 'Design', created_at: '2024-01-02 10:00:00' },
      { date: '2024-01-01', hours: 3.5, description: null, created_at: '2024-01-01 09:00:00' }
    ];
    let csvWriter;
    let writeRecords;
    let downloadSpy;
    let consoleErrorSpy;

    beforeEach(() => {
      csvWriter = require('csv-writer');
      writeRecords = jest.fn().mockResolvedValue(undefined);
      csvWriter.createObjectCsvWriter.mockReturnValue({ writeRecords });
      downloadSpy = jest.spyOn(express.response, 'download').mockImplementation(function(filePath, filename, callback) {
        this.status(200).send('csv-body');
        callback(null);
      });
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      downloadSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    function mockClientWithEntries(rows) {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, client));
      mockDb.all.mockImplementationOnce((query, params, callback) => callback(null, rows));
    }

    test('should write the work entries to a CSV file, send it and delete it', async () => {
      mockClientWithEntries(entries);

      const response = await request(app).get('/api/reports/export/csv/7');

      expect(response.status).toBe(200);
      expect(response.text).toBe('csv-body');
      expect(mockDb.get.mock.calls[0][1]).toEqual([7, 'test@example.com']);
      expect(mockDb.all.mock.calls[0][1]).toEqual([7, 'test@example.com']);

      const writerConfig = csvWriter.createObjectCsvWriter.mock.calls[0][0];
      expect(path.basename(writerConfig.path)).toMatch(/^Acme_Corp__report_.+\.csv$/);
      expect(writerConfig.header).toEqual([
        { id: 'date', title: 'Date' },
        { id: 'hours', title: 'Hours' },
        { id: 'description', title: 'Description' },
        { id: 'created_at', title: 'Created At' }
      ]);
      expect(writeRecords).toHaveBeenCalledWith(entries);

      const [downloadPath, downloadName] = downloadSpy.mock.calls[0];
      expect(downloadPath).toBe(writerConfig.path);
      expect(downloadName).toBe(path.basename(writerConfig.path));
      expect(fs.unlink).toHaveBeenCalledWith(writerConfig.path, expect.any(Function));
    });

    test('should send a CSV with only headers for a client with no work entries', async () => {
      mockClientWithEntries([]);

      const response = await request(app).get('/api/reports/export/csv/7');

      expect(response.status).toBe(200);
      const writerConfig = csvWriter.createObjectCsvWriter.mock.calls[0][0];
      expect(writerConfig.header.map(column => column.title)).toEqual(['Date', 'Hours', 'Description', 'Created At']);
      expect(writeRecords).toHaveBeenCalledWith([]);
      expect(downloadSpy).toHaveBeenCalledWith(writerConfig.path, path.basename(writerConfig.path), expect.any(Function));
    });

    test('should log a send failure and still delete the temp file', async () => {
      downloadSpy.mockImplementation(function(filePath, filename, callback) {
        this.status(200).end();
        callback(new Error('socket closed'));
      });
      mockClientWithEntries(entries);

      await request(app).get('/api/reports/export/csv/7');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error sending file:', expect.any(Error));
      expect(fs.unlink).toHaveBeenCalledTimes(1);
    });

    test('should log a temp file deletion failure', async () => {
      fs.unlink = jest.fn((filePath, callback) => callback(new Error('EACCES')));
      mockClientWithEntries(entries);

      const response = await request(app).get('/api/reports/export/csv/7');

      expect(response.status).toBe(200);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error deleting temp file:', expect.any(Error));
    });

    test('should return 500 and not send a file when writing the CSV fails', async () => {
      writeRecords.mockRejectedValue(new Error('disk full'));
      mockClientWithEntries(entries);

      const response = await request(app).get('/api/reports/export/csv/7');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to generate CSV report' });
      expect(downloadSpy).not.toHaveBeenCalled();
    });

    test('should return 404 without creating a file when the client belongs to another user', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, undefined));

      const response = await request(app).get('/api/reports/export/csv/7');

      expect(response.status).toBe(404);
      expect(mockDb.get.mock.calls[0][1]).toEqual([7, 'test@example.com']);
      expect(mockDb.all).not.toHaveBeenCalled();
      expect(csvWriter.createObjectCsvWriter).not.toHaveBeenCalled();
    });

    test('should not create a file when the work-entries query fails', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, client));
      mockDb.all.mockImplementationOnce((query, params, callback) => callback(new Error('Database error')));

      const response = await request(app).get('/api/reports/export/csv/7');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      expect(csvWriter.createObjectCsvWriter).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/reports/export/pdf/:clientId - document generation', () => {
    const PDFDocument = require('pdfkit');
    const client = { id: 7, name: 'Acme Corp!' };
    let doc;

    beforeEach(() => {
      let destination;
      doc = {
        fontSize: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        moveTo: jest.fn().mockReturnThis(),
        lineTo: jest.fn().mockReturnThis(),
        stroke: jest.fn().mockReturnThis(),
        addPage: jest.fn().mockReturnThis(),
        pipe: jest.fn((stream) => { destination = stream; }),
        end: jest.fn(() => destination.end()),
        y: 100
      };
      PDFDocument.mockImplementation(() => doc);
    });

    function mockClientWithEntries(rows) {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, client));
      mockDb.all.mockImplementationOnce((query, params, callback) => callback(null, rows));
    }

    function entriesOf(count) {
      return Array.from({ length: count }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        hours: 1,
        description: `Task ${i + 1}`
      }));
    }

    test('should stream a PDF with the report totals and entries', async () => {
      mockClientWithEntries([
        { date: '2024-01-02', hours: 5.5, description: 'Design' },
        { date: '2024-01-01', hours: 3, description: null }
      ]);

      const response = await request(app).get('/api/reports/export/pdf/7');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toMatch(/^attachment; filename="Acme_Corp__report_.+\.pdf"$/);
      expect(doc.pipe).toHaveBeenCalledTimes(1);
      expect(doc.end).toHaveBeenCalledTimes(1);
      expect(doc.text).toHaveBeenCalledWith('Time Report for Acme Corp!', { align: 'center' });
      expect(doc.text).toHaveBeenCalledWith('Total Hours: 8.50');
      expect(doc.text).toHaveBeenCalledWith('Total Entries: 2');
      expect(doc.text).toHaveBeenCalledWith('2024-01-02', 50, 100, { width: 100 });
      expect(doc.text).toHaveBeenCalledWith('5.5', 150, 100, { width: 80 });
      expect(doc.text).toHaveBeenCalledWith('Design', 230, 100, { width: 300 });
      expect(doc.text).toHaveBeenCalledWith('No description', 230, 100, { width: 300 });
      expect(mockDb.get.mock.calls[0][1]).toEqual([7, 'test@example.com']);
      expect(mockDb.all.mock.calls[0][1]).toEqual([7, 'test@example.com']);
    });

    test('should produce a PDF with zero totals for a client with no work entries', async () => {
      mockClientWithEntries([]);

      const response = await request(app).get('/api/reports/export/pdf/7');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(doc.text).toHaveBeenCalledWith('Total Hours: 0.00');
      expect(doc.text).toHaveBeenCalledWith('Total Entries: 0');
      expect(doc.end).toHaveBeenCalledTimes(1);
    });

    test.each([
      [4, 1],
      [5, 2],
      [10, 3]
    ])('should draw a separator after every 5 entries (%i entries -> %i lines)', async (count, lines) => {
      mockClientWithEntries(entriesOf(count));

      await request(app).get('/api/reports/export/pdf/7');

      expect(doc.moveTo).toHaveBeenCalledTimes(lines);
      expect(doc.stroke).toHaveBeenCalledTimes(lines);
    });

    test('should add a new page when the cursor is past the bottom of the page', async () => {
      doc.y = 750;
      doc.addPage.mockImplementation(() => {
        doc.y = 50;
        return doc;
      });
      const [entry] = entriesOf(1);
      mockClientWithEntries([entry]);

      const response = await request(app).get('/api/reports/export/pdf/7');

      expect(response.status).toBe(200);
      expect(doc.addPage).toHaveBeenCalledTimes(1);
      expect(doc.text).toHaveBeenCalledWith(entry.date, 50, 50, { width: 100 });
    });

    test('should not add a page while there is room on the current page', async () => {
      mockClientWithEntries(entriesOf(2));

      await request(app).get('/api/reports/export/pdf/7');

      expect(doc.addPage).not.toHaveBeenCalled();
    });

    test('should return 404 without creating a document when the client belongs to another user', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, undefined));

      const response = await request(app).get('/api/reports/export/pdf/7');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
      expect(mockDb.get.mock.calls[0][1]).toEqual([7, 'test@example.com']);
      expect(mockDb.all).not.toHaveBeenCalled();
      expect(PDFDocument).not.toHaveBeenCalled();
    });

    test('should not create a document when the work-entries query fails', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, client));
      mockDb.all.mockImplementationOnce((query, params, callback) => callback(new Error('Database error')));

      const response = await request(app).get('/api/reports/export/pdf/7');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      expect(PDFDocument).not.toHaveBeenCalled();
    });

    test('should not query work entries when the client lookup fails', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(new Error('Database error')));

      const response = await request(app).get('/api/reports/export/pdf/7');

      expect(response.status).toBe(500);
      expect(mockDb.all).not.toHaveBeenCalled();
      expect(PDFDocument).not.toHaveBeenCalled();
    });
  });
});
