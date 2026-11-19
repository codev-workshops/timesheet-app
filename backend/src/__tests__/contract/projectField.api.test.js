// Contract acceptance suite for the `project` field (CONTRACT.md, v1 frozen).
// Derived solely from CONTRACT.md; exercises the real routes, auth middleware
// and an in-memory SQLite database end to end.
jest.mock('sqlite3', () => jest.requireActual('sqlite3'));

const request = require('supertest');
const express = require('express');
const { initializeDatabase, closeDatabase } = require('../../database/init');
const { errorHandler } = require('../../middleware/errorHandler');
const clientRoutes = require('../../routes/clients');
const workEntryRoutes = require('../../routes/workEntries');
const reportRoutes = require('../../routes/reports');

const app = express();
app.use(express.json());
app.use('/api/clients', clientRoutes);
app.use('/api/work-entries', workEntryRoutes);
app.use('/api/reports', reportRoutes);
app.use(errorHandler);

const WORK_ENTRY_KEYS = [
  'client_id', 'client_name', 'created_at', 'date', 'description',
  'hours', 'id', 'project', 'updated_at'
];
const REPORT_ENTRY_KEYS = [
  'created_at', 'date', 'description', 'hours', 'id', 'project', 'updated_at'
];
const INVALID_PROJECT_VALUES = [
  ['null', null],
  ['number', 42],
  ['boolean', true],
  ['array', ['Alpha']],
  ['object', { name: 'Alpha' }]
];

let userSeq = 0;
const newUser = () => `contract-user-${++userSeq}@example.com`;

const as = (email) => ({
  get: (url) => request(app).get(url).set('x-user-email', email),
  post: (url, body) => request(app).post(url).set('x-user-email', email).send(body),
  put: (url, body) => request(app).put(url).set('x-user-email', email).send(body)
});

async function createClient(email, name = 'Acme Corp') {
  const res = await as(email).post('/api/clients', { name });
  expect(res.status).toBe(201);
  return res.body.client.id;
}

async function createEntry(email, clientId, extra = {}) {
  const res = await as(email).post('/api/work-entries', {
    clientId, hours: 1, date: '2024-03-15', ...extra
  });
  expect(res.status).toBe(201);
  return res.body.workEntry;
}

function expectWorkEntryShape(entry) {
  expect(Object.keys(entry).sort()).toEqual(WORK_ENTRY_KEYS);
  expect(typeof entry.id).toBe('number');
  expect(typeof entry.client_id).toBe('number');
  expect(typeof entry.hours).toBe('number');
  expect(typeof entry.date).toBe('string');
  expect(typeof entry.created_at).toBe('string');
  expect(typeof entry.updated_at).toBe('string');
  expect(typeof entry.client_name).toBe('string');
  expect(entry.project === null || typeof entry.project === 'string').toBe(true);
  expect(entry.description === null || typeof entry.description === 'string').toBe(true);
}

function expectValidationError(res) {
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('Validation error');
  if (res.body.details !== undefined) {
    expect(Array.isArray(res.body.details)).toBe(true);
    res.body.details.forEach((d) => expect(typeof d).toBe('string'));
  }
}

const ids = (entries) => entries.map((e) => e.id).sort((a, b) => a - b);

beforeAll(async () => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await initializeDatabase();
});

afterAll(async () => {
  await closeDatabase();
  jest.restoreAllMocks();
});

