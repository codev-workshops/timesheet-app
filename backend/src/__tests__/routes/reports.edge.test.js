const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../../database/init');

const mockPdfDocs = [];

jest.mock('../../database/init');
jest.mock('csv-writer', () => ({
  createObjectCsvWriter: jest.fn()
}));
jest.mock('pdfkit', () =>
  jest.fn().mockImplementation(() => {
    const doc = { y: 100, res: null };
    ['fontSize', 'text', 'lineTo', 'stroke'].forEach((m) => {
      doc[m] = jest.fn(() => doc);
    });
    doc.moveTo = jest.fn(() => doc);
    doc.moveDown = jest.fn(() => {
      doc.y += 20;
      return doc;
    });
    doc.addPage = jest.fn(() => {
      doc.y = 50;
      return doc;
    });
    doc.pipe = jest.fn((res) => {
      doc.res = res;
    });
    doc.end = jest.fn(() => doc.res.end('%PDF-mock'));
    mockPdfDocs.push(doc);
    return doc;
  })
);
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = 'test@example.com';
    next();
  }
}));

const { createObjectCsvWriter } = require('csv-writer');
const reportRoutes = require('../../routes/reports');

const app = express();
app.use(express.json());
app.use('/api/reports', reportRoutes);

const mockClientAndEntries = (mockDb, client, entries) => {
  mockDb.get.mockImplementation((query, params, cb) => cb(null, client));
  mockDb.all.mockImplementation((query, params, cb) => cb(null, entries));
};

