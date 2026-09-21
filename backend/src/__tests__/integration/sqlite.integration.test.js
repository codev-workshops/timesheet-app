/**
 * Runs against a REAL in-memory sqlite3 database (the global sqlite3 mock from
 * setup.js is disabled here) to validate the SQL used by the routes:
 *  - SUM/COUNT aggregate correctness on decimal hours and empty sets
 *  - pagination (LIMIT/OFFSET + total)
 *  - EXPLAIN QUERY PLAN shows the composite index is used
 */
jest.unmock('sqlite3');

const request = require('supertest');
const express = require('express');
const { getDatabase, initializeDatabase, closeDatabase } = require('../../database/init');
const { seedPerfData } = require('../../../scripts/seed');
const workEntryRoutes = require('../../routes/workEntries');
const reportRoutes = require('../../routes/reports');

const USER = 'perf@example.com';
const OTHER_USER = 'other@example.com';

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
}
function get(db, sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
}
function run(db, sql, params = []) {
  return new Promise((resolve, reject) =>
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    })
  );
}
async function plan(db, sql, params) {
  const rows = await all(db, `EXPLAIN QUERY PLAN ${sql}`, params);
  return rows.map((r) => r.detail).join('\n');
}

const app = express();
app.use(express.json());
app.use('/api/work-entries', workEntryRoutes);
app.use('/api/reports', reportRoutes);

