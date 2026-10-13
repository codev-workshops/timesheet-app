const request = require('supertest');
const express = require('express');
const fs = require('fs');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');
jest.mock('fs');
jest.mock('csv-writer', () => ({
  createObjectCsvWriter: jest.fn()
}));
jest.mock('pdfkit', () =>
  jest.fn().mockImplementation(() => {
    const doc = {
      fontSize: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      moveDown: jest.fn().mockReturnThis(),
      moveTo: jest.fn().mockReturnThis(),
      lineTo: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      addPage: jest.fn().mockReturnThis(),
      pipe: jest.fn((res) => {
        doc.res = res;
      }),
      end: jest.fn(() => doc.res.end()),
      y: 100
    };
    return doc;
  })
);
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = 'test@example.com';
    next();
  }
}));

const csvWriter = require('csv-writer');
const PDFDocument = require('pdfkit');
const reportRoutes = require('../../routes/reports');

const app = express();
app.use('/api/reports', reportRoutes);

const entries = [
  { id: 1, hours: 2, description: 'Billable work', date: '2024-01-02', category: 'billable', created_at: '2024-01-02' },
  { id: 2, hours: 1, description: 'Planning', date: '2024-01-01', category: null, created_at: '2024-01-01' }
];

describe('Report exports include category', () => {
  let writeRecords;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    getDatabase.mockReturnValue({
      get: jest.fn((query, params, callback) => callback(null, { id: 1, name: 'Client A' })),
      all: jest.fn((query, params, callback) => callback(null, entries))
    });
    fs.existsSync = jest.fn().mockReturnValue(true);
    fs.unlink = jest.fn((p, callback) => callback(null));
    writeRecords = jest.fn().mockRejectedValue(new Error('stop after capture'));
    csvWriter.createObjectCsvWriter.mockReturnValue({ writeRecords });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  test('client report JSON selects and returns category', async () => {
    const response = await request(app).get('/api/reports/client/1');

    expect(response.status).toBe(200);
    expect(response.body.workEntries.map((e) => e.category)).toEqual(['billable', null]);
    const [query, params] = getDatabase().all.mock.calls[0];
    expect(query).toContain('category');
    expect(params).toEqual([1, 'test@example.com']);
  });

  test('CSV export has a Category column and labels uncategorized rows', async () => {
    await request(app).get('/api/reports/export/csv/1');

    const { header } = csvWriter.createObjectCsvWriter.mock.calls[0][0];
    expect(header).toContainEqual({ id: 'category', title: 'Category' });
    const [query] = getDatabase().all.mock.calls[0];
    expect(query).toContain('category');
    const records = writeRecords.mock.calls[0][0];
    expect(records.map((r) => r.category)).toEqual(['billable', 'Uncategorized']);
  });

  test('PDF export prints category on each entry line', async () => {
    const response = await request(app).get('/api/reports/export/pdf/1');

    expect(response.status).toBe(200);
    const doc = PDFDocument.mock.results[0].value;
    const texts = doc.text.mock.calls.map((call) => call[0]);
    expect(texts).toContain('Category');
    expect(texts).toContain('billable');
    expect(texts).toContain('Uncategorized');
    const [query] = getDatabase().all.mock.calls[0];
    expect(query).toContain('category');
  });
});
