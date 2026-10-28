// Integration tests for manager team reports against a real in-memory SQLite
// database populated with the demo seed data from database/init.js.
jest.unmock('sqlite3');

const request = require('supertest');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { initializeDatabase, getDatabase, closeDatabase } = require('../../database/init');
const reportRoutes = require('../../routes/reports');

const app = express();
app.use(express.json());
app.use('/api/reports', reportRoutes);

const MANAGER = 'pm@example.com';
const RANGE = { start_date: '2026-09-01', end_date: '2026-10-31' };

function asManager(url, email = MANAGER) {
  return request(app).get(url).set('x-user-email', email);
}

function run(sql, params) {
  return new Promise((resolve, reject) => {
    getDatabase().run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Team report routes', () => {
  let logSpy;
  let errorSpy;

  beforeAll(async () => {
    logSpy = jest.spyOn(console, 'log').mockImplementation();
    errorSpy = jest.spyOn(console, 'error').mockImplementation();
    await initializeDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('seed data', () => {
    test('manager_employees contains the demo mappings', (done) => {
      getDatabase().all(
        'SELECT manager_email, employee_email FROM manager_employees ORDER BY employee_email',
        [],
        (err, rows) => {
          expect(err).toBeNull();
          expect(rows).toEqual([
            { manager_email: MANAGER, employee_email: 'emp1@example.com' },
            { manager_email: MANAGER, employee_email: 'emp2@example.com' }
          ]);
          done();
        }
      );
    });

    test('re-initializing does not duplicate seed rows', async () => {
      await initializeDatabase();
      const count = await new Promise((resolve) => {
        getDatabase().get('SELECT COUNT(*) AS n FROM work_entries', [], (err, row) => resolve(row.n));
      });
      expect(count).toBe(15);
    });
  });

  describe('authorization', () => {
    test.each([
      '/api/reports/team/employees',
      `/api/reports/team/summary?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}`,
      `/api/reports/team/by-project?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}`,
      `/api/reports/team/employee/emp1@example.com?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}`,
      `/api/reports/team/export/csv?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}`,
      `/api/reports/team/export/pdf?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}`
    ])('returns 403 for a non-manager on %s', async (url) => {
      const response = await asManager(url, 'emp1@example.com');
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Manager access required' });
    });

    test('returns 401 without a user header', async () => {
      const response = await request(app).get('/api/reports/team/employees');
      expect(response.status).toBe(401);
    });

    test('returns 500 when the manager lookup fails', async () => {
      const db = getDatabase();
      const spy = jest.spyOn(db, 'all').mockImplementationOnce((sql, params, cb) => cb(new Error('boom')));
      const response = await asManager('/api/reports/team/employees');
      spy.mockRestore();
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('lists managed employees for a manager', async () => {
      const response = await asManager('/api/reports/team/employees');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        employees: [{ email: 'emp1@example.com' }, { email: 'emp2@example.com' }]
      });
    });
  });

  describe('query validation', () => {
    test.each([
      ['missing start_date', 'end_date=2026-10-31', '"start_date" is required'],
      ['missing end_date', 'start_date=2026-09-01', '"end_date" is required'],
      ['malformed date', 'start_date=09/01/2026&end_date=2026-10-31', '"start_date" must be a valid date in YYYY-MM-DD format'],
      ['impossible date', 'start_date=2026-02-30&end_date=2026-10-31', '"start_date" must be a valid date in YYYY-MM-DD format'],
      ['reversed range', 'start_date=2026-11-01&end_date=2026-10-31', '"start_date" must be on or before "end_date"'],
      ['invalid group_by', 'start_date=2026-09-01&end_date=2026-10-31&group_by=day', '"group_by" must be one of [week, month]']
    ])('summary returns 400 for %s', async (_label, query, message) => {
      const response = await asManager(`/api/reports/team/summary?${query}`);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: message });
    });

    test.each(['by-project', 'employee/emp1@example.com', 'export/csv', 'export/pdf'])(
      '%s returns 400 for bad dates',
      async (endpoint) => {
        const response = await asManager(`/api/reports/team/${endpoint}?start_date=2026-9-1&end_date=2026-10-31`);
        expect(response.status).toBe(400);
        expect(response.body.error).toMatch(/start_date/);
      }
    );
  });

  describe('GET /team/summary', () => {
    test('excludes entries whose client no longer exists, matching by-project', async () => {
      const url = `/api/reports/team/summary?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}`;
      const before = await asManager(url);
      const orphan = await run(
        'INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (?, ?, ?, ?, ?)',
        [999999, 'emp1@example.com', 8, 'Deleted client work', '2026-09-09']
      );
      try {
        const after = await asManager(url);
        expect(after.body.summary).toEqual(before.body.summary);
      } finally {
        await run('DELETE FROM work_entries WHERE id = ?', [orphan.lastID]);
      }
    });

    test('defaults to weekly buckets (Monday-start %Y-%W)', async () => {
      const response = await asManager(
        `/api/reports/team/summary?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}`
      );
      expect(response.status).toBe(200);
      expect(response.body.groupBy).toBe('week');
      expect(response.body.summary).toEqual([
        { employee_email: 'emp1@example.com', period: '2026-36', total_hours: 12 },
        { employee_email: 'emp2@example.com', period: '2026-36', total_hours: 11 },
        { employee_email: 'emp1@example.com', period: '2026-37', total_hours: 5 },
        { employee_email: 'emp2@example.com', period: '2026-37', total_hours: 6 },
        { employee_email: 'emp1@example.com', period: '2026-40', total_hours: 11 },
        { employee_email: 'emp2@example.com', period: '2026-40', total_hours: 5 },
        { employee_email: 'emp1@example.com', period: '2026-41', total_hours: 3.5 },
        { employee_email: 'emp2@example.com', period: '2026-41', total_hours: 2.5 },
        { employee_email: 'emp2@example.com', period: '2026-42', total_hours: 4 }
      ]);
    });

    test('groups by month', async () => {
      const response = await asManager(
        `/api/reports/team/summary?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}&group_by=month`
      );
      expect(response.status).toBe(200);
      expect(response.body.summary).toEqual([
        { employee_email: 'emp1@example.com', period: '2026-09', total_hours: 17 },
        { employee_email: 'emp2@example.com', period: '2026-09', total_hours: 17 },
        { employee_email: 'emp1@example.com', period: '2026-10', total_hours: 14.5 },
        { employee_email: 'emp2@example.com', period: '2026-10', total_hours: 11.5 }
      ]);
    });

    test('honours inclusive date filters', async () => {
      const response = await asManager(
        '/api/reports/team/summary?start_date=2026-09-08&end_date=2026-09-09&group_by=month'
      );
      expect(response.body.summary).toEqual([
        { employee_email: 'emp1@example.com', period: '2026-09', total_hours: 6 },
        { employee_email: 'emp2@example.com', period: '2026-09', total_hours: 3 }
      ]);
    });

    test('never includes unmanaged users', async () => {
      const response = await asManager(
        `/api/reports/team/summary?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}`
      );
      const emails = new Set(response.body.summary.map((row) => row.employee_email));
      expect(emails).toEqual(new Set(['emp1@example.com', 'emp2@example.com']));
    });

    test('returns 500 on database error', async () => {
      const db = getDatabase();
      const realAll = db.all.bind(db);
      const spy = jest.spyOn(db, 'all')
        .mockImplementationOnce(realAll)
        .mockImplementationOnce((sql, params, cb) => cb(new Error('boom')));
      const response = await asManager(
        `/api/reports/team/summary?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}`
      );
      spy.mockRestore();
      expect(response.status).toBe(500);
    });
  });

  describe('GET /team/by-project', () => {
    test('groups by client name and employee, excluding unmanaged users', async () => {
      const response = await asManager(
        `/api/reports/team/by-project?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}`
      );
      expect(response.status).toBe(200);
      expect(response.body.byProject).toEqual([
        { client_name: 'Acme Corp', employee_email: 'emp1@example.com', total_hours: 25.5 },
        { client_name: 'Acme Corp', employee_email: 'emp2@example.com', total_hours: 14 },
        { client_name: 'Globex', employee_email: 'emp1@example.com', total_hours: 6 },
        { client_name: 'Initech', employee_email: 'emp2@example.com', total_hours: 14.5 }
      ]);
    });

    test('merges same-named clients across employees in projectTotals', async () => {
      const response = await asManager(
        `/api/reports/team/by-project?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}`
      );
      // Acme Corp is a separate client row per employee; outsider's 18h are excluded.
      expect(response.body.projectTotals).toEqual([
        { client_name: 'Acme Corp', total_hours: 39.5 },
        { client_name: 'Globex', total_hours: 6 },
        { client_name: 'Initech', total_hours: 14.5 }
      ]);
    });
  });

  describe('GET /team/employee/:email', () => {
    test('returns entries and totals for a managed employee within range', async () => {
      const response = await asManager(
        '/api/reports/team/employee/emp2@example.com?start_date=2026-10-01&end_date=2026-10-31'
      );
      expect(response.status).toBe(200);
      expect(response.body.employee_email).toBe('emp2@example.com');
      expect(response.body.totalHours).toBe(11.5);
      expect(response.body.entryCount).toBe(3);
      expect(response.body.workEntries.map((e) => e.date)).toEqual(['2026-10-20', '2026-10-13', '2026-10-07']);
      expect(response.body.workEntries[0].client_name).toBe('Initech');
    });

    test('returns 403 for an unmanaged employee', async () => {
      const response = await asManager(
        `/api/reports/team/employee/outsider@example.com?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}`
      );
      expect(response.status).toBe(403);
      expect(response.body).toEqual({ error: 'Employee is not managed by you' });
    });
  });

  describe('exports', () => {
    test('CSV export returns a file with managed employees only', async () => {
      const response = await asManager(
        `/api/reports/team/export/csv?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}`
      );
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/csv/);
      expect(response.headers['content-disposition']).toMatch(/attachment; filename="team_report_2026-09-01_2026-10-31_.*\.csv"/);
      const lines = response.text.trim().split('\n');
      expect(lines[0]).toBe('Employee,Date,Client,Hours,Description');
      expect(lines).toHaveLength(14);
      expect(response.text).not.toContain('outsider@example.com');
    });

    test('PDF export returns a PDF document', async () => {
      const response = await asManager(
        `/api/reports/team/export/pdf?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}`
      )
        .buffer(true)
        .parse(binaryParser);
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toMatch(/team_report_2026-09-01_2026-10-31_.*\.pdf/);
      expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
    });

    test('CSV temp files are cleaned up', async () => {
      const tempDir = path.join(__dirname, '../../../temp');
      await asManager(`/api/reports/team/export/csv?start_date=${RANGE.start_date}&end_date=${RANGE.end_date}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const leftovers = fs.existsSync(tempDir)
        ? fs.readdirSync(tempDir).filter((f) => f.startsWith('team_report_'))
        : [];
      expect(leftovers).toEqual([]);
    });
  });

  describe('entries created through the API (epoch-millisecond dates)', () => {
    beforeAll(async () => {
      const acme = await new Promise((resolve) => {
        getDatabase().get(
          "SELECT id FROM clients WHERE user_email = 'emp1@example.com' AND name = 'Acme Corp'",
          [],
          (err, row) => resolve(row.id)
        );
      });
      // node-sqlite3 stores JS Date params as epoch ms; bind the number directly because
      // Jest's sandboxed Date is not recognised by the native binding.
      // Duplicate same-named client for the same employee.
      const dup = await run(
        "INSERT INTO clients (name, user_email) VALUES ('Acme Corp', 'emp1@example.com')",
        []
      );
      await run(
        'INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (?, ?, ?, ?, ?)',
        [dup.lastID, 'emp1@example.com', 2, 'Via API', new Date('2026-11-02').getTime()]
      );
      await run(
        'INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (?, ?, ?, ?, ?)',
        [acme, 'emp1@example.com', 1, 'Via API', new Date('2026-11-03').getTime()]
      );
    });

    test('buckets epoch-ms dates and merges duplicate same-named clients', async () => {
      const summary = await asManager(
        '/api/reports/team/summary?start_date=2026-11-01&end_date=2026-11-30&group_by=week'
      );
      expect(summary.body.summary).toEqual([
        { employee_email: 'emp1@example.com', period: '2026-44', total_hours: 3 }
      ]);

      const byProject = await asManager('/api/reports/team/by-project?start_date=2026-11-01&end_date=2026-11-30');
      expect(byProject.body.byProject).toEqual([
        { client_name: 'Acme Corp', employee_email: 'emp1@example.com', total_hours: 3 }
      ]);

      const drill = await asManager(
        '/api/reports/team/employee/emp1@example.com?start_date=2026-11-01&end_date=2026-11-30'
      );
      expect(drill.body.workEntries.map((e) => e.date)).toEqual(['2026-11-03', '2026-11-02']);
    });
  });
});
