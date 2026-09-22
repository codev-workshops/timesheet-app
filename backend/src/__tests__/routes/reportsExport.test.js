// Exercises the real CSV and PDF export success paths: csv-writer, pdfkit and
// fs are NOT mocked here so the file download / PDF stream code actually runs.
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

const reportRoutes = require('../../routes/reports');

const app = express();
app.use('/api/reports', reportRoutes);

const TEMP_DIR = path.join(__dirname, '../../../temp');
const client = { id: 1, name: 'Acme & Co.' };

function makeEntries(count) {
  return Array.from({ length: count }, (_, i) => ({
    date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
    hours: 1.25,
    description: i % 2 === 0 ? `Task ${i + 1}` : null,
    created_at: '2024-01-01 10:00:00'
  }));
}

function listTempFiles() {
  return fs.existsSync(TEMP_DIR) ? fs.readdirSync(TEMP_DIR) : [];
}

async function waitFor(predicate, timeoutMs = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 20));
  }
  return true;
}

describe('Report export success paths (unmocked csv-writer / pdfkit / fs)', () => {
  let mockDb;
  let consoleErrorSpy;

  beforeEach(() => {
    mockDb = { all: jest.fn(), get: jest.fn() };
    getDatabase.mockReturnValue(mockDb);
    mockDb.get.mockImplementation((q, p, cb) => cb(null, client));
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('GET /api/reports/export/csv/:clientId', () => {
    test('streams a CSV attachment with header row and entries, then removes the temp file', async () => {
      const entries = makeEntries(3);
      mockDb.all.mockImplementation((q, p, cb) => cb(null, entries));
      const before = listTempFiles();

      const response = await request(app).get('/api/reports/export/csv/1').buffer(true);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/csv/);
      expect(response.headers['content-disposition']).toMatch(
        /^attachment; filename="Acme___Co__report_.*\.csv"$/
      );
      const body = response.text || response.body.toString();
      const lines = body.trim().split('\n');
      expect(lines[0]).toBe('Date,Hours,Description,Created At');
      expect(lines).toHaveLength(4);
      expect(lines[1]).toBe('2024-01-01,1.25,Task 1,2024-01-01 10:00:00');
      expect(lines[2]).toBe('2024-01-02,1.25,,2024-01-01 10:00:00');

      const cleaned = await waitFor(() => listTempFiles().length <= before.length);
      expect(cleaned).toBe(true);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('produces a header-only CSV when the client has no entries', async () => {
      mockDb.all.mockImplementation((q, p, cb) => cb(null, []));

      const response = await request(app).get('/api/reports/export/csv/1').buffer(true);

      expect(response.status).toBe(200);
      const body = response.text || response.body.toString();
      expect(body.trim()).toBe('Date,Hours,Description,Created At');
    });

    test('scopes both queries to the authenticated user', async () => {
      mockDb.all.mockImplementation((q, p, cb) => cb(null, []));

      await request(app).get('/api/reports/export/csv/1').buffer(true);

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = ? AND user_email = ?'),
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

  describe('GET /api/reports/export/pdf/:clientId', () => {
    const pdfRequest = () =>
      request(app)
        .get('/api/reports/export/pdf/1')
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });

    const pageCount = (buf) => (buf.toString('latin1').match(/\/Type \/Page[^s]/g) || []).length;

    test('streams a valid single-page PDF attachment for a short report', async () => {
      const entries = makeEntries(5);
      mockDb.all.mockImplementation((q, p, cb) => cb(null, entries));

      const response = await pdfRequest();

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toMatch(
        /^attachment; filename="Acme___Co__report_.*\.pdf"$/
      );
      expect(Buffer.isBuffer(response.body)).toBe(true);
      expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(response.body.toString('latin1')).toContain('%%EOF');
      expect(pageCount(response.body)).toBe(1);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('adds pages when entries overflow the first page (pagination branch)', async () => {
      const entries = makeEntries(80);
      mockDb.all.mockImplementation((q, p, cb) => cb(null, entries));

      const response = await pdfRequest();

      expect(response.status).toBe(200);
      expect(pageCount(response.body)).toBeGreaterThan(1);
    });

    test('renders an empty report (zero entries) without error', async () => {
      mockDb.all.mockImplementation((q, p, cb) => cb(null, []));

      const response = await pdfRequest();

      expect(response.status).toBe(200);
      expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pageCount(response.body)).toBe(1);
    });
  });
});