describe('Contract: authentication on all project-field routes', () => {
  const routes = [
    ['get', '/api/work-entries'],
    ['get', '/api/work-entries?project=Alpha'],
    ['get', '/api/work-entries/1'],
    ['post', '/api/work-entries'],
    ['put', '/api/work-entries/1'],
    ['get', '/api/reports/client/1'],
    ['get', '/api/reports/client/1?project=Alpha']
  ];

  test.each(routes)('%s %s without x-user-email -> 401', async (method, url) => {
    const res = await request(app)[method](url).send({ project: 'Alpha' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'User email required in x-user-email header' });
  });

  test.each(routes)('%s %s with malformed x-user-email -> 400', async (method, url) => {
    const res = await request(app)[method](url)
      .set('x-user-email', 'not-an-email')
      .send({ project: 'Alpha' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid email format' });
  });
});

describe('Contract: POST /api/work-entries', () => {
  let user;
  let clientId;

  beforeAll(async () => {
    user = newUser();
    clientId = await createClient(user);
  });

  test('201 envelope with full WorkEntry including trimmed, case-preserved project', async () => {
    const res = await as(user).post('/api/work-entries', {
      clientId, hours: 2.5, date: '2024-03-15', description: 'Work', project: '  Project ALPHA  '
    });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['message', 'workEntry']);
    expect(res.body.message).toBe('Work entry created successfully');
    expectWorkEntryShape(res.body.workEntry);
    expect(res.body.workEntry).toMatchObject({
      client_id: clientId,
      client_name: 'Acme Corp',
      hours: 2.5,
      description: 'Work',
      date: '2024-03-15',
      project: 'Project ALPHA'
    });
  });

  test('omitted project -> project key present and null (backwards compatible)', async () => {
    const res = await as(user).post('/api/work-entries', { clientId, hours: 1, date: '2024-03-15' });
    expect(res.status).toBe(201);
    expectWorkEntryShape(res.body.workEntry);
    expect(res.body.workEntry.project).toBeNull();
  });

  test.each([['empty string', ''], ['whitespace only', '   ']])(
    '%s project is stored as null', async (_label, project) => {
      const entry = await createEntry(user, clientId, { project });
      expect(entry.project).toBeNull();
      const res = await as(user).get(`/api/work-entries/${entry.id}`);
      expect(res.body.workEntry.project).toBeNull();
    }
  );

  test('project of exactly 200 characters after trimming is accepted', async () => {
    const value = 'p'.repeat(200);
    const entry = await createEntry(user, clientId, { project: `   ${value}   ` });
    expect(entry.project).toBe(value);
  });

  test('project longer than 200 characters after trimming -> 400 validation error', async () => {
    const res = await as(user).post('/api/work-entries', {
      clientId, hours: 1, date: '2024-03-15', project: 'p'.repeat(201)
    });
    expectValidationError(res);
  });

  test.each(INVALID_PROJECT_VALUES)('%s project -> 400 validation error', async (_label, project) => {
    const res = await as(user).post('/api/work-entries', {
      clientId, hours: 1, date: '2024-03-15', project
    });
    expectValidationError(res);
  });

  test.each([
    ['date only', '2024-03-15'],
    ['UTC timestamp', '2024-03-15T10:30:00.000Z'],
    ['offset timestamp', '2024-03-15T23:30:00+05:30']
  ])('date (%s) is stored and returned verbatim', async (_label, date) => {
    const entry = await createEntry(user, clientId, { date, project: 'Dates' });
    expect(entry.date).toBe(date);
    const res = await as(user).get(`/api/work-entries/${entry.id}`);
    expect(res.body.workEntry.date).toBe(date);
  });

  test('client of another user -> 400 with existing error string', async () => {
    const otherClient = await createClient(newUser(), 'Other Co');
    const res = await as(user).post('/api/work-entries', {
      clientId: otherClient, hours: 1, date: '2024-03-15', project: 'Alpha'
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Client not found or does not belong to user' });
  });
});

describe('Contract: PUT /api/work-entries/:id', () => {
  let user;
  let clientId;

  beforeAll(async () => {
    user = newUser();
    clientId = await createClient(user);
  });

  test('body with only project is valid; other fields unchanged', async () => {
    const created = await createEntry(user, clientId, {
      hours: 3, description: 'Keep me', date: '2024-05-01', project: 'Old'
    });
    const res = await as(user).put(`/api/work-entries/${created.id}`, { project: '  New Project  ' });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['message', 'workEntry']);
    expect(res.body.message).toBe('Work entry updated successfully');
    expectWorkEntryShape(res.body.workEntry);
    expect(res.body.workEntry).toMatchObject({
      id: created.id,
      client_id: clientId,
      hours: 3,
      description: 'Keep me',
      date: '2024-05-01',
      project: 'New Project'
    });
  });

  test('omitted project leaves project unchanged', async () => {
    const created = await createEntry(user, clientId, { project: 'Sticky' });
    const res = await as(user).put(`/api/work-entries/${created.id}`, { hours: 4 });
    expect(res.status).toBe(200);
    expect(res.body.workEntry.hours).toBe(4);
    expect(res.body.workEntry.project).toBe('Sticky');
  });

  test.each([['empty string', ''], ['whitespace only', '   ']])(
    '%s project clears project to null', async (_label, project) => {
      const created = await createEntry(user, clientId, { project: 'ToClear' });
      const res = await as(user).put(`/api/work-entries/${created.id}`, { project });
      expect(res.status).toBe(200);
      expect(res.body.workEntry.project).toBeNull();
      const get = await as(user).get(`/api/work-entries/${created.id}`);
      expect(get.body.workEntry.project).toBeNull();
    }
  );

  test('date update is stored and returned verbatim', async () => {
    const created = await createEntry(user, clientId);
    const date = '2024-06-30T08:15:00.000Z';
    const res = await as(user).put(`/api/work-entries/${created.id}`, { date });
    expect(res.status).toBe(200);
    expect(res.body.workEntry.date).toBe(date);
  });

  test('empty body -> 400 validation error', async () => {
    const created = await createEntry(user, clientId);
    const res = await as(user).put(`/api/work-entries/${created.id}`, {});
    expectValidationError(res);
  });

  test.each(INVALID_PROJECT_VALUES)('%s project -> 400 and entry unchanged', async (_label, project) => {
    const created = await createEntry(user, clientId, { project: 'Unchanged' });
    const res = await as(user).put(`/api/work-entries/${created.id}`, { project });
    expectValidationError(res);
    const get = await as(user).get(`/api/work-entries/${created.id}`);
    expect(get.body.workEntry.project).toBe('Unchanged');
  });

  test('project longer than 200 characters after trimming -> 400', async () => {
    const created = await createEntry(user, clientId);
    const res = await as(user).put(`/api/work-entries/${created.id}`, { project: 'q'.repeat(201) });
    expectValidationError(res);
  });

  test("another user's entry -> 404 and entry unchanged", async () => {
    const created = await createEntry(user, clientId, { project: 'Mine' });
    const res = await as(newUser()).put(`/api/work-entries/${created.id}`, { project: 'Hijacked' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Work entry not found' });
    const get = await as(user).get(`/api/work-entries/${created.id}`);
    expect(get.body.workEntry.project).toBe('Mine');
  });

  test('non-numeric id -> 400 Invalid work entry ID', async () => {
    const res = await as(user).put('/api/work-entries/abc', { project: 'Alpha' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid work entry ID' });
  });
});

describe('Contract: GET /api/work-entries/:id', () => {
  test('200 { workEntry } with project and client_name', async () => {
    const user = newUser();
    const clientId = await createClient(user, 'Single Co');
    const created = await createEntry(user, clientId, { project: 'Alpha' });
    const res = await as(user).get(`/api/work-entries/${created.id}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['workEntry']);
    expectWorkEntryShape(res.body.workEntry);
    expect(res.body.workEntry).toMatchObject({ project: 'Alpha', client_name: 'Single Co' });
  });

  test("another user's entry -> 404", async () => {
    const user = newUser();
    const created = await createEntry(user, await createClient(user));
    const res = await as(newUser()).get(`/api/work-entries/${created.id}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Work entry not found' });
  });

  test('non-numeric id -> 400 Invalid work entry ID', async () => {
    const res = await as(newUser()).get('/api/work-entries/abc');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid work entry ID' });
  });
});

describe('Contract: GET /api/work-entries ?project= filter', () => {
  let user;
  let clientA;
  let clientB;
  const e = {};

  beforeAll(async () => {
    user = newUser();
    clientA = await createClient(user, 'Client A');
    clientB = await createClient(user, 'Client B');
    e.alphaA = await createEntry(user, clientA, { project: 'Alpha' });
    e.alphaB = await createEntry(user, clientB, { project: 'Alpha' });
    e.lowerAlpha = await createEntry(user, clientA, { project: 'alpha' });
    e.alphabet = await createEntry(user, clientA, { project: 'Alphabet' });
    e.beta = await createEntry(user, clientA, { project: 'Beta' });
    e.untagged = await createEntry(user, clientA);

    const other = newUser();
    await createEntry(other, await createClient(other), { project: 'Alpha' });
  });

  const list = (query = '') => as(user).get(`/api/work-entries${query}`);
  const allIds = () => ids(Object.values(e));

  test('no filter -> 200 { workEntries } with tagged and untagged entries, own user only', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(['workEntries']);
    expect(ids(res.body.workEntries)).toEqual(allIds());
    res.body.workEntries.forEach(expectWorkEntryShape);
    expect(res.body.workEntries.find((w) => w.id === e.untagged.id).project).toBeNull();
  });

  test.each([['empty', '?project='], ['whitespace', '?project=%20%20%20']])(
    'blank filter (%s) -> no filter', async (_label, query) => {
      const res = await list(query);
      expect(res.status).toBe(200);
      expect(ids(res.body.workEntries)).toEqual(allIds());
    }
  );

  test('exact match returns only matching entries for the current user', async () => {
    const res = await list('?project=Alpha');
    expect(res.status).toBe(200);
    expect(ids(res.body.workEntries)).toEqual(ids([e.alphaA, e.alphaB]));
    res.body.workEntries.forEach((w) => {
      expectWorkEntryShape(w);
      expect(w.project).toBe('Alpha');
    });
  });

  test('filter value is trimmed', async () => {
    const res = await list('?project=%20%20Alpha%20%20');
    expect(res.status).toBe(200);
    expect(ids(res.body.workEntries)).toEqual(ids([e.alphaA, e.alphaB]));
  });

  test('match is case-sensitive', async () => {
    const lower = await list('?project=alpha');
    expect(ids(lower.body.workEntries)).toEqual(ids([e.lowerAlpha]));
    const upper = await list('?project=ALPHA');
    expect(upper.status).toBe(200);
    expect(upper.body.workEntries).toEqual([]);
  });

  test.each([
    ['prefix', 'Alp'],
    ['percent wildcard', 'Alpha%25'],
    ['underscore wildcard', 'Alph_'],
    ['bare percent', '%25'],
    ['quote injection', "'%20OR%20'1'%3D'1"]
  ])('no substring/wildcard matching (%s) -> 200 []', async (_label, value) => {
    const res = await list(`?project=${value}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ workEntries: [] });
  });

  test('combined with clientId', async () => {
    const res = await list(`?clientId=${clientB}&project=Alpha`);
    expect(res.status).toBe(200);
    expect(ids(res.body.workEntries)).toEqual(ids([e.alphaB]));
  });

  test('valid filter with no matches -> 200 empty list', async () => {
    const res = await list('?project=Nonexistent');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ workEntries: [] });
  });

  test('filter of exactly 200 characters after trimming is accepted', async () => {
    const res = await list(`?project=%20${'x'.repeat(200)}%20`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ workEntries: [] });
  });

  test.each([
    ['repeated parameter', '?project=Alpha&project=Beta'],
    ['array parameter', '?project[]=Alpha'],
    ['longer than 200 characters', `?project=${'x'.repeat(201)}`]
  ])('%s -> 400 Invalid project filter', async (_label, query) => {
    const res = await list(query);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid project filter' });
  });

  test('invalid clientId keeps existing error', async () => {
    const res = await list('?clientId=abc&project=Alpha');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid client ID' });
  });
});

describe('Contract: GET /api/reports/client/:clientId ?project= filter', () => {
  let user;
  let clientId;
  const e = {};

  beforeAll(async () => {
    user = newUser();
    clientId = await createClient(user, 'Report Co');
    e.alpha1 = await createEntry(user, clientId, { project: 'Alpha', hours: 1.5 });
    e.alpha2 = await createEntry(user, clientId, { project: 'Alpha', hours: 2 });
    e.beta = await createEntry(user, clientId, { project: 'Beta', hours: 3.25 });
    e.untagged = await createEntry(user, clientId, { hours: 4 });
    // Same project on another client of the same user must not leak in.
    await createEntry(user, await createClient(user, 'Elsewhere'), { project: 'Alpha', hours: 10 });
  });

  const report = (query = '') => as(user).get(`/api/reports/client/${clientId}${query}`);

  function expectReportShape(body) {
    expect(Object.keys(body).sort()).toEqual(['client', 'entryCount', 'totalHours', 'workEntries']);
    expect(body.client).toEqual({ id: clientId, name: 'Report Co' });
    expect(Array.isArray(body.workEntries)).toBe(true);
    body.workEntries.forEach((w) => {
      expect(Object.keys(w).sort()).toEqual(REPORT_ENTRY_KEYS);
      expect(typeof w.hours).toBe('number');
      expect(typeof w.date).toBe('string');
      expect(w.project === null || typeof w.project === 'string').toBe(true);
    });
    expect(body.entryCount).toBe(body.workEntries.length);
    const sum = body.workEntries.reduce((s, w) => s + w.hours, 0);
    expect(body.totalHours).toBeCloseTo(sum, 5);
  }

  test('no filter -> all entries (tagged and untagged)', async () => {
    const res = await report();
    expect(res.status).toBe(200);
    expectReportShape(res.body);
    expect(ids(res.body.workEntries)).toEqual(ids(Object.values(e)));
    expect(res.body.totalHours).toBeCloseTo(10.75, 5);
    expect(res.body.entryCount).toBe(4);
  });

  test.each([['empty', '?project='], ['whitespace', '?project=%20%20']])(
    'blank filter (%s) -> no filter', async (_label, query) => {
      const res = await report(query);
      expect(res.status).toBe(200);
      expect(res.body.entryCount).toBe(4);
    }
  );

  test('exact filter -> filtered entries, totals over filtered set', async () => {
    const res = await report('?project=%20Alpha%20');
    expect(res.status).toBe(200);
    expectReportShape(res.body);
    expect(ids(res.body.workEntries)).toEqual(ids([e.alpha1, e.alpha2]));
    expect(res.body.totalHours).toBeCloseTo(3.5, 5);
    expect(res.body.entryCount).toBe(2);
  });

  test.each([['case mismatch', 'alpha'], ['prefix', 'Alp'], ['wildcard', 'Al%25'], ['no such project', 'Gamma']])(
    'no match (%s) -> empty report with zero totals', async (_label, value) => {
      const res = await report(`?project=${value}`);
      expect(res.status).toBe(200);
      expectReportShape(res.body);
      expect(res.body.workEntries).toEqual([]);
      expect(res.body.totalHours).toBe(0);
      expect(res.body.entryCount).toBe(0);
    }
  );

  test.each([
    ['repeated parameter', '?project=Alpha&project=Beta'],
    ['array parameter', '?project[]=Alpha'],
    ['longer than 200 characters', `?project=${'x'.repeat(201)}`]
  ])('%s -> 400 Invalid project filter', async (_label, query) => {
    const res = await report(query);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid project filter' });
  });

  test("another user's client -> 404 Client not found", async () => {
    const res = await as(newUser()).get(`/api/reports/client/${clientId}?project=Alpha`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Client not found' });
  });

  test('non-numeric client id -> 400 Invalid client ID', async () => {
    const res = await as(user).get('/api/reports/client/abc?project=Alpha');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid client ID' });
  });

  test('CSV export is unchanged and ignores ?project=', async () => {
    const res = await as(user)
      .get(`/api/reports/export/csv/${clientId}?project=Alpha`)
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.on('data', (chunk) => { data += chunk; });
        r.on('end', () => cb(null, data));
      });
    expect(res.status).toBe(200);
    const lines = res.body.trim().split('\n');
    expect(lines[0]).toBe('Date,Hours,Description,Created At');
    expect(lines).toHaveLength(1 + 4);
  });
});
