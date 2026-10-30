// End-to-end check of the weekly cap against a real in-memory SQLite database.
// Unlike the route tests (which mock db.get/db.run), this verifies the storage assumption the
// cap relies on: work_entries.date is stored as epoch ms and the week-range SUM query finds the
// rows it is supposed to.
jest.unmock('sqlite3');

const request = require('supertest');
const express = require('express');

jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = req.get('x-user-email') || 'alice@example.com';
    next();
  }
}));

const { initializeDatabase, getDatabase, closeDatabase } = require('../../database/init');
const { errorHandler } = require('../../middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api/clients', require('../../routes/clients'));
app.use('/api/work-entries', require('../../routes/workEntries'));
app.use('/api/reports', require('../../routes/reports'));
app.use(errorHandler);

const run = (sql, params = []) =>
  new Promise((resolve, reject) => getDatabase().run(sql, params, (err) => (err ? reject(err) : resolve())));
const get = (sql, params = []) =>
  new Promise((resolve, reject) => getDatabase().get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));

describe('Weekly cap (real SQLite)', () => {
  let clientId;

  beforeAll(async () => {
    await initializeDatabase();
    await run("INSERT INTO users (email) VALUES ('alice@example.com'), ('bob@example.com')");

    const res = await request(app).post('/api/clients').send({ name: 'Acme', weeklyHoursCap: 10 });
    expect(res.status).toBe(201);
    expect(res.body.client.weekly_hours_cap).toBe(10);
    clientId = res.body.client.id;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('stores work entry dates as epoch milliseconds', async () => {
    const res = await request(app).post('/api/work-entries').send({ clientId, hours: 8, date: '2024-01-17' });
    expect(res.status).toBe(201);

    const row = await get('SELECT date, typeof(date) AS t FROM work_entries WHERE id = ?', [res.body.workEntry.id]);
    expect(row).toEqual({ date: Date.UTC(2024, 0, 17), t: 'integer' });
  });

  test('rejects an entry that pushes the Mon–Sun week past the cap', async () => {
    // 8h already on Wed 17th; +3h on Fri 19th -> 11 > 10
    const res = await request(app).post('/api/work-entries').send({ clientId, hours: 3, date: '2024-01-19' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      'Weekly hours cap exceeded: this entry would bring the week to 11h for this client (cap 10h)'
    );
  });

  test('allows filling the week exactly to the cap, including Sunday', async () => {
    const res = await request(app).post('/api/work-entries').send({ clientId, hours: 2, date: '2024-01-21' });
    expect(res.status).toBe(201);
  });

  test('allows entries in the following week (Monday starts a new bucket)', async () => {
    const res = await request(app).post('/api/work-entries').send({ clientId, hours: 10, date: '2024-01-22' });
    expect(res.status).toBe(201);
  });

  test('PUT excludes the entry itself and still blocks an increase past the cap', async () => {
    const { id } = await get('SELECT id FROM work_entries WHERE hours = 8 AND user_email = ?', ['alice@example.com']);

    expect((await request(app).put(`/api/work-entries/${id}`).send({ hours: 8 })).status).toBe(200);
    expect((await request(app).put(`/api/work-entries/${id}`).send({ hours: 8.5 })).status).toBe(400);
  });

  test('PUT may reduce hours even when the week is already over a lowered cap', async () => {
    await request(app).put(`/api/clients/${clientId}`).send({ weeklyHoursCap: 5 });
    const { id } = await get('SELECT id FROM work_entries WHERE hours = 8 AND user_email = ?', ['alice@example.com']);

    expect((await request(app).put(`/api/work-entries/${id}`).send({ hours: 7 })).status).toBe(200);
    expect((await request(app).put(`/api/work-entries/${id}`).send({ hours: 7.5 })).status).toBe(400);

    await request(app).put(`/api/clients/${clientId}`).send({ weeklyHoursCap: 10 });
    await request(app).put(`/api/work-entries/${id}`).send({ hours: 8 });
  });

  test('cap totals are scoped per user: another user\'s hours do not count', async () => {
    const bobClient = await request(app)
      .post('/api/clients')
      .set('x-user-email', 'bob@example.com')
      .send({ name: 'Acme (Bob)', weeklyHoursCap: 10 });

    // Bob logs 10h in the same week; Alice's own client is unaffected, and Bob cannot touch Alice's client.
    const bobOk = await request(app)
      .post('/api/work-entries')
      .set('x-user-email', 'bob@example.com')
      .send({ clientId: bobClient.body.client.id, hours: 10, date: '2024-01-18' });
    expect(bobOk.status).toBe(201);

    const bobCross = await request(app)
      .post('/api/work-entries')
      .set('x-user-email', 'bob@example.com')
      .send({ clientId, hours: 1, date: '2024-01-18' });
    expect(bobCross.status).toBe(400);
    expect(bobCross.body.error).toBe('Client not found or does not belong to user');

    const alice = await get(
      'SELECT COALESCE(SUM(hours), 0) AS total FROM work_entries WHERE user_email = ? AND client_id = ? AND date >= ? AND date < ?',
      ['alice@example.com', clientId, Date.UTC(2024, 0, 15), Date.UTC(2024, 0, 22)]
    );
    expect(alice.total).toBe(10);
  });

  test('clearing the cap removes the limit', async () => {
    await request(app).put(`/api/clients/${clientId}`).send({ weeklyHoursCap: null });

    const res = await request(app).post('/api/work-entries').send({ clientId, hours: 24, date: '2024-01-18' });
    expect(res.status).toBe(201);
  });

  test('report currentWeek reflects the cap and logged hours', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout'] }).setSystemTime(new Date('2024-01-17T12:00:00Z'));
    await request(app).put(`/api/clients/${clientId}`).send({ weeklyHoursCap: 40 });

    const res = await request(app).get(`/api/reports/client/${clientId}`);
    jest.useRealTimers();

    expect(res.status).toBe(200);
    expect(res.body.currentWeek).toEqual({
      weekStart: '2024-01-15',
      weekEnd: '2024-01-21',
      weeklyHoursCap: 40,
      hoursThisWeek: 34,
      remainingHours: 6
    });
  });
});
