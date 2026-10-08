const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = 'test@example.com';
    next();
  }
}));

const mockWriteRecords = jest.fn();
jest.mock('csv-writer', () => ({
  createObjectCsvWriter: jest.fn((config) => ({
    writeRecords: (records) => mockWriteRecords(config, records)
  }))
}));

const mockPdfDocs = [];
function mockCreatePdfDoc() {
  const chain = () => jest.fn(function chained() {
    return this;
  });
  const doc = {
    y: 100,
    output: null,
    fontSize: chain(),
    text: chain(),
    moveTo: chain(),
    lineTo: chain(),
    stroke: chain(),
    moveDown: jest.fn(function moveDown() {
      this.y += 20;
      return this;
    }),
    addPage: jest.fn(function addPage() {
      this.y = 72;
      return this;
    }),
    pipe: jest.fn(function pipe(destination) {
      this.output = destination;
      return destination;
    }),
    end: jest.fn(function end() {
      this.output.end('%PDF-1.3 fake');
    })
  };
  mockPdfDocs.push(doc);
  return doc;
}
jest.mock('pdfkit', () => jest.fn(() => mockCreatePdfDoc()));

const { createObjectCsvWriter } = require('csv-writer');
const reportRoutes = require('../../routes/reports');

const TEMP_DIR = path.join(__dirname, '../../../temp');

const buildApp = (beforeRoutes) => {
  const app = express();
  if (beforeRoutes) app.use(beforeRoutes);
  app.use('/api/reports', reportRoutes);
  return app;
};

const waitFor = async (predicate, timeoutMs = 1000) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('Report export success paths', () => {
  let mockDb;
  let consoleErrorSpy;
  let tempDirExisted;

  beforeAll(() => {
    tempDirExisted = fs.existsSync(TEMP_DIR);
  });

  afterAll(() => {
    if (!tempDirExisted && fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    mockDb = { get: jest.fn(), all: jest.fn() };
    getDatabase.mockReturnValue(mockDb);
    mockPdfDocs.length = 0;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  const givenClientWithEntries = (client, entries) => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, client));
    mockDb.all.mockImplementation((query, params, callback) => callback(null, entries));
  };

  describe('GET /api/reports/export/csv/:clientId', () => {
    test('streams the generated CSV as an attachment and deletes the temp file', async () => {
      const entries = [
        { date: '2024-01-02', hours: 3, description: 'Review', created_at: '2024-01-02 10:00:00' },
        { date: '2024-01-01', hours: 5.5, description: 'Build', created_at: '2024-01-01 10:00:00' }
      ];
      givenClientWithEntries({ id: 7, name: 'Acme Corp & Co' }, entries);
      mockWriteRecords.mockImplementation(async (config, records) => {
        const lines = records.map((r) => `${r.date},${r.hours},${r.description},${r.created_at}`);
        fs.writeFileSync(config.path, ['Date,Hours,Description,Created At', ...lines].join('\n'));
      });

      const response = await request(buildApp()).get('/api/reports/export/csv/7');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/csv/);
      const disposition = response.headers['content-disposition'];
      expect(disposition).toMatch(/^attachment; filename="Acme_Corp___Co_report_.+\.csv"$/);
      expect(response.text).toContain('2024-01-01,5.5,Build');

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('WHERE client_id = ? AND user_email = ?'),
        [7, 'test@example.com'],
        expect.any(Function)
      );
      const [config, records] = mockWriteRecords.mock.calls[0];
      expect(records).toEqual(entries);
      expect(config.header.map((h) => h.id)).toEqual(['date', 'hours', 'description', 'created_at']);
      expect(path.dirname(config.path)).toBe(TEMP_DIR);

      await waitFor(() => !fs.existsSync(config.path));
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('logs send and cleanup failures', async () => {
      givenClientWithEntries({ id: 1, name: 'Client' }, []);
      mockWriteRecords.mockResolvedValue(undefined);
      const unlinkSpy = jest
        .spyOn(fs, 'unlink')
        .mockImplementation((filePath, callback) => callback(new Error('ENOENT')));
      const failingDownload = (req, res, next) => {
        res.download = (filePath, filename, callback) => {
          callback(new Error('send failed'));
          res.status(500).end();
        };
        next();
      };

      const response = await request(buildApp(failingDownload)).get('/api/reports/export/csv/1');

      expect(response.status).toBe(500);
      expect(createObjectCsvWriter).toHaveBeenCalledTimes(1);
      expect(unlinkSpy).toHaveBeenCalledWith(expect.stringContaining('Client_report_'), expect.any(Function));
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error sending file:', expect.any(Error));
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error deleting temp file:', expect.any(Error));
    });
  });

  describe('GET /api/reports/export/pdf/:clientId', () => {
    test('renders summary and entries into a PDF attachment', async () => {
      const entries = [
        { date: '2024-01-03', hours: 2, description: 'Planning', created_at: '2024-01-03' },
        { date: '2024-01-02', hours: 4.25, description: null, created_at: '2024-01-02' },
        { date: '2024-01-01', hours: 2.25, description: 'Build', created_at: '2024-01-01' }
      ];
      givenClientWithEntries({ id: 3, name: 'Acme Corp' }, entries);

      const response = await request(buildApp()).get('/api/reports/export/pdf/3');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toMatch(
        /^attachment; filename="Acme_Corp_report_.+\.pdf"$/
      );
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = ? AND user_email = ?'),
        [3, 'test@example.com'],
        expect.any(Function)
      );

      expect(mockPdfDocs).toHaveLength(1);
      const doc = mockPdfDocs[0];
      const texts = doc.text.mock.calls.map(([text]) => text);
      expect(texts).toContain('Time Report for Acme Corp');
      expect(texts).toContain('Total Hours: 8.50');
      expect(texts).toContain('Total Entries: 3');
      expect(texts).toEqual(expect.arrayContaining(['Date', 'Hours', 'Description']));
      expect(texts).toEqual(expect.arrayContaining(['2024-01-02', '4.25', 'No description', 'Planning']));
      expect(doc.addPage).not.toHaveBeenCalled();
      expect(doc.end).toHaveBeenCalledTimes(1);
    });

    test('adds a separator every 5 entries and a new page when the page is full', async () => {
      const entries = Array.from({ length: 40 }, (_, i) => ({
        date: `2024-02-${String((i % 28) + 1).padStart(2, '0')}`,
        hours: 1,
        description: `Task ${i}`,
        created_at: '2024-02-01'
      }));
      givenClientWithEntries({ id: 4, name: 'Big Client' }, entries);

      const response = await request(buildApp()).get('/api/reports/export/pdf/4');

      expect(response.status).toBe(200);
      const doc = mockPdfDocs[0];
      expect(doc.text.mock.calls.map(([text]) => text)).toContain('Total Hours: 40.00');
      // 1 header rule + one separator per 5 entries
      expect(doc.stroke).toHaveBeenCalledTimes(1 + 40 / 5);
      expect(doc.addPage).toHaveBeenCalled();
    });

    test('renders an empty report with zero totals', async () => {
      givenClientWithEntries({ id: 5, name: 'Empty' }, []);

      const response = await request(buildApp()).get('/api/reports/export/pdf/5');

      expect(response.status).toBe(200);
      const texts = mockPdfDocs[0].text.mock.calls.map(([text]) => text);
      expect(texts).toContain('Total Hours: 0.00');
      expect(texts).toContain('Total Entries: 0');
    });
  });
});
