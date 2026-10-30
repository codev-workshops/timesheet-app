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
  describe('CSV Export - download and cleanup', () => {
    const mockClient = { id: 1, name: 'Acme Corp & Co.' };
    const mockWorkEntries = [
      { date: '2024-01-02', hours: 3, description: 'Work 2', created_at: '2024-01-02' },
      { date: '2024-01-01', hours: 5, description: 'Work 1', created_at: '2024-01-01' }
    ];
    let writeRecords;
    let downloadSpy;
    let consoleErrorSpy;

    const mockDownload = (downloadErr = null) => {
      downloadSpy = jest.spyOn(express.response, 'download')
        .mockImplementation(function (filePath, filename, callback) {
          this.status(200).send('csv-content');
          callback(downloadErr);
        });
    };

    beforeEach(() => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, mockClient));
      mockDb.all.mockImplementation((query, params, callback) => callback(null, mockWorkEntries));
      writeRecords = jest.fn().mockResolvedValue(undefined);
      require('csv-writer').createObjectCsvWriter.mockReturnValue({ writeRecords });
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      if (downloadSpy) downloadSpy.mockRestore();
      downloadSpy = undefined;
      consoleErrorSpy.mockRestore();
    });

    test('should write records to a temp CSV and download it with a sanitized filename', async () => {
      mockDownload();

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(200);
      expect(response.text).toBe('csv-content');

      const csvWriter = require('csv-writer');
      expect(csvWriter.createObjectCsvWriter).toHaveBeenCalledTimes(1);
      const writerConfig = csvWriter.createObjectCsvWriter.mock.calls[0][0];
      expect(writerConfig.header).toEqual([
        { id: 'date', title: 'Date' },
        { id: 'hours', title: 'Hours' },
        { id: 'description', title: 'Description' },
        { id: 'created_at', title: 'Created At' }
      ]);
      expect(writeRecords).toHaveBeenCalledWith(mockWorkEntries);

      const expectedTempDir = path.join(__dirname, '../../../temp');
      expect(path.dirname(writerConfig.path)).toBe(expectedTempDir);

      expect(downloadSpy).toHaveBeenCalledTimes(1);
      const [downloadPath, downloadName] = downloadSpy.mock.calls[0];
      expect(downloadPath).toBe(writerConfig.path);
      expect(downloadName).toBe(path.basename(writerConfig.path));
      expect(downloadName).toMatch(/^Acme_Corp___Co__report_[0-9TZ-]+\.csv$/);

      expect(fs.unlink).toHaveBeenCalledWith(writerConfig.path, expect.any(Function));
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('should scope CSV export queries to the authenticated user', async () => {
      mockDownload();

      await request(app).get('/api/reports/export/csv/1');

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE client_id = ? AND user_email = ?'),
        [1, 'test@example.com'],
        expect.any(Function)
      );
    });

    test('should log download error and still clean up temp file', async () => {
      const downloadErr = new Error('Client aborted');
      mockDownload(downloadErr);

      await request(app).get('/api/reports/export/csv/1');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error sending file:', downloadErr);
      expect(fs.unlink).toHaveBeenCalledWith(downloadSpy.mock.calls[0][0], expect.any(Function));
    });

    test('should log error when temp file cleanup fails', async () => {
      const unlinkErr = new Error('EACCES');
      fs.unlink = jest.fn((filePath, callback) => callback(unlinkErr));
      mockDownload();

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(200);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error deleting temp file:', unlinkErr);
      expect(consoleErrorSpy).not.toHaveBeenCalledWith('Error sending file:', expect.anything());
    });

    test('should not download or unlink when CSV write fails', async () => {
      writeRecords.mockRejectedValue(new Error('Disk full'));
      mockDownload();

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to generate CSV report' });
      expect(downloadSpy).not.toHaveBeenCalled();
      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('PDF Export - document generation', () => {
    const PDFDocument = require('pdfkit');
    let consoleErrorSpy;

    const createFakeDoc = (startY = 100) => {
      const doc = { y: startY, pageCount: 1 };
      doc.pipe = jest.fn((dest) => {
        doc.dest = dest;
        return dest;
      });
      doc.fontSize = jest.fn(() => doc);
      doc.text = jest.fn((str, x, y) => {
        if (typeof y === 'number') doc.y = y;
        doc.y += 15;
        return doc;
      });
      doc.moveDown = jest.fn((lines = 1) => {
        doc.y += 15 * lines;
        return doc;
      });
      doc.moveTo = jest.fn(() => doc);
      doc.lineTo = jest.fn(() => doc);
      doc.stroke = jest.fn(() => doc);
      doc.addPage = jest.fn(() => {
        doc.pageCount += 1;
        doc.y = 72;
        return doc;
      });
      doc.end = jest.fn(() => doc.dest.end('%PDF-fake'));
      return doc;
    };

    const makeEntries = (count) => Array.from({ length: count }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, '0')}`,
      hours: 1.5,
      description: `Task ${i + 1}`,
      created_at: '2024-01-01'
    }));

    const textCalls = (doc) => doc.text.mock.calls.map((call) => call[0]);

    let fakeDoc;

    const mockData = (client, entries) => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, client));
      mockDb.all.mockImplementation((query, params, callback) => callback(null, entries));
    };

    beforeEach(() => {
      fakeDoc = createFakeDoc();
      PDFDocument.mockImplementationOnce(() => fakeDoc);
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    test('should stream a PDF with correct headers and summary content', async () => {
      mockData({ id: 1, name: 'Acme Corp' }, [
        { date: '2024-01-02', hours: 2.25, description: 'Design', created_at: '2024-01-02' },
        { date: '2024-01-01', hours: 3, description: 'Build', created_at: '2024-01-01' }
      ]);

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition'])
        .toMatch(/^attachment; filename="Acme_Corp_report_[0-9TZ-]+\.pdf"$/);

      expect(fakeDoc.pipe).toHaveBeenCalledTimes(1);
      expect(fakeDoc.end).toHaveBeenCalledTimes(1);

      const texts = textCalls(fakeDoc);
      expect(texts).toContain('Time Report for Acme Corp');
      expect(texts).toContain('Total Hours: 5.25');
      expect(texts).toContain('Total Entries: 2');
      expect(texts).toEqual(expect.arrayContaining(['Date', 'Hours', 'Description']));
      expect(texts).toEqual(expect.arrayContaining(['2024-01-02', '2.25', 'Design', '2024-01-01', '3', 'Build']));
      expect(fakeDoc.fontSize).toHaveBeenCalledWith(20);
      expect(fakeDoc.addPage).not.toHaveBeenCalled();
      // Only the header separator line, fewer than 5 entries
      expect(fakeDoc.stroke).toHaveBeenCalledTimes(1);
    });

    test('should render an empty report when client has no entries', async () => {
      mockData({ id: 1, name: 'Empty' }, []);

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(200);
      const texts = textCalls(fakeDoc);
      expect(texts).toContain('Total Hours: 0.00');
      expect(texts).toContain('Total Entries: 0');
      expect(fakeDoc.end).toHaveBeenCalledTimes(1);
    });

    test('should use placeholder text for entries without description', async () => {
      mockData({ id: 1, name: 'Acme' }, [
        { date: '2024-01-01', hours: 1, description: null, created_at: '2024-01-01' }
      ]);

      await request(app).get('/api/reports/export/pdf/1');

      expect(textCalls(fakeDoc)).toContain('No description');
    });

    test('should add a separator line after every 5 entries', async () => {
      mockData({ id: 1, name: 'Acme' }, makeEntries(10));

      await request(app).get('/api/reports/export/pdf/1');

      // 1 header line + 2 separators (after entries 5 and 10)
      expect(fakeDoc.stroke).toHaveBeenCalledTimes(3);
      expect(fakeDoc.moveTo).toHaveBeenCalledTimes(3);
      expect(fakeDoc.lineTo).toHaveBeenCalledWith(550, expect.any(Number));
      expect(fakeDoc.moveDown).toHaveBeenCalledWith(0.5);
    });

    test('should not add separator for fewer than 5 entries', async () => {
      mockData({ id: 1, name: 'Acme' }, makeEntries(4));

      await request(app).get('/api/reports/export/pdf/1');

      expect(fakeDoc.stroke).toHaveBeenCalledTimes(1);
    });

    test('should add a new page when y position exceeds 700', async () => {
      mockData({ id: 1, name: 'Acme' }, makeEntries(30));

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(200);
      expect(fakeDoc.addPage).toHaveBeenCalled();
      expect(fakeDoc.end).toHaveBeenCalledTimes(1);
    });

    test('should render entry columns on the same row after a page break', async () => {
      fakeDoc = createFakeDoc(800);
      PDFDocument.mockReset();
      PDFDocument.mockImplementationOnce(() => fakeDoc);
      mockData({ id: 1, name: 'Acme' }, [
        { date: '2024-01-01', hours: 2, description: 'Overflow', created_at: '2024-01-01' }
      ]);

      await request(app).get('/api/reports/export/pdf/1');

      expect(fakeDoc.addPage).toHaveBeenCalledTimes(1);
      const rowY = (value) => fakeDoc.text.mock.calls.find((call) => call[0] === value)[2];
      expect(rowY('2024-01-01')).toBe(72);
      expect(rowY('2')).toBe(72);
      expect(rowY('Overflow')).toBe(72);
    });

    test('should not add a page when content fits', async () => {
      mockData({ id: 1, name: 'Acme' }, makeEntries(3));

      await request(app).get('/api/reports/export/pdf/1');

      expect(fakeDoc.addPage).not.toHaveBeenCalled();
    });

    test('should log database error when fetching client for PDF', async () => {
      const dbErr = new Error('Database error');
      mockDb.get.mockImplementation((query, params, callback) => callback(dbErr, null));

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(500);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Database error:', dbErr);
      expect(fakeDoc.pipe).not.toHaveBeenCalled();
    });

    test('should not create PDF when client is not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

      const response = await request(app).get('/api/reports/export/pdf/42');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
      expect(mockDb.all).not.toHaveBeenCalled();
      expect(fakeDoc.pipe).not.toHaveBeenCalled();
    });
  });
});
