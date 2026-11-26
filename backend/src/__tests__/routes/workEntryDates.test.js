const express = require('express');
const request = require('supertest');
const { getDatabase, initializeDatabase, closeDatabase } = require('../../database/init');
const workEntryRoutes = require('../../routes/workEntries');
const reportRoutes = require('../../routes/reports');

jest.unmock('sqlite3');

const email = 'dates@example.com';
const app = express();
app.use(express.json());
app.use('/api/work-entries', workEntryRoutes);
app.use('/api/reports', reportRoutes);

function run(sql, params) {
  return new Promise((resolve, reject) => {
    getDatabase().run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });
  });
}

describe('Legacy work entry dates', () => {
  let clientId;
  let legacyId;

  beforeAll(async () => {
    await initializeDatabase();
    await run('INSERT INTO users (email) VALUES (?)', [email]);
    clientId = await run('INSERT INTO clients (name, user_email) VALUES (?, ?)', ['Calendar client', email]);
    for (const date of [Date.UTC(2011, 11, 30), '2024-01-01', Date.UTC(2024, 1, 29)]) {
      legacyId = await run(
        'INSERT INTO work_entries (client_id, user_email, hours, date) VALUES (?, ?, ?, ?)',
        [clientId, email, 1, date]
      );
    }
  });

  afterAll(closeDatabase);

  test('lists mixed storage formats as calendar dates in chronological order', async () => {
    const paths = ['/api/work-entries', `/api/reports/client/${clientId}`];
    for (const path of paths) {
      const response = await request(app).get(path).set('x-user-email', email).expect(200);
      expect(response.body.workEntries.map(entry => entry.date)).toEqual([
        '2024-02-29', '2024-01-01', '2011-12-30'
      ]);
    }

    const csv = await request(app)
      .get(`/api/reports/export/csv/${clientId}`)
      .set('x-user-email', email)
      .expect(200);
    expect(csv.text.trim().split('\n').slice(1).map(line => line.split(',')[0])).toEqual([
      '2024-02-29', '2024-01-01', '2011-12-30'
    ]);
  });

  test('normalizes a legacy date when fetching or updating a single entry', async () => {
    const entryPath = `/api/work-entries/${legacyId}`;
    const entry = await request(app).get(entryPath).set('x-user-email', email).expect(200);
    expect(entry.body.workEntry.date).toBe('2024-02-29');

    const updated = await request(app)
      .put(entryPath)
      .set('x-user-email', email)
      .send({ hours: 2 })
      .expect(200);
    expect(updated.body.workEntry).toMatchObject({ date: '2024-02-29', hours: 2 });
  });
});
