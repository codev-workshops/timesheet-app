const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../../database/init');
const { createObjectCsvWriter } = require('csv-writer');
const PDFDocument = require('pdfkit');

jest.mock('../../database/init');
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = 'test@example.com';
    next();
  }
}));
jest.mock('csv-writer', () => ({
  createObjectCsvWriter: jest.fn()
}));
jest.mock('pdfkit', () => jest.fn());

const reportRoutes = require('../../routes/reports');

let downloadError = null;
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.download = jest.fn((filePath, filename, callback) => {
    res.status(200).json({ filePath, filename });
    callback(downloadError);
  });
  next();
});
app.use('/api/reports', reportRoutes);

const createPdfDoc = (startY = 100) => {
  const doc = {
    y: startY,
    texts: [],
    pages: 0,
    fontSize: jest.fn(() => doc),
    text: jest.fn((value) => {
      doc.texts.push(value);
      return doc;
    }),
    moveDown: jest.fn(() => doc),
    moveTo: jest.fn(() => doc),
    lineTo: jest.fn(() => doc),
    stroke: jest.fn(() => doc),
    addPage: jest.fn(() => {
      doc.pages += 1;
      return doc;
    }),
    pipe: jest.fn((res) => {
      doc.res = res;
    }),
    end: jest.fn(() => doc.res.end())
  };
  return doc;
};

const mockClientAndEntries = (mockDb, client, entries) => {
  mockDb.get.mockImplementation((query, params, callback) => callback(null, client));
  mockDb.all.mockImplementation((query, params, callback) => callback(null, entries));
};

