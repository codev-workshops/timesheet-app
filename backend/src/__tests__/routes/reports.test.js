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
        expect.stringContaining('WHERE we.client_id = ? AND we.user_email = ?'),
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

  describe('Category filtering', () => {
    test('should filter report entries by category ID', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Test Client' });
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      const response = await request(app).get('/api/reports/client/1?categoryId=3');

      expect(response.status).toBe(200);
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('AND we.category_id = ?'),
        [1, 'test@example.com', 3],
        expect.any(Function)
      );
    });

    test('should return 400 for invalid category ID on report', async () => {
      const response = await request(app).get('/api/reports/client/1?categoryId=abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid category ID' });
    });

    test('should filter CSV export entries by category ID', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Test Client' });
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      const csvWriter = require('csv-writer');
      csvWriter.createObjectCsvWriter.mockReturnValue({
        writeRecords: jest.fn().mockRejectedValue(new Error('Write failed'))
      });

      await request(app).get('/api/reports/export/csv/1?categoryId=3');

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('AND we.category_id = ?'),
        [1, 'test@example.com', 3],
        expect.any(Function)
      );
    });

    test('should return 400 for invalid category ID on CSV export', async () => {
      const response = await request(app).get('/api/reports/export/csv/1?categoryId=abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid category ID' });
    });

    test('should filter PDF export entries by category ID', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Test Client' });
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      // The mocked PDF document never ends the response, so fire and abort
      const pending = request(app).get('/api/reports/export/pdf/1?categoryId=3');
      pending.end(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('AND we.category_id = ?'),
        [1, 'test@example.com', 3],
        expect.any(Function)
      );
      pending.abort();
    });

    test('should return 400 for invalid category ID on PDF export', async () => {
      const response = await request(app).get('/api/reports/export/pdf/1?categoryId=abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid category ID' });
    });

    test('should include Category column in CSV header', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1, name: 'Test Client' });
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      const csvWriter = require('csv-writer');
      const writeRecords = jest.fn().mockResolvedValue(undefined);
      csvWriter.createObjectCsvWriter.mockReturnValue({ writeRecords });

      // The mocked fs/res.download never ends the response, so fire and abort
      const pending = request(app).get('/api/reports/export/csv/1');
      pending.end(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      const writerConfig = csvWriter.createObjectCsvWriter.mock.calls[0][0];
      expect(writerConfig.header).toContainEqual({ id: 'category_name', title: 'Category' });
      pending.abort();
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
});
