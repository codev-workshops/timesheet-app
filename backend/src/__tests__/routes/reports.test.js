const request = require('supertest');
const express = require('express');
const { getDatabase } = require('../../database/init');
const fs = require('fs');
const path = require('path');
const csvWriter = require('csv-writer');
const PDFDocument = require('pdfkit');

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

    // clearAllMocks keeps implementations set via mockReturnValue, so restore
    // the default (successful) CSV writer for every test.
    csvWriter.createObjectCsvWriter.mockImplementation(() => ({
      writeRecords: jest.fn().mockResolvedValue(undefined)
    }));
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

  describe('CSV Export Download', () => {
    const mockClient = { id: 1, name: 'Acme Corp' };
    const mockWorkEntries = [
      { date: '2024-01-01', hours: 5, description: 'Work 1', created_at: '2024-01-01' }
    ];
    let downloadSpy;
    let consoleErrorSpy;

    // fs is auto-mocked for this suite, so stub res.download instead of streaming a real file.
    const mockDownload = (downloadErr) => {
      downloadSpy = jest.spyOn(app.response, 'download').mockImplementation(function (filePath, filename, callback) {
        this.status(200).send('csv-content');
        callback(downloadErr);
      });
    };

    beforeEach(() => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, mockClient));
      mockDb.all.mockImplementation((query, params, callback) => callback(null, mockWorkEntries));
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      downloadSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    test('should write work entries to a temp CSV, send it, and delete it', async () => {
      mockDownload(null);

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(200);
      expect(response.text).toBe('csv-content');

      const writerOptions = csvWriter.createObjectCsvWriter.mock.calls[0][0];
      expect(writerOptions.header.map(h => h.id)).toEqual(['date', 'hours', 'description', 'created_at']);
      expect(path.basename(writerOptions.path)).toMatch(/^Acme_Corp_report_.*\.csv$/);

      const writer = csvWriter.createObjectCsvWriter.mock.results[0].value;
      expect(writer.writeRecords).toHaveBeenCalledWith(mockWorkEntries);

      const [sentPath, sentName] = downloadSpy.mock.calls[0];
      expect(sentPath).toBe(writerOptions.path);
      expect(sentName).toBe(path.basename(writerOptions.path));
      expect(fs.unlink).toHaveBeenCalledWith(writerOptions.path, expect.any(Function));
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('should still delete the temp file when sending fails', async () => {
      const sendError = new Error('Send failed');
      mockDownload(sendError);

      await request(app).get('/api/reports/export/csv/1');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error sending file:', sendError);
      expect(fs.unlink).toHaveBeenCalledTimes(1);
    });

    test('should log when temp file cleanup fails', async () => {
      const unlinkError = new Error('Unlink failed');
      fs.unlink = jest.fn((filePath, callback) => callback(unlinkError));
      mockDownload(null);

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(200);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error deleting temp file:', unlinkError);
    });
  });

  describe('PDF Export Generation', () => {
    const mockClient = { id: 1, name: 'Acme Corp' };
    let doc;

    // Fake PDFKit document that records text calls and ends the piped response.
    const createMockDoc = (startY = 100) => {
      const mockDoc = {
        y: startY,
        texts: [],
        fontSize: jest.fn(() => mockDoc),
        text: jest.fn((value) => {
          mockDoc.texts.push(String(value));
          return mockDoc;
        }),
        moveDown: jest.fn(() => mockDoc),
        moveTo: jest.fn(() => mockDoc),
        lineTo: jest.fn(() => mockDoc),
        stroke: jest.fn(() => {
          mockDoc.texts.push('<separator>');
          return mockDoc;
        }),
        addPage: jest.fn(() => mockDoc),
        pipe: jest.fn((dest) => {
          mockDoc.dest = dest;
          return dest;
        }),
        end: jest.fn(() => mockDoc.dest.end('pdf-content'))
      };
      return mockDoc;
    };

    const givenWorkEntries = (entries) => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, mockClient));
      mockDb.all.mockImplementation((query, params, callback) => callback(null, entries));
    };

    beforeEach(() => {
      doc = createMockDoc();
      PDFDocument.mockImplementationOnce(() => doc);
    });

    test('should stream a PDF with totals and one row per work entry', async () => {
      givenWorkEntries([
        { date: '2024-01-02', hours: 2.5, description: 'Design', created_at: '2024-01-02' },
        { date: '2024-01-01', hours: 4, description: null, created_at: '2024-01-01' }
      ]);

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toMatch(/^attachment; filename="Acme_Corp_report_.*\.pdf"$/);
      expect(doc.pipe).toHaveBeenCalledTimes(1);
      expect(doc.end).toHaveBeenCalledTimes(1);
      expect(doc.texts).toEqual(expect.arrayContaining([
        'Time Report for Acme Corp',
        'Total Hours: 6.50',
        'Total Entries: 2',
        '2024-01-02', '2.5', 'Design',
        '2024-01-01', '4', 'No description'
      ]));
      expect(doc.addPage).not.toHaveBeenCalled();
    });

    test('should add a separator line after every 5 entries', async () => {
      const entries = Array.from({ length: 10 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`, hours: 1, description: `Task ${i + 1}`
      }));
      givenWorkEntries(entries);

      await request(app).get('/api/reports/export/pdf/1');

      // 1 header rule + 2 separators (after entries 5 and 10)
      expect(doc.stroke).toHaveBeenCalledTimes(3);
      const textBeforeSeparators = doc.texts
        .map((text, i) => (text === '<separator>' ? doc.texts[i - 1] : null))
        .filter(Boolean);
      expect(textBeforeSeparators).toEqual(['Description', 'Task 5', 'Task 10']);
      expect(doc.texts).toContain('Total Hours: 10.00');
    });

    test('should start a new page when the cursor passes the page bottom', async () => {
      doc = createMockDoc(701);
      givenWorkEntries([
        { date: '2024-01-01', hours: 1, description: 'Work 1' },
        { date: '2024-01-02', hours: 2, description: 'Work 2' }
      ]);

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(200);
      expect(doc.addPage).toHaveBeenCalledTimes(2);
    });

    test('should scope PDF work entries query to the authenticated user', async () => {
      givenWorkEntries([]);

      await request(app).get('/api/reports/export/pdf/1');

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE client_id = ? AND user_email = ?'),
        [1, 'test@example.com'],
        expect.any(Function)
      );
      expect(doc.texts).toContain('Total Entries: 0');
    });
  });
});
