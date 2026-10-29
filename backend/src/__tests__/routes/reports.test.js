const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createApp, USER, OTHER_USER } = require('../helpers/app');
const {
  resetDatabase, insertUsers, insertClient, insertWorkEntry, breakTable
} = require('../helpers/db');

const app = createApp();
const TEMP_DIR = path.join(__dirname, '../../../temp');

const asUser = (req, email = USER) => req.set('x-user-email', email);

function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Report Routes', () => {
  let client;
  let otherClient;

  beforeEach(async () => {
    await resetDatabase();
    await insertUsers(USER, OTHER_USER);
    client = await insertClient(USER, { name: 'Acme Corp' });
    otherClient = await insertClient(OTHER_USER, { name: 'Other Co' });
  });

  describe('GET /api/reports/client/:clientId', () => {
    test('returns client report with entries, totalHours and entryCount', async () => {
      await insertWorkEntry(USER, client.id, { hours: 8, date: '2024-01-01', description: 'Work 1' });
      await insertWorkEntry(USER, client.id, { hours: 6.5, date: '2024-01-02', description: 'Work 2' });

      const res = await asUser(request(app).get(`/api/reports/client/${client.id}`));

      expect(res.status).toBe(200);
      expect(res.body.client).toEqual({ id: client.id, name: 'Acme Corp' });
      expect(res.body.totalHours).toBe(14.5);
      expect(res.body.entryCount).toBe(2);
      expect(res.body.workEntries.map((e) => e.date)).toEqual(['2024-01-02', '2024-01-01']);
      expect(Object.keys(res.body.workEntries[0]).sort()).toEqual(
        ['created_at', 'date', 'description', 'hours', 'id', 'updated_at']
      );
    });

    test('returns zero totals for a client with no entries', async () => {
      const res = await asUser(request(app).get(`/api/reports/client/${client.id}`));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        client: { id: client.id, name: 'Acme Corp' }, workEntries: [], totalHours: 0, entryCount: 0
      });
    });

    test('correctly sums decimal hours', async () => {
      for (const hours of [1.25, 2.5, 3.75]) {
        await insertWorkEntry(USER, client.id, { hours });
      }
      const res = await asUser(request(app).get(`/api/reports/client/${client.id}`));
      expect(res.body.totalHours).toBeCloseTo(7.5);
      expect(res.body.entryCount).toBe(3);
    });

    test('returns 404 for a non-existent client', async () => {
      const res = await asUser(request(app).get('/api/reports/client/999'));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Client not found' });
    });

    test('returns 400 for invalid client ID', async () => {
      const res = await asUser(request(app).get('/api/reports/client/invalid'));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid client ID' });
    });

    test('returns 500 when fetching the client fails', async () => {
      await breakTable('clients');
      const res = await asUser(request(app).get(`/api/reports/client/${client.id}`));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      expect(console.error).toHaveBeenCalled();
    });

    test('returns 500 when fetching work entries fails', async () => {
      await breakTable('work_entries');
      const res = await asUser(request(app).get(`/api/reports/client/${client.id}`));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('Data isolation', () => {
    test('another user cannot read a client report (404)', async () => {
      await insertWorkEntry(OTHER_USER, otherClient.id, { hours: 9 });
      const res = await asUser(request(app).get(`/api/reports/client/${otherClient.id}`));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Client not found' });
    });

    test('only aggregates the requesting user\'s entries for the client', async () => {
      await insertWorkEntry(USER, client.id, { hours: 4 });
      // A stray row with the same client_id but a different owner must not be counted.
      await insertWorkEntry(OTHER_USER, client.id, { hours: 10 });

      const res = await asUser(request(app).get(`/api/reports/client/${client.id}`));

      expect(res.body.totalHours).toBe(4);
      expect(res.body.entryCount).toBe(1);
    });

    test.each(['csv', 'pdf'])('%s export of another user\'s client returns 404', async (format) => {
      const res = await asUser(request(app).get(`/api/reports/export/${format}/${otherClient.id}`));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Client not found' });
    });
  });

  describe('GET /api/reports/export/csv/:clientId', () => {
    test('downloads a CSV attachment with the user\'s entries and removes the temp file', async () => {
      await insertWorkEntry(USER, client.id, { hours: 8, date: '2024-01-01', description: 'Work 1' });
      await insertWorkEntry(USER, client.id, { hours: 2.5, date: '2024-01-02', description: 'Work 2' });
      await insertWorkEntry(OTHER_USER, otherClient.id, { hours: 9, description: 'Secret' });

      const res = await asUser(request(app).get(`/api/reports/export/csv/${client.id}`));

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="Acme_Corp_report_.*\.csv"$/);
      const lines = res.text.trim().split('\n');
      expect(lines[0]).toBe('Date,Hours,Description,Created At');
      expect(lines).toHaveLength(3);
      expect(lines[1]).toMatch(/^2024-01-02,2\.5,Work 2,/);
      expect(lines[2]).toMatch(/^2024-01-01,8,Work 1,/);
      expect(res.text).not.toContain('Secret');

      await new Promise((r) => setTimeout(r, 50));
      const leftovers = fs.existsSync(TEMP_DIR)
        ? fs.readdirSync(TEMP_DIR).filter((f) => f.startsWith('Acme_Corp_report_'))
        : [];
      expect(leftovers).toEqual([]);
    });

    test('exports a header-only CSV when there are no entries', async () => {
      const res = await asUser(request(app).get(`/api/reports/export/csv/${client.id}`));
      expect(res.status).toBe(200);
      expect(res.text.trim()).toBe('Date,Hours,Description,Created At');
    });

    test('returns 400 for invalid client ID', async () => {
      const res = await asUser(request(app).get('/api/reports/export/csv/invalid'));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid client ID' });
    });

    test('returns 404 if client not found', async () => {
      const res = await asUser(request(app).get('/api/reports/export/csv/999'));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Client not found' });
    });

    test('returns 500 when fetching the client fails', async () => {
      await breakTable('clients');
      const res = await asUser(request(app).get(`/api/reports/export/csv/${client.id}`));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    test('returns 500 when fetching work entries fails', async () => {
      await breakTable('work_entries');
      const res = await asUser(request(app).get(`/api/reports/export/csv/${client.id}`));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('GET /api/reports/export/pdf/:clientId', () => {
    test('streams a PDF attachment', async () => {
      for (let i = 1; i <= 6; i++) {
        await insertWorkEntry(USER, client.id, { hours: i, date: `2024-01-0${i}`, description: i % 2 ? `Task ${i}` : null });
      }

      const res = await asUser(request(app).get(`/api/reports/export/pdf/${client.id}`))
        .buffer(true).parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename="Acme_Corp_report_.*\.pdf"$/);
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    });

    test('streams a PDF for a client with no entries', async () => {
      const res = await asUser(request(app).get(`/api/reports/export/pdf/${client.id}`))
        .buffer(true).parse(binaryParser);
      expect(res.status).toBe(200);
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
    });

    test('returns 400 for invalid client ID', async () => {
      const res = await asUser(request(app).get('/api/reports/export/pdf/invalid'));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid client ID' });
    });

    test('returns 404 if client not found', async () => {
      const res = await asUser(request(app).get('/api/reports/export/pdf/999'));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Client not found' });
    });

    test('returns 500 when fetching the client fails', async () => {
      await breakTable('clients');
      const res = await asUser(request(app).get(`/api/reports/export/pdf/${client.id}`));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    test('returns 500 when fetching work entries fails', async () => {
      await breakTable('work_entries');
      const res = await asUser(request(app).get(`/api/reports/export/pdf/${client.id}`));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });
  });
});