describe('Report Routes - edge cases', () => {
  let mockDb;
  let writeRecords;
  let pdfDoc;

  beforeEach(() => {
    downloadError = null;
    mockDb = { get: jest.fn(), all: jest.fn() };
    getDatabase.mockReturnValue(mockDb);

    writeRecords = jest.fn().mockResolvedValue(undefined);
    createObjectCsvWriter.mockReturnValue({ writeRecords });

    pdfDoc = createPdfDoc();
    PDFDocument.mockImplementation(() => pdfDoc);

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'unlink').mockImplementation((filePath, callback) => callback(null));
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe.each([
    ['report', '/api/reports/client'],
    ['CSV export', '/api/reports/export/csv'],
    ['PDF export', '/api/reports/export/pdf']
  ])('%s client ID parsing', (label, basePath) => {
    test.each(['abc', 'NaN', '%20'])('rejects non-numeric client ID "%s" without touching the database', async (id) => {
      const response = await request(app).get(`${basePath}/${id}`);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
      expect(getDatabase).not.toHaveBeenCalled();
    });

    test.each([
      ['0', 0],
      ['-5', -5],
      ['12abc', 12],
      ['3.9', 3]
    ])('parses client ID "%s" as %d and returns 404 when no such client exists', async (id, parsed) => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

      const response = await request(app).get(`${basePath}/${id}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
      expect(mockDb.get.mock.calls[0][1]).toEqual([parsed]);
      expect(mockDb.all).not.toHaveBeenCalled();
    });

    test('scopes work entries to the authenticated user with a parameterized query', async () => {
      mockClientAndEntries(mockDb, { id: 7, name: 'Acme' }, []);

      await request(app).get(`${basePath}/7`);

      const [sql, params] = mockDb.all.mock.calls[0];
      expect(sql).toMatch(/WHERE client_id = \? AND user_email = \?/);
      expect(params).toEqual([7, 'test@example.com']);
    });
  });

  describe('GET /api/reports/client/:clientId', () => {
    test('sums hours stored as strings', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme' }, [
        { id: 1, hours: '2.5' },
        { id: 2, hours: '1.25' }
      ]);

      const response = await request(app).get('/api/reports/client/1');

      expect(response.status).toBe(200);
      expect(response.body.totalHours).toBe(3.75);
      expect(response.body.entryCount).toBe(2);
    });

    test('keeps floating point totals close to the exact sum', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme' }, [
        { id: 1, hours: 0.1 },
        { id: 2, hours: 0.2 },
        { id: 3, hours: 0.33 }
      ]);

      const response = await request(app).get('/api/reports/client/1');

      expect(response.body.totalHours).toBeCloseTo(0.63, 10);
    });

    test('handles a large number of entries', async () => {
      const entries = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, hours: 24 }));
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme' }, entries);

      const response = await request(app).get('/api/reports/client/1');

      expect(response.status).toBe(200);
      expect(response.body.entryCount).toBe(1000);
      expect(response.body.totalHours).toBe(24000);
    });

    test('returns the client exactly as stored, including special characters', async () => {
      const client = { id: 1, name: "O'Brien & Sons <Ltd> 日本" };
      mockClientAndEntries(mockDb, client, []);

      const response = await request(app).get('/api/reports/client/1');

      expect(response.body.client).toEqual(client);
      expect(response.body.totalHours).toBe(0);
    });
  });

  describe('GET /api/reports/export/csv/:clientId', () => {
    test('sanitizes special characters in the download filename', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme & Co./"Ltd"' }, []);

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(200);
      expect(response.body.filename).toMatch(/^Acme___Co___Ltd__report_[0-9T-]+Z\.csv$/);
    });

    test('replaces non-ASCII client names with underscores', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: '日本' }, []);

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.body.filename).toMatch(/^___report_.+\.csv$/);
    });

    test('writes the temp file to a unique path that ignores the client name', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: '../../etc/passwd' }, []);

      const first = await request(app).get('/api/reports/export/csv/1');
      const second = await request(app).get('/api/reports/export/csv/1');

      const tempDir = path.resolve(__dirname, '../../../temp');
      for (const { body } of [first, second]) {
        expect(path.dirname(body.filePath)).toBe(tempDir);
        expect(path.basename(body.filePath)).toMatch(/^[0-9a-f-]{36}\.csv$/);
      }
      expect(first.body.filePath).not.toBe(second.body.filePath);
    });

    test('writes an empty record set when the user has no entries', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme' }, []);

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(200);
      expect(writeRecords).toHaveBeenCalledWith([]);
      expect(createObjectCsvWriter.mock.calls[0][0].header.map((h) => h.id))
        .toEqual(['date', 'hours', 'description', 'created_at']);
    });

    test('deletes the temp file after a successful download', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme' }, []);

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(fs.unlink).toHaveBeenCalledWith(response.body.filePath, expect.any(Function));
    });

    test('still deletes the temp file when sending the download fails', async () => {
      downloadError = new Error('Client aborted');
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme' }, []);

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(console.error).toHaveBeenCalledWith('Error sending file:', downloadError);
      expect(fs.unlink).toHaveBeenCalledWith(response.body.filePath, expect.any(Function));
    });

    test('logs but tolerates a failure to delete the temp file', async () => {
      const unlinkError = new Error('EACCES');
      fs.unlink.mockImplementation((filePath, callback) => callback(unlinkError));
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme' }, []);

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(200);
      expect(console.error).toHaveBeenCalledWith('Error deleting temp file:', unlinkError);
    });

    test('does not attempt a download or cleanup when CSV writing fails', async () => {
      writeRecords.mockRejectedValue(new Error('Disk full'));
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme' }, []);

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to generate CSV report' });
      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/reports/export/pdf/:clientId', () => {
    test('sets PDF headers with a sanitized filename', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme "Quoted"; Inc' }, []);

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition'])
        .toMatch(/^attachment; filename="Acme__Quoted___Inc_report_[0-9T-]+Z\.pdf"$/);
    });

    test('renders zero totals for a client with no entries', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme' }, []);

      await request(app).get('/api/reports/export/pdf/1');

      expect(pdfDoc.texts).toContain('Total Hours: 0.00');
      expect(pdfDoc.texts).toContain('Total Entries: 0');
      expect(pdfDoc.end).toHaveBeenCalledTimes(1);
    });

    test('formats totals to two decimals and falls back for missing descriptions', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme' }, [
        { date: '2024-01-02', hours: 1.333, description: null },
        { date: '2024-01-01', hours: 2, description: '' }
      ]);

      await request(app).get('/api/reports/export/pdf/1');

      expect(pdfDoc.texts).toContain('Total Hours: 3.33');
      expect(pdfDoc.texts.filter((t) => t === 'No description')).toHaveLength(2);
      expect(pdfDoc.texts).toContain('1.333');
    });

    test('adds a separator line after every fifth entry', async () => {
      const entries = Array.from({ length: 10 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        hours: 1,
        description: `Entry ${i + 1}`
      }));
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme' }, entries);

      await request(app).get('/api/reports/export/pdf/1');

      // One line under the table header plus one per five entries
      expect(pdfDoc.stroke).toHaveBeenCalledTimes(3);
    });

    test('starts a new page when the cursor passes the bottom margin', async () => {
      pdfDoc = createPdfDoc(750);
      PDFDocument.mockImplementation(() => pdfDoc);
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme' }, [
        { date: '2024-01-01', hours: 1, description: 'a' },
        { date: '2024-01-02', hours: 2, description: 'b' }
      ]);

      await request(app).get('/api/reports/export/pdf/1');

      expect(pdfDoc.addPage).toHaveBeenCalledTimes(2);
    });

    test('does not add a page when entries fit', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme' }, [
        { date: '2024-01-01', hours: 1, description: 'a' }
      ]);

      await request(app).get('/api/reports/export/pdf/1');

      expect(pdfDoc.addPage).not.toHaveBeenCalled();
    });

    test('does not create a PDF when the client lookup fails', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(new Error('boom')));

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(500);
      expect(PDFDocument).not.toHaveBeenCalled();
    });
  });
});
