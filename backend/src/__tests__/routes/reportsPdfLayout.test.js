const request = require('supertest');
const express = require('express');
const { getDatabase } = require('../../database/init');
const fs = require('fs');

let mockInitialY = 100;
let mockDoc;

jest.mock('../../database/init');
jest.mock('fs');
jest.mock('csv-writer', () => ({
  createObjectCsvWriter: jest.fn(() => ({
    writeRecords: jest.fn().mockResolvedValue(undefined)
  }))
}));
jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => {
    let destination;
    mockDoc = {
      fontSize: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      moveDown: jest.fn().mockReturnThis(),
      moveTo: jest.fn().mockReturnThis(),
      lineTo: jest.fn().mockReturnThis(),
      stroke: jest.fn().mockReturnThis(),
      addPage: jest.fn(function addPage() {
        this.y = 50;
        return this;
      }),
      pipe: jest.fn((res) => {
        destination = res;
      }),
      end: jest.fn(() => destination.end()),
      y: mockInitialY
    };
    return mockDoc;
  });
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

const entry = { hours: 4.5, description: 'Layout work', date: '2024-01-15' };

const findTextCall = (content) =>
  mockDoc.text.mock.calls.find(([text]) => text === content);

describe('PDF export row layout', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      all: jest.fn((query, params, callback) => callback(null, [entry])),
      get: jest.fn((query, params, callback) =>
        callback(null, { id: 1, name: 'Test Client' })
      )
    };
    getDatabase.mockReturnValue(mockDb);

    fs.existsSync = jest.fn().mockReturnValue(true);
    fs.mkdirSync = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('draws every column of a row at the new page top after a page break', async () => {
    mockInitialY = 750;

    const response = await request(app).get('/api/reports/export/pdf/1');

    expect(response.status).toBe(200);
    expect(mockDoc.addPage).toHaveBeenCalledTimes(1);
    expect(findTextCall(entry.date)).toEqual([entry.date, 50, 50, { width: 100 }]);
    expect(findTextCall(entry.hours.toString())).toEqual([
      entry.hours.toString(), 150, 50, { width: 80 }
    ]);
    expect(findTextCall(entry.description)).toEqual([
      entry.description, 230, 50, { width: 300 }
    ]);
  });

  test('draws every column of a row at the same y when no page break is needed', async () => {
    mockInitialY = 100;

    const response = await request(app).get('/api/reports/export/pdf/1');

    expect(response.status).toBe(200);
    expect(mockDoc.addPage).not.toHaveBeenCalled();
    expect(findTextCall(entry.date)).toEqual([entry.date, 50, 100, { width: 100 }]);
    expect(findTextCall(entry.hours.toString())).toEqual([
      entry.hours.toString(), 150, 100, { width: 80 }
    ]);
    expect(findTextCall(entry.description)).toEqual([
      entry.description, 230, 100, { width: 300 }
    ]);
  });
});
