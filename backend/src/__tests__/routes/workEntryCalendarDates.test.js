const request = require('supertest');
const express = require('express');
const { getDatabase, initializeDatabase, closeDatabase } = require('../../database/init');
const clientRoutes = require('../../routes/clients');
const workEntryRoutes = require('../../routes/workEntries');
const reportRoutes = require('../../routes/reports');
const { errorHandler } = require('../../middleware/errorHandler');

jest.unmock('sqlite3');

const app = express();
app.use(express.json());
app.use('/api/clients', clientRoutes);
app.use('/api/work-entries', workEntryRoutes);
app.use('/api/reports', reportRoutes);
app.use(errorHandler);

const userEmail = 'dates@example.com';

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().run(sql, params, err => (err ? reject(err) : resolve()));
  });
}

describe('work-entry calendar dates with SQLite', () => {
  let clientId;

  beforeEach(async () => {
    await initializeDatabase();
    const response = await request(app).post('/api/clients')
      .set('x-user-email', userEmail).send({ name: 'Date client' }).expect(201);
    clientId = response.body.client.id;
  });

  afterEach(closeDatabase);

  function createEntry(date, hours = 1) {
    return request(app).post('/api/work-entries').set('x-user-email', userEmail)
      .send({ clientId, hours, date });
  }

  function storedDates() {
    return new Promise((resolve, reject) => {
      getDatabase().all(
        'SELECT date FROM work_entries WHERE client_id = ? AND user_email = ? ORDER BY date DESC',
        [clientId, userEmail],
        (err, rows) => (err ? reject(err) : resolve(rows.map(row => row.date)))
      );
    });
  }

  it('round-trips and sorts calendar dates across a month boundary in the report', async () => {
    const later = await createEntry('2024-03-01', 2).expect(201);
    const earlier = await createEntry('2024-02-29', 3).expect(201);
    expect(later.body.workEntry.date).toBe('2024-03-01');
    expect(earlier.body.workEntry.date).toBe('2024-02-29');
    expect(await storedDates()).toEqual(['2024-03-01', '2024-02-29']);

    const report = await request(app).get(`/api/reports/client/${clientId}`)
      .set('x-user-email', userEmail).expect(200);
    expect(report.body.workEntries.map(entry => entry.date)).toEqual(['2024-03-01', '2024-02-29']);
    expect(report.body.totalHours).toBe(5);
  });

  it('keeps the calendar date when updating across a year boundary', async () => {
    const created = await createEntry('2024-12-31').expect(201);
    const url = `/api/work-entries/${created.body.workEntry.id}`;
    const updated = await request(app).put(url).set('x-user-email', userEmail)
      .send({ date: '2025-01-01' }).expect(200);
    expect(updated.body.workEntry.date).toBe('2025-01-01');

    const fetched = await request(app).get(url).set('x-user-email', userEmail).expect(200);
    expect(fetched.body.workEntry.date).toBe('2025-01-01');
  });

  it.each(['2023-02-29', '2024-04-31', '2024-03-01T00:00:00+14:00'])('rejects %s on create and update', async date => {
    await createEntry(date).expect(400);

    const created = await createEntry('2024-03-01').expect(201);
    await request(app).put(`/api/work-entries/${created.body.workEntry.id}`)
      .set('x-user-email', userEmail).send({ date }).expect(400);
  });

  it('converts legacy epoch milliseconds without changing existing text dates', async () => {
    for (const date of ['2024-02-29', Date.UTC(2024, 2, 1), -1]) {
      await run('INSERT INTO work_entries (client_id, user_email, hours, date) VALUES (?, ?, ?, ?)',
        [clientId, userEmail, 1, date]);
    }
    await run('DELETE FROM schema_migrations WHERE version = 4');
    await initializeDatabase();
    await initializeDatabase();

    expect(await storedDates()).toEqual(['2024-03-01', '2024-02-29', '1969-12-31']);
  });

  function storedRows() {
    return new Promise((resolve, reject) => {
      getDatabase().all(
        'SELECT typeof(date) AS type, date FROM work_entries WHERE client_id = ? AND user_email = ? ORDER BY id',
        [clientId, userEmail],
        (err, rows) => (err ? reject(err) : resolve(rows))
      );
    });
  }

  async function insertLegacyDates(dates) {
    for (const date of dates) {
      await run('INSERT INTO work_entries (client_id, user_email, hours, date) VALUES (?, ?, ?, ?)',
        [clientId, userEmail, 1, date]);
    }
    return new Promise((resolve, reject) => {
      getDatabase().all('SELECT id FROM work_entries WHERE client_id = ? ORDER BY id', [clientId],
        (err, rows) => (err ? reject(err) : resolve(rows.map(row => row.id))));
    });
  }

  const lastMsOfLeapDay = Date.UTC(2024, 1, 29, 23, 59, 59, 999);
  const fractionalMs = Date.UTC(2024, 2, 1) + 0.5;
  const outOfRange = 1e20;

  it('reads epoch-millisecond edge cases as UTC calendar dates before migration', async () => {
    const ids = await insertLegacyDates([0, lastMsOfLeapDay, fractionalMs, outOfRange, 'not-a-date']);

    const dates = [];
    for (const id of ids) {
      const response = await request(app).get(`/api/work-entries/${id}`)
        .set('x-user-email', userEmail).expect(200);
      dates.push(response.body.workEntry.date);
    }

    expect(dates).toEqual(['1970-01-01', '2024-02-29', '2024-03-01', null, 'not-a-date']);
  });

  it('migrates convertible epoch values to text and leaves unconvertible values unchanged', async () => {
    await insertLegacyDates([0, lastMsOfLeapDay, fractionalMs, outOfRange, 'not-a-date']);
    await run('DELETE FROM schema_migrations WHERE version = 4');
    await initializeDatabase();

    expect(await storedRows()).toEqual([
      { type: 'text', date: '1970-01-01' },
      { type: 'text', date: '2024-02-29' },
      { type: 'text', date: '2024-03-01' },
      { type: 'real', date: outOfRange },
      { type: 'text', date: 'not-a-date' }
    ]);
  });
});