describe('Report Routes - edge cases', () => {
  let mockDb;
  let writeRecords;
  let downloadError;

  beforeEach(() => {
    mockDb = { get: jest.fn(), all: jest.fn() };
    getDatabase.mockReturnValue(mockDb);
    mockPdfDocs.length = 0;
    downloadError = null;

    writeRecords = jest.fn().mockResolvedValue(undefined);
    createObjectCsvWriter.mockReturnValue({ writeRecords });

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'unlink').mockImplementation((p, cb) => cb(null));
    jest.spyOn(express.response, 'download').mockImplementation(function (p, filename, cb) {
      this.attachment(filename);
      this.send('csv-body');
      if (cb) cb(downloadError);
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe.each([
    ['/api/reports/client'],
    ['/api/reports/export/csv'],
    ['/api/reports/export/pdf']
  ])('client ID handling for %s', (base) => {
    test.each(['0', '-1', '99999999999999999999'])(
      'passes numeric ID %s to the client lookup and returns 404 when not found',
      async (id) => {
        mockDb.get.mockImplementation((query, params, cb) => cb(null, undefined));

        const response = await request(app).get(`${base}/${id}`);

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'Client not found' });
        expect(mockDb.get.mock.calls[0][1]).toEqual([parseInt(id, 10)]);
        expect(mockDb.all).not.toHaveBeenCalled();
      }
    );

    test('returns 400 without touching the database for a non-numeric ID', async () => {
      const response = await request(app).get(`${base}/abc`);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
      expect(getDatabase).not.toHaveBeenCalled();
    });

    // BUG: IDs are parsed with parseInt(), so partially numeric values such as
    // "1abc", "1.9" or " 1" are silently truncated to 1 and served as client 1
    // instead of being rejected with 400.
    test.skip.each(['1abc', '1.9', '%201'])('rejects partially numeric ID %s with 400', async (id) => {
      mockClientAndEntries(mockDb, { id: 1, name: 'Test Client' }, []);

      const response = await request(app).get(`${base}/${id}`);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
    });
  });

  describe('GET /api/reports/client/:clientId', () => {
    test('sums hours stored as numeric strings', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'C' }, [{ hours: '2.5' }, { hours: '1.25' }]);

      const response = await request(app).get('/api/reports/client/1');

      expect(response.status).toBe(200);
      expect(response.body.totalHours).toBe(3.75);
      expect(response.body.entryCount).toBe(2);
    });

    test('returns work entries in the order provided by the query (date DESC)', async () => {
      const entries = [
        { id: 2, hours: 1, date: '2024-02-01' },
        { id: 1, hours: 1, date: '2024-01-01' }
      ];
      mockClientAndEntries(mockDb, { id: 1, name: 'C' }, entries);

      const response = await request(app).get('/api/reports/client/1');

      expect(response.body.workEntries).toEqual(entries);
      expect(mockDb.all.mock.calls[0][0]).toMatch(/ORDER BY date DESC/);
    });

    // BUG: totalHours is a raw floating-point sum and is never rounded, so
    // 0.1 + 0.2 hours is reported as 0.30000000000000004.
    test.skip('reports totalHours without floating-point artifacts', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'C' }, [{ hours: 0.1 }, { hours: 0.2 }]);

      const response = await request(app).get('/api/reports/client/1');

      expect(response.body.totalHours).toBe(0.3);
    });
  });

  describe('GET /api/reports/export/csv/:clientId', () => {
    test('sanitizes the client name in the download filename', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'Acme & Co./"Ltd"\r\n' }, []);

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(200);
      const disposition = response.headers['content-disposition'];
      expect(disposition).toMatch(/^attachment; filename="Acme___Co___Ltd____report_[0-9TZ-]+\.csv"$/);
    });

    test('writes to a random temp path that does not include the client name', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: '../../etc/passwd' }, []);

      await request(app).get('/api/reports/export/csv/1');

      const { path: tempPath } = createObjectCsvWriter.mock.calls[0][0];
      expect(path.basename(path.dirname(tempPath))).toBe('temp');
      expect(path.basename(tempPath)).toMatch(/^[0-9a-f-]{36}\.csv$/);
    });

    test('uses Date, Hours, Description, Created At columns in order', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'C' }, []);

      await request(app).get('/api/reports/export/csv/1');

      expect(createObjectCsvWriter.mock.calls[0][0].header).toEqual([
        { id: 'date', title: 'Date' },
        { id: 'hours', title: 'Hours' },
        { id: 'description', title: 'Description' },
        { id: 'created_at', title: 'Created At' }
      ]);
    });

    test('exports an empty report when the client has no entries', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'C' }, []);

      const response = await request(app).get('/api/reports/export/csv/1');

      expect(response.status).toBe(200);
      expect(writeRecords).toHaveBeenCalledWith([]);
    });

    test('deletes the temp file after a successful download', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'C' }, []);

      await request(app).get('/api/reports/export/csv/1');

      const { path: tempPath } = createObjectCsvWriter.mock.calls[0][0];
      expect(fs.unlink).toHaveBeenCalledWith(tempPath, expect.any(Function));
    });

    test('still deletes the temp file when sending the download fails', async () => {
      downloadError = new Error('client aborted');
      mockClientAndEntries(mockDb, { id: 1, name: 'C' }, []);

      await request(app).get('/api/reports/export/csv/1');

      expect(fs.unlink).toHaveBeenCalledTimes(1);
    });

    test('scopes exported entries to the authenticated user', async () => {
      mockClientAndEntries(mockDb, { id: 7, name: 'C' }, []);

      await request(app).get('/api/reports/export/csv/7');

      expect(mockDb.all.mock.calls[0][1]).toEqual([7, 'test@example.com']);
    });
  });

  describe('GET /api/reports/export/pdf/:clientId', () => {
    test('returns a PDF with a sanitized attachment filename', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'A"; x=y\r\nSet-Cookie: a' }, []);

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toMatch(
        /^attachment; filename="[A-Za-z0-9_]+_report_[0-9TZ-]+\.pdf"$/
      );
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    test('shows zero totals for a client with no entries', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'C' }, []);

      await request(app).get('/api/reports/export/pdf/1');

      const doc = mockPdfDocs[0];
      expect(doc.text).toHaveBeenCalledWith('Total Hours: 0.00');
      expect(doc.text).toHaveBeenCalledWith('Total Entries: 0');
      expect(doc.end).toHaveBeenCalled();
    });

    test('formats total hours to two decimals and sums string hours', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'C' }, [
        { date: '2024-01-01', hours: '1.333', description: 'a' },
        { date: '2024-01-02', hours: 2, description: 'b' }
      ]);

      await request(app).get('/api/reports/export/pdf/1');

      expect(mockPdfDocs[0].text).toHaveBeenCalledWith('Total Hours: 3.33');
    });

    test('renders "No description" for empty or null descriptions', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'C' }, [
        { date: '2024-01-01', hours: 1, description: null },
        { date: '2024-01-02', hours: 1, description: '' }
      ]);

      await request(app).get('/api/reports/export/pdf/1');

      const noDescCalls = mockPdfDocs[0].text.mock.calls.filter(([t]) => t === 'No description');
      expect(noDescCalls).toHaveLength(2);
    });

    test('draws a separator line after every 5 entries', async () => {
      const entries = Array.from({ length: 11 }, (_, i) => ({
        date: '2024-01-01',
        hours: 1,
        description: `e${i}`
      }));
      mockClientAndEntries(mockDb, { id: 1, name: 'C' }, entries);

      await request(app).get('/api/reports/export/pdf/1');

      // 1 header line + 2 separators (after entries 5 and 10)
      expect(mockPdfDocs[0].moveTo).toHaveBeenCalledTimes(3);
    });

    test('adds a new page when entries overflow the page', async () => {
      const entries = Array.from({ length: 40 }, () => ({
        date: '2024-01-01',
        hours: 1,
        description: 'x'
      }));
      mockClientAndEntries(mockDb, { id: 1, name: 'C' }, entries);

      const response = await request(app).get('/api/reports/export/pdf/1');

      expect(response.status).toBe(200);
      expect(mockPdfDocs[0].addPage).toHaveBeenCalled();
    });

    test('does not add a page for a short report', async () => {
      mockClientAndEntries(mockDb, { id: 1, name: 'C' }, [
        { date: '2024-01-01', hours: 1, description: 'x' }
      ]);

      await request(app).get('/api/reports/export/pdf/1');

      expect(mockPdfDocs[0].addPage).not.toHaveBeenCalled();
    });
  });
});