describe('Real SQLite integration', () => {
  let db;
  let seed;

  beforeAll(async () => {
    await initializeDatabase();
    db = getDatabase();
    seed = await seedPerfData({ userEmail: USER, clients: 3, entries: 600, randomSeed: 7 });
    await run(db, 'INSERT OR IGNORE INTO users (email) VALUES (?)', [OTHER_USER]);
    await run(db, 'INSERT INTO clients (name, user_email) VALUES (?, ?)', ['Other Client', OTHER_USER]);
    await run(db, 'INSERT INTO work_entries (client_id, user_email, hours, date) VALUES (?, ?, ?, ?)', [
      seed.clientIds[0],
      OTHER_USER,
      99,
      '2024-01-01'
    ]);
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('SUM/COUNT aggregate', () => {
    test('matches a JS reduce over the same rows for decimal hours', async () => {
      const clientId = seed.clientIds[0];
      const rows = await all(db, 'SELECT hours FROM work_entries WHERE client_id = ? AND user_email = ?', [
        clientId,
        USER
      ]);
      const expected = rows.reduce((s, r) => s + r.hours, 0);
      const totals = await get(
        db,
        'SELECT COALESCE(SUM(hours), 0) AS totalHours, COUNT(*) AS entryCount FROM work_entries WHERE client_id = ? AND user_email = ?',
        [clientId, USER]
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(totals.entryCount).toBe(rows.length);
      expect(totals.totalHours).toBeCloseTo(expected, 6);
    });

    test('sums exact quarter-hour decimals', async () => {
      await run(db, 'INSERT INTO clients (id, name, user_email) VALUES (?, ?, ?)', [900, 'Decimal', USER]);
      for (const h of [2.5, 3.75, 1.25, 0.25]) {
        await run(db, 'INSERT INTO work_entries (client_id, user_email, hours, date) VALUES (?, ?, ?, ?)', [
          900,
          USER,
          h,
          '2024-06-01'
        ]);
      }
      const res = await request(app).get('/api/reports/client/900').set('x-user-email', USER);
      expect(res.status).toBe(200);
      expect(res.body.totalHours).toBe(7.75);
      expect(res.body.entryCount).toBe(4);
      expect(res.body.workEntries).toHaveLength(4);
    });

    test('returns 0 / 0 (not null) for a client with no entries', async () => {
      await run(db, 'INSERT INTO clients (id, name, user_email) VALUES (?, ?, ?)', [901, 'Empty', USER]);
      const res = await request(app).get('/api/reports/client/901').set('x-user-email', USER);
      expect(res.status).toBe(200);
      expect(res.body.totalHours).toBe(0);
      expect(res.body.entryCount).toBe(0);
      expect(res.body.workEntries).toEqual([]);
    });

    test('excludes other users rows on a shared client id', async () => {
      const clientId = seed.clientIds[0];
      const mine = await get(db, 'SELECT COUNT(*) AS c FROM work_entries WHERE client_id = ? AND user_email = ?', [
        clientId,
        USER
      ]);
      const res = await request(app).get(`/api/reports/client/${clientId}`).set('x-user-email', USER);
      expect(res.body.entryCount).toBe(mine.c);
      expect(res.body.workEntries.some((e) => e.hours === 99)).toBe(false);
    });
  });

  describe('Dashboard summary', () => {
    test('aggregates only the authenticated user data and returns 5 recent entries', async () => {
      const res = await request(app).get('/api/reports/summary').set('x-user-email', USER);
      const clients = await get(db, 'SELECT COUNT(*) AS c FROM clients WHERE user_email = ?', [USER]);
      const entries = await get(db, 'SELECT COUNT(*) AS c, SUM(hours) AS h FROM work_entries WHERE user_email = ?', [
        USER
      ]);
      expect(res.status).toBe(200);
      expect(res.body.totalClients).toBe(clients.c);
      expect(res.body.totalEntries).toBe(entries.c);
      expect(res.body.totalHours).toBeCloseTo(entries.h, 6);
      expect(res.body.recentEntries).toHaveLength(5);
      expect(res.body.recentEntries[0]).toHaveProperty('client_name');
      const dates = res.body.recentEntries.map((e) => e.date);
      expect([...dates].sort().reverse()).toEqual(dates);
    });
  });

  describe('Pagination', () => {
    test('pages through the full set without gaps or duplicates', async () => {
      const total = (await get(db, 'SELECT COUNT(*) AS c FROM work_entries WHERE user_email = ?', [USER])).c;
      const ids = new Set();
      let offset = 0;
      const limit = 250;
      while (offset < total) {
        const res = await request(app)
          .get(`/api/work-entries?limit=${limit}&offset=${offset}`)
          .set('x-user-email', USER);
        expect(res.status).toBe(200);
        expect(res.body.pagination).toEqual({ total, limit, offset });
        res.body.workEntries.forEach((e) => ids.add(e.id));
        offset += limit;
      }
      expect(ids.size).toBe(total);
    });

    test('offset beyond the end returns an empty page with the real total', async () => {
      const total = (await get(db, 'SELECT COUNT(*) AS c FROM work_entries WHERE user_email = ?', [USER])).c;
      const res = await request(app).get(`/api/work-entries?offset=${total + 10}`).set('x-user-email', USER);
      expect(res.body.workEntries).toEqual([]);
      expect(res.body.pagination.total).toBe(total);
    });
  });

  describe('CSV streaming', () => {
    test('streams header + one row per entry', async () => {
      const res = await request(app)
        .get('/api/reports/export/csv/900')
        .set('x-user-email', USER)
        .buffer(true)
        .parse((r, cb) => {
          let data = '';
          r.on('data', (c) => (data += c));
          r.on('end', () => cb(null, data));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/^text\/csv/);
      const lines = res.body.trim().split('\n');
      expect(lines[0]).toBe('Date,Hours,Description,Created At');
      expect(lines).toHaveLength(5);
    });
  });

  describe('EXPLAIN QUERY PLAN', () => {
    test('composite index exists', async () => {
      const idx = await all(db, "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'work_entries'");
      expect(idx.map((i) => i.name)).toContain('idx_work_entries_user_client_date');
    });

    test('client report aggregate uses the composite index', async () => {
      const detail = await plan(
        db,
        'SELECT COALESCE(SUM(hours), 0) AS totalHours, COUNT(*) AS entryCount FROM work_entries WHERE client_id = ? AND user_email = ?',
        [1, USER]
      );
      expect(detail).toContain('idx_work_entries_user_client_date');
    });

    test('client report list uses the composite index and avoids a sort', async () => {
      const detail = await plan(
        db,
        'SELECT id, hours, description, date, created_at, updated_at FROM work_entries WHERE client_id = ? AND user_email = ? ORDER BY date DESC',
        [1, USER]
      );
      expect(detail).toContain('idx_work_entries_user_client_date');
      expect(detail).not.toMatch(/USE TEMP B-TREE FOR ORDER BY/);
    });

    test('paginated list filtered by client uses the composite index', async () => {
      const detail = await plan(
        db,
        `SELECT we.id FROM work_entries we JOIN clients c ON we.client_id = c.id
         WHERE we.user_email = ? AND we.client_id = ? ORDER BY we.date DESC, we.created_at DESC LIMIT ? OFFSET ?`,
        [USER, 1, 50, 0]
      );
      expect(detail).toContain('idx_work_entries_user_client_date');
    });
  });
});
