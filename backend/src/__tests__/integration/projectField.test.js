jest.mock('sqlite3', () => jest.requireActual('sqlite3'));

const request = require('supertest');
const express = require('express');
const workEntryRoutes = require('../../routes/workEntries');
const reportRoutes = require('../../routes/reports');
const { errorHandler } = require('../../middleware/errorHandler');
const { getDatabase, initializeDatabase, closeDatabase } = require('../../database/init');

const app = express();
app.use(express.json());
app.use('/api/work-entries', workEntryRoutes);
app.use('/api/reports', reportRoutes);
app.use(errorHandler);

const USER = 'project-user@example.com';
const OTHER_USER = 'other-user@example.com';

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

async function createClient(userEmail, name) {
  await dbRun('INSERT OR IGNORE INTO users (email) VALUES (?)', [userEmail]);
  const result = await dbRun('INSERT INTO clients (name, user_email) VALUES (?, ?)', [name, userEmail]);
  return result.lastID;
}

function createEntry(body, userEmail = USER) {
  return request(app).post('/api/work-entries').set('x-user-email', userEmail).send(body);
}

describe('Work entry project field (real SQLite)', () => {
  let clientId;
  let otherClientId;
  let foreignClientId;

  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await initializeDatabase();
    clientId = await createClient(USER, 'Acme');
    otherClientId = await createClient(USER, 'Globex');
    foreignClientId = await createClient(OTHER_USER, 'Initech');
  });

  afterAll(async () => {
    await closeDatabase();
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    await dbRun('DELETE FROM work_entries');
  });

  describe('POST /api/work-entries', () => {
    test('stores trimmed project with case preserved and returns full WorkEntry', async () => {
      const res = await createEntry({ clientId, hours: 2, date: '2024-01-15', project: '  Apollo Launch  ' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Work entry created successfully');
      expect(res.body.workEntry).toMatchObject({
        client_id: clientId,
        hours: 2,
        description: null,
        date: '2024-01-15',
        project: 'Apollo Launch',
        client_name: 'Acme'
      });
      expect(res.body.workEntry).toHaveProperty('created_at');
      expect(res.body.workEntry).toHaveProperty('updated_at');
    });

    test('omitted project is stored as NULL and key is present', async () => {
      const res = await createEntry({ clientId, hours: 1, date: '2024-01-15' });

      expect(res.status).toBe(201);
      expect(res.body.workEntry).toHaveProperty('project', null);
    });

    test.each(['', '   '])('blank project %p is stored as NULL', async (project) => {
      const res = await createEntry({ clientId, hours: 1, date: '2024-01-15', project });

      expect(res.status).toBe(201);
      expect(res.body.workEntry.project).toBeNull();
      const row = await dbGet('SELECT project FROM work_entries WHERE id = ?', [res.body.workEntry.id]);
      expect(row.project).toBeNull();
    });

    test.each([
      ['null', null],
      ['number', 42],
      ['boolean', true],
      ['array', ['a']],
      ['object', { name: 'a' }],
      ['too long', 'x'.repeat(201)]
    ])('rejects %s project with 400 Validation error', async (_label, project) => {
      const res = await createEntry({ clientId, hours: 1, date: '2024-01-15', project });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(Array.isArray(res.body.details)).toBe(true);
    });

    test('accepts a 200-character project after trimming', async () => {
      const project = 'p'.repeat(200);
      const res = await createEntry({ clientId, hours: 1, date: '2024-01-15', project: `  ${project}  ` });

      expect(res.status).toBe(201);
      expect(res.body.workEntry.project).toBe(project);
    });

    test.each(['2024-01-15', '2024-01-15T10:30:00.000Z', '2024-01-15T10:30:00+05:30', '2024'])(
      'stores date %p verbatim as a string',
      async (date) => {
        const res = await createEntry({ clientId, hours: 1, date });

        expect(res.status).toBe(201);
        expect(res.body.workEntry.date).toBe(date);

        const fetched = await request(app)
          .get(`/api/work-entries/${res.body.workEntry.id}`)
          .set('x-user-email', USER);
        expect(fetched.body.workEntry.date).toBe(date);
      }
    );

    test.each([['numeric timestamp', 1705276800000], ['invalid string', 'not-a-date']])(
      'rejects %s date',
      async (_label, date) => {
        const res = await createEntry({ clientId, hours: 1, date });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation error');
      }
    );

    test('rejects a client owned by another user', async () => {
      const res = await createEntry({ clientId: foreignClientId, hours: 1, date: '2024-01-15', project: 'X' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Client not found or does not belong to user' });
    });
  });

  describe('PUT /api/work-entries/:id', () => {
    let entryId;

    beforeEach(async () => {
      const res = await createEntry({ clientId, hours: 3, date: '2024-02-01', description: 'Work', project: 'Apollo' });
      entryId = res.body.workEntry.id;
    });

    function update(body, userEmail = USER) {
      return request(app).put(`/api/work-entries/${entryId}`).set('x-user-email', userEmail).send(body);
    }

    test('body with only project is valid and updates it (trimmed)', async () => {
      const res = await update({ project: '  Gemini ' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Work entry updated successfully');
      expect(res.body.workEntry).toMatchObject({ project: 'Gemini', hours: 3, description: 'Work', date: '2024-02-01' });
    });

    test.each(['', '  '])('project %p clears to NULL', async (project) => {
      const res = await update({ project });

      expect(res.status).toBe(200);
      expect(res.body.workEntry.project).toBeNull();
    });

    test('omitted project leaves it unchanged', async () => {
      const res = await update({ hours: 5 });

      expect(res.status).toBe(200);
      expect(res.body.workEntry).toMatchObject({ hours: 5, project: 'Apollo' });
    });

    test('date update is stored verbatim', async () => {
      const res = await update({ date: '2024-03-04T08:00:00.000Z' });

      expect(res.status).toBe(200);
      expect(res.body.workEntry.date).toBe('2024-03-04T08:00:00.000Z');
    });

    test.each([['null', null], ['number', 7], ['too long', 'y'.repeat(201)]])(
      'rejects %s project',
      async (_label, project) => {
        const res = await update({ project });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation error');
      }
    );

    test('rejects empty body', async () => {
      const res = await update({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    test('cannot update another user\'s entry', async () => {
      const res = await update({ project: 'Hijack' }, OTHER_USER);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Work entry not found' });
      const row = await dbGet('SELECT project FROM work_entries WHERE id = ?', [entryId]);
      expect(row.project).toBe('Apollo');
    });
  });

  describe('GET /api/work-entries ?project= filter', () => {
    beforeEach(async () => {
      await createEntry({ clientId, hours: 1, date: '2024-01-01', project: 'Apollo' });
      await createEntry({ clientId, hours: 2, date: '2024-01-02', project: 'apollo' });
      await createEntry({ clientId: otherClientId, hours: 3, date: '2024-01-03', project: 'Apollo' });
      await createEntry({ clientId, hours: 4, date: '2024-01-04' });
      await createEntry({ clientId, hours: 5, date: '2024-01-05', project: 'Apollo Extended' });
      await createEntry({ clientId: foreignClientId, hours: 6, date: '2024-01-06', project: 'Apollo' }, OTHER_USER);
    });

    function list(query) {
      return request(app).get('/api/work-entries').query(query).set('x-user-email', USER);
    }

    test('no filter returns all own entries (tagged and untagged) with project key', async () => {
      const res = await list({});

      expect(res.status).toBe(200);
      expect(res.body.workEntries).toHaveLength(5);
      res.body.workEntries.forEach((entry) => {
        expect(entry).toHaveProperty('project');
        expect(entry).toHaveProperty('client_name');
      });
    });

    test.each(['', '   '])('blank filter %p means no filter', async (project) => {
      const res = await list({ project });

      expect(res.status).toBe(200);
      expect(res.body.workEntries).toHaveLength(5);
    });

    test('exact, case-sensitive match on trimmed value', async () => {
      const res = await list({ project: '  Apollo ' });

      expect(res.status).toBe(200);
      expect(res.body.workEntries.map((e) => e.hours).sort()).toEqual([1, 3]);
      res.body.workEntries.forEach((entry) => expect(entry.project).toBe('Apollo'));
    });

    test('combines with clientId filter', async () => {
      const res = await list({ project: 'Apollo', clientId: otherClientId });

      expect(res.status).toBe(200);
      expect(res.body.workEntries).toHaveLength(1);
      expect(res.body.workEntries[0]).toMatchObject({ hours: 3, client_name: 'Globex' });
    });

    test('wildcards are not interpreted', async () => {
      const res = await list({ project: 'Apollo%' });

      expect(res.status).toBe(200);
      expect(res.body.workEntries).toEqual([]);
    });

    test('no matches returns empty list', async () => {
      const res = await list({ project: 'Nope' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ workEntries: [] });
    });

    test.each([
      ['repeated parameter', '?project=Apollo&project=apollo'],
      ['array parameter', '?project[]=Apollo'],
      ['object parameter', '?project[a]=Apollo'],
      ['too long', `?project=${'z'.repeat(201)}`]
    ])('rejects %s with Invalid project filter', async (_label, qs) => {
      const res = await request(app).get(`/api/work-entries${qs}`).set('x-user-email', USER);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid project filter' });
    });
  });

  describe('GET /api/reports/client/:clientId ?project= filter', () => {
    beforeEach(async () => {
      await createEntry({ clientId, hours: 1.5, date: '2024-01-01', project: 'Apollo' });
      await createEntry({ clientId, hours: 2.25, date: '2024-01-02', project: 'Apollo' });
      await createEntry({ clientId, hours: 4, date: '2024-01-03', project: 'Gemini' });
      await createEntry({ clientId, hours: 8, date: '2024-01-04' });
      await createEntry({ clientId: otherClientId, hours: 10, date: '2024-01-05', project: 'Apollo' });
    });

    function report(id, query = {}) {
      return request(app).get(`/api/reports/client/${id}`).query(query).set('x-user-email', USER);
    }

    test('without filter includes project on every entry and totals all entries', async () => {
      const res = await report(clientId);

      expect(res.status).toBe(200);
      expect(res.body.client).toEqual({ id: clientId, name: 'Acme' });
      expect(res.body.entryCount).toBe(4);
      expect(res.body.totalHours).toBeCloseTo(15.75);
      res.body.workEntries.forEach((entry) => {
        expect(Object.keys(entry).sort()).toEqual(
          ['created_at', 'date', 'description', 'hours', 'id', 'project', 'updated_at']
        );
        expect(typeof entry.date).toBe('string');
      });
    });

    test('filter restricts entries and totals to the filtered set', async () => {
      const res = await report(clientId, { project: ' Apollo ' });

      expect(res.status).toBe(200);
      expect(res.body.entryCount).toBe(2);
      expect(res.body.workEntries).toHaveLength(2);
      expect(res.body.totalHours).toBeCloseTo(3.75);
      res.body.workEntries.forEach((entry) => expect(entry.project).toBe('Apollo'));
    });

    test('blank filter means no filter', async () => {
      const res = await report(clientId, { project: '  ' });

      expect(res.status).toBe(200);
      expect(res.body.entryCount).toBe(4);
    });

    test('valid filter with no matches returns empty report', async () => {
      const res = await report(clientId, { project: 'apollo' });

      expect(res.status).toBe(200);
      expect(res.body.workEntries).toEqual([]);
      expect(res.body.totalHours).toBe(0);
      expect(res.body.entryCount).toBe(0);
    });

    test.each([
      ['repeated parameter', '?project=a&project=b'],
      ['too long', `?project=${'q'.repeat(201)}`]
    ])('rejects %s with Invalid project filter', async (_label, qs) => {
      const res = await request(app).get(`/api/reports/client/${clientId}${qs}`).set('x-user-email', USER);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid project filter' });
    });

    test('foreign client is 404', async () => {
      const res = await report(foreignClientId, { project: 'Apollo' });

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Client not found' });
    });
  });
});
