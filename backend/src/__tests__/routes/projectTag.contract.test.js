/**
 * API-level contract tests for docs/contracts/project-tag-v1.md (frozen).
 * Expected behaviors are derived only from the contract and asserted at the
 * HTTP boundary (real routes, auth middleware and error handler) over an
 * in-memory SQLite fixture.
 */

// Override the global sqlite3 mock from setup.js: these tests need a real DB fixture.
jest.mock('sqlite3', () => jest.requireActual('sqlite3'));

const zlib = require('zlib');
const express = require('express');
const request = require('supertest');

const { initializeDatabase, closeDatabase } = require('../../database/init');
const clientRoutes = require('../../routes/clients');
const workEntryRoutes = require('../../routes/workEntries');
const reportRoutes = require('../../routes/reports');
const { errorHandler } = require('../../middleware/errorHandler');

const ALICE = 'alice.project-tag@example.com';
const BOB = 'bob.project-tag@example.com';

// Mirrors the route/error-handler wiring in src/server.js without starting a listener.
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/clients', clientRoutes);
app.use('/api/work-entries', workEntryRoutes);
app.use('/api/reports', reportRoutes);
app.use(errorHandler);

// ---------- helpers ----------

function as(user) {
  return {
    get: (url) => request(app).get(url).set('x-user-email', user),
    post: (url, body) => request(app).post(url).set('x-user-email', user).send(body),
    put: (url, body) => request(app).put(url).set('x-user-email', user).send(body)
  };
}

async function createClient(user, name) {
  const res = await as(user).post('/api/clients', { name });
  expect(res.status).toBe(201);
  return res.body.client.id;
}

async function createEntry(user, body) {
  const res = await as(user).post('/api/work-entries', { hours: 1, date: '2024-03-01', ...body });
  expect(res.status).toBe(201);
  return res.body.workEntry;
}

async function readProject(user, id) {
  const res = await as(user).get(`/api/work-entries/${id}`);
  expect(res.status).toBe(200);
  return res.body.workEntry.project;
}

function expectValidationBody(status, body) {
  expect(status).toBe(400);
  expect(body.error).toBe('Validation error');
  expect(Array.isArray(body.details)).toBe(true);
  expect(body.details.length).toBeGreaterThan(0);
  body.details.forEach((d) => expect(typeof d).toBe('string'));
}

const expectValidationError = (res) => expectValidationBody(res.status, res.body);

const EXISTING_ENTRY_KEYS = ['id', 'client_id', 'hours', 'description', 'date', 'created_at', 'updated_at', 'client_name'];

function expectProjectKey(row) {
  expect(Object.prototype.hasOwnProperty.call(row, 'project')).toBe(true);
  expect(row.project === null || typeof row.project === 'string').toBe(true);
}

function expectWorkEntryShape(entry) {
  EXISTING_ENTRY_KEYS.forEach((k) => expect(entry).toHaveProperty(k));
  expectProjectKey(entry);
}

function binaryParser(res, cb) {
  const chunks = [];
  res.on('data', (c) => chunks.push(Buffer.from(c)));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

function getBinary(user, url) {
  return request(app).get(url).set('x-user-email', user).buffer(true).parse(binaryParser);
}

const jsonOf = (res) => JSON.parse(res.body.toString('utf8'));

// Extracts the text drawn into the exported PDF (hex strings inside TJ arrays of content streams).
function pdfText(buffer) {
  const raw = buffer.toString('latin1');
  const out = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = streamRe.exec(raw)) !== null) {
    let content;
    try {
      content = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch (e) {
      content = m[1];
    }
    const tjRe = /\[([^\]]*)\]\s*TJ/g;
    let t;
    while ((t = tjRe.exec(content)) !== null) {
      const hexes = t[1].match(/<([0-9a-fA-F]*)>/g) || [];
      out.push(hexes.map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('latin1')).join(''));
    }
  }
  return out.join('\n');
}

const csvLines = (buf) => buf.toString('utf8').split(/\r?\n/).filter((l) => l.length > 0);
const CSV_HEADER = 'Date,Hours,Description,Created At';

const EMOJI_50_UNITS = '\u{1F600}'.repeat(25);

// Values the contract requires to be rejected on both POST and PUT.
const INVALID_BODY_PROJECTS = [
  ['over 50 characters after trimming', ` ${'a'.repeat(51)} `],
  ['over 50 UTF-16 code units', `${EMOJI_50_UNITS}a`],
  ['a number', 42],
  ['a boolean', true],
  ['an array', ['Client Launch']],
  ['an object', { name: 'Client Launch' }]
];

// [label, input, stored value]
const NORMALIZED_PROJECTS = [
  ['trimmed, preserving case and internal whitespace', '  Client   LAUNCH v2 \t', 'Client   LAUNCH v2'],
  ['null', null, null],
  ['empty string', '', null],
  ['whitespace-only', '   \t ', null],
  ['50 characters after trimming', `   ${'a'.repeat(50)}   `, 'a'.repeat(50)],
  ['50 UTF-16 code units', EMOJI_50_UNITS, EMOJI_50_UNITS]
];

// Query strings the contract requires to be rejected on report and export routes.
const INVALID_QUERIES = [
  ['empty', 'project='],
  ['whitespace-only', 'project=%20%20%20'],
  ['repeated', 'project=Client%20Launch&project=Client%20Launch'],
  ['structured (object)', 'project[name]=Client%20Launch'],
  ['structured (array)', 'project[]=Client%20Launch'],
  ['over 50 characters after trimming', `project=%20${'a'.repeat(51)}%20`]
];

// ---------- tests ----------

describe('Project tag v1 contract — API', () => {
  let aliceClient;
  let aliceOtherClient;
  let bobClient;

  beforeEach(async () => {
    await closeDatabase();
    await initializeDatabase();
    aliceClient = await createClient(ALICE, 'Alice Client');
    aliceOtherClient = await createClient(ALICE, 'Alice Other');
    bobClient = await createClient(BOB, 'Bob Client');
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('POST /api/work-entries', () => {
    test('omitting project stores NULL and keeps the existing envelope and fields', async () => {
      const res = await as(ALICE).post('/api/work-entries', { clientId: aliceClient, hours: 4.25, date: '2024-03-05' });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Work entry created successfully');
      expectWorkEntryShape(res.body.workEntry);
      expect(res.body.workEntry).toMatchObject({ client_id: aliceClient, client_name: 'Alice Client', hours: 4.25, description: null, project: null });
      expect(await readProject(ALICE, res.body.workEntry.id)).toBeNull();
    });

    test.each(NORMALIZED_PROJECTS)('project %s is stored as specified', async (_label, project, stored) => {
      const res = await as(ALICE).post('/api/work-entries', { clientId: aliceClient, hours: 1, date: '2024-03-01', project });
      expect(res.status).toBe(201);
      expect(res.body.workEntry.project).toBe(stored);
      expect(await readProject(ALICE, res.body.workEntry.id)).toBe(stored);
    });

    test.each(INVALID_BODY_PROJECTS)('rejects project that is %s and creates nothing', async (_label, project) => {
      const res = await as(ALICE).post('/api/work-entries', { clientId: aliceClient, hours: 1, date: '2024-03-01', project });
      expectValidationError(res);
      const list = await as(ALICE).get('/api/work-entries');
      expect(list.body.workEntries).toEqual([]);
    });

    test('a client owned by another user is still rejected with the existing error', async () => {
      const res = await as(ALICE).post('/api/work-entries', { clientId: bobClient, hours: 1, date: '2024-03-01', project: 'Client Launch' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Client not found or does not belong to user' });
    });
  });

  describe('PUT /api/work-entries/:id', () => {
    let entry;

    beforeEach(async () => {
      entry = await createEntry(ALICE, { clientId: aliceClient, project: 'Client Launch', description: 'tagged' });
    });

    test('omitting project keeps the current tag, including when the client changes', async () => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, { hours: 7, description: 'changed' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Work entry updated successfully');
      expectWorkEntryShape(res.body.workEntry);
      expect(res.body.workEntry).toMatchObject({ hours: 7, description: 'changed', project: 'Client Launch' });

      const moved = await as(ALICE).put(`/api/work-entries/${entry.id}`, { clientId: aliceOtherClient });
      expect(moved.status).toBe(200);
      expect(moved.body.workEntry).toMatchObject({ client_id: aliceOtherClient, client_name: 'Alice Other', project: 'Client Launch' });
    });

    test.each(NORMALIZED_PROJECTS)('a body with only project %s is valid and stored as specified', async (_label, project, stored) => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, { project });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Work entry updated successfully');
      expect(res.body.workEntry).toMatchObject({ project: stored, description: 'tagged' });
      expect(await readProject(ALICE, entry.id)).toBe(stored);
    });

    test.each(INVALID_BODY_PROJECTS)('rejects project that is %s and leaves the tag unchanged', async (_label, project) => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, { project });
      expectValidationError(res);
      expect(await readProject(ALICE, entry.id)).toBe('Client Launch');
    });

    test('an empty body is a validation error', async () => {
      expectValidationError(await as(ALICE).put(`/api/work-entries/${entry.id}`, {}));
    });

    test('another user cannot update the tag (404) and the owner tag is unchanged', async () => {
      const res = await as(BOB).put(`/api/work-entries/${entry.id}`, { project: 'Hijacked' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Work entry not found' });
      expect(await readProject(ALICE, entry.id)).toBe('Client Launch');
    });

    test('existing ID and client errors are unchanged and leave the tag untouched', async () => {
      const badId = await as(ALICE).put('/api/work-entries/abc', { project: 'X' });
      expect(badId.status).toBe(400);
      expect(badId.body).toEqual({ error: 'Invalid work entry ID' });

      const foreign = await as(ALICE).put(`/api/work-entries/${entry.id}`, { clientId: bobClient, project: 'Other' });
      expect(foreign.status).toBe(400);
      expect(foreign.body).toEqual({ error: 'Client not found or does not belong to user' });
      expect(await readProject(ALICE, entry.id)).toBe('Client Launch');
    });
  });

  describe('GET /api/work-entries and /api/work-entries/:id', () => {
    test('every listed entry includes project and only the current user entries are returned', async () => {
      await createEntry(ALICE, { clientId: aliceClient, project: 'Client Launch' });
      await createEntry(ALICE, { clientId: aliceOtherClient });
      await createEntry(BOB, { clientId: bobClient, project: 'Client Launch' });

      const res = await as(ALICE).get('/api/work-entries');
      expect(res.status).toBe(200);
      expect(Object.keys(res.body)).toEqual(['workEntries']);
      expect(res.body.workEntries).toHaveLength(2);
      res.body.workEntries.forEach(expectWorkEntryShape);
      expect(res.body.workEntries.map((e) => e.project).sort()).toEqual(['Client Launch', null].sort());
      res.body.workEntries.forEach((e) => expect([aliceClient, aliceOtherClient]).toContain(e.client_id));

      const bobList = await as(BOB).get('/api/work-entries');
      expect(bobList.body.workEntries).toHaveLength(1);
      expect(bobList.body.workEntries[0]).toMatchObject({ client_id: bobClient, project: 'Client Launch' });
    });

    test('existing ?clientId= filter is unchanged and includes project', async () => {
      await createEntry(ALICE, { clientId: aliceClient, project: 'Client Launch' });
      await createEntry(ALICE, { clientId: aliceOtherClient, project: 'Other' });
      const res = await as(ALICE).get(`/api/work-entries?clientId=${aliceClient}`);
      expect(res.status).toBe(200);
      expect(res.body.workEntries).toHaveLength(1);
      expectWorkEntryShape(res.body.workEntries[0]);
      expect(res.body.workEntries[0].project).toBe('Client Launch');

      const bad = await as(ALICE).get('/api/work-entries?clientId=abc');
      expect(bad.status).toBe(400);
      expect(bad.body).toEqual({ error: 'Invalid client ID' });
    });

    test('GET by id includes project (string or null); another user gets 404', async () => {
      const tagged = await createEntry(ALICE, { clientId: aliceClient, project: 'Client Launch' });
      const untagged = await createEntry(ALICE, { clientId: aliceClient });

      const a = await as(ALICE).get(`/api/work-entries/${tagged.id}`);
      expect(a.status).toBe(200);
      expect(Object.keys(a.body)).toEqual(['workEntry']);
      expectWorkEntryShape(a.body.workEntry);
      expect(a.body.workEntry.project).toBe('Client Launch');

      const b = await as(ALICE).get(`/api/work-entries/${untagged.id}`);
      expectWorkEntryShape(b.body.workEntry);
      expect(b.body.workEntry.project).toBeNull();

      const other = await as(BOB).get(`/api/work-entries/${tagged.id}`);
      expect(other.status).toBe(404);
      expect(other.body).toEqual({ error: 'Work entry not found' });
    });
  });

  test('email header errors are unchanged', async () => {
    const missing = await request(app).post('/api/work-entries').send({ clientId: 1, hours: 1, date: '2024-03-01', project: 'X' });
    expect(missing.status).toBe(401);
    expect(missing.body).toEqual({ error: 'User email required in x-user-email header' });

    const malformed = await request(app).get('/api/reports/client/1?project=X').set('x-user-email', 'not-an-email');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toEqual({ error: 'Invalid email format' });
  });

  describe('reports with ?project=', () => {
    beforeEach(async () => {
      await createEntry(ALICE, { clientId: aliceClient, hours: 2, date: '2024-03-01', project: 'Client Launch', description: 'launch-1' });
      await createEntry(ALICE, { clientId: aliceClient, hours: 3.5, date: '2024-03-02', project: 'Client Launch', description: 'launch-2' });
      await createEntry(ALICE, { clientId: aliceClient, hours: 1, date: '2024-03-03', project: 'client launch', description: 'lower-case' });
      await createEntry(ALICE, { clientId: aliceClient, hours: 4, date: '2024-03-04', project: 'Client Launch Phase 2', description: 'superstring' });
      await createEntry(ALICE, { clientId: aliceClient, hours: 0.5, date: '2024-03-05', description: 'untagged' });
      await createEntry(ALICE, { clientId: aliceOtherClient, hours: 8, date: '2024-03-01', project: 'Client Launch', description: 'other-client' });
      await createEntry(BOB, { clientId: bobClient, hours: 6, date: '2024-03-01', project: 'Client Launch', description: 'bob-entry' });
    });

    const NOT_LAUNCH = ['lower-case', 'superstring', 'untagged', 'other-client', 'bob-entry'];

    describe('GET /api/reports/client/:clientId', () => {
      test('without the parameter returns the unfiltered report including untagged rows', async () => {
        const res = await as(ALICE).get(`/api/reports/client/${aliceClient}`);
        expect(res.status).toBe(200);
        expect(Object.keys(res.body).sort()).toEqual(['client', 'entryCount', 'totalHours', 'workEntries']);
        expect(res.body.client).toMatchObject({ id: aliceClient, name: 'Alice Client' });
        expect(res.body.workEntries.map((r) => r.description).sort()).toEqual(['launch-1', 'launch-2', 'lower-case', 'superstring', 'untagged']);
        expect(res.body.entryCount).toBe(5);
        expect(res.body.totalHours).toBeCloseTo(11, 5);
        res.body.workEntries.forEach((row) => {
          ['id', 'hours', 'description', 'date', 'created_at', 'updated_at'].forEach((k) => expect(row).toHaveProperty(k));
          expectProjectKey(row);
        });
        expect(res.body.workEntries.find((r) => r.description === 'untagged').project).toBeNull();
      });

      test.each([
        ['exact value', 'Client%20Launch'],
        ['value with surrounding whitespace (trimmed)', '%20%20Client%20Launch%20']
      ])('filters by exact, case-sensitive match for the %s; rows and totals reflect the filtered set', async (_label, qv) => {
        const res = await as(ALICE).get(`/api/reports/client/${aliceClient}?project=${qv}`);
        expect(res.status).toBe(200);
        expect(res.body.client).toMatchObject({ id: aliceClient, name: 'Alice Client' });
        expect(res.body.workEntries.map((r) => r.description).sort()).toEqual(['launch-1', 'launch-2']);
        res.body.workEntries.forEach((r) => expect(r.project).toBe('Client Launch'));
        expect(res.body.entryCount).toBe(2);
        expect(res.body.totalHours).toBeCloseTo(5.5, 5);
      });

      test('a case variant matches only its own exact tag', async () => {
        const res = await as(ALICE).get(`/api/reports/client/${aliceClient}?project=client%20launch`);
        expect(res.status).toBe(200);
        expect(res.body.workEntries.map((r) => r.description)).toEqual(['lower-case']);
        expect(res.body.entryCount).toBe(1);
        expect(res.body.totalHours).toBeCloseTo(1, 5);
      });

      test.each([
        ['substring', 'Client'],
        ['suffix', 'Launch'],
        ['% wildcard', 'Client%'],
        ['_ wildcard', '_lient Launch'],
        ['* wildcard', 'Client*'],
        ['upper-case variant', 'CLIENT LAUNCH'],
        ['quote characters', "' OR '1'='1"],
        ['50-character value', 'z'.repeat(50)]
      ])('a valid filter with no exact match (%s) returns an empty report, not an error', async (_label, value) => {
        const res = await as(ALICE).get(`/api/reports/client/${aliceClient}?project=${encodeURIComponent(value)}`);
        expect(res.status).toBe(200);
        expect(res.body.client).toMatchObject({ id: aliceClient, name: 'Alice Client' });
        expect(res.body.workEntries).toEqual([]);
        expect(res.body.totalHours).toBe(0);
        expect(res.body.entryCount).toBe(0);
      });

      test.each(INVALID_QUERIES)('an invalid project query (%s) returns 400 validation error', async (_label, qs) => {
        expectValidationError(await as(ALICE).get(`/api/reports/client/${aliceClient}?${qs}`));
      });

      test('filtering is scoped to the requested client and the current user', async () => {
        const other = await as(ALICE).get(`/api/reports/client/${aliceOtherClient}?project=Client%20Launch`);
        expect(other.status).toBe(200);
        expect(other.body.workEntries.map((r) => r.description)).toEqual(['other-client']);
        expect(other.body.totalHours).toBeCloseTo(8, 5);

        const bobOwn = await as(BOB).get(`/api/reports/client/${bobClient}?project=Client%20Launch`);
        expect(bobOwn.status).toBe(200);
        expect(bobOwn.body.workEntries.map((r) => r.description)).toEqual(['bob-entry']);
        expect(bobOwn.body.totalHours).toBeCloseTo(6, 5);

        const cross = await as(BOB).get(`/api/reports/client/${aliceClient}?project=Client%20Launch`);
        expect(cross.status).toBe(404);
        expect(cross.body).toEqual({ error: 'Client not found' });

        const unknown = await as(ALICE).get('/api/reports/client/999999?project=Client%20Launch');
        expect(unknown.status).toBe(404);
        expect(unknown.body).toEqual({ error: 'Client not found' });
      });
    });

    describe('GET /api/reports/export/csv/:clientId', () => {
      test('without the parameter exports all rows with the existing columns', async () => {
        const res = await getBinary(ALICE, `/api/reports/export/csv/${aliceClient}`);
        expect(res.status).toBe(200);
        const lines = csvLines(res.body);
        expect(lines[0]).toBe(CSV_HEADER);
        expect(lines).toHaveLength(6);
        expect(lines.some((l) => l.includes('untagged'))).toBe(true);
      });

      test('a filter exports only the exact-match rows with unchanged columns', async () => {
        const res = await getBinary(ALICE, `/api/reports/export/csv/${aliceClient}?project=Client%20Launch`);
        expect(res.status).toBe(200);
        const lines = csvLines(res.body);
        expect(lines[0]).toBe(CSV_HEADER);
        const rows = lines.slice(1);
        expect(rows).toHaveLength(2);
        expect(rows.some((l) => l.includes('launch-1'))).toBe(true);
        expect(rows.some((l) => l.includes('launch-2'))).toBe(true);
        NOT_LAUNCH.forEach((d) => expect(res.body.toString('utf8')).not.toContain(d));
      });

      test('no matches keeps the existing format (same as an export of a client with no rows)', async () => {
        const emptyClient = await createClient(ALICE, 'Empty Client');
        const baseline = await getBinary(ALICE, `/api/reports/export/csv/${emptyClient}`);
        expect(baseline.status).toBe(200);

        const res = await getBinary(ALICE, `/api/reports/export/csv/${aliceClient}?project=No%20Such%20Tag`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe(baseline.headers['content-type']);
        expect(res.body.toString('utf8')).toBe(baseline.body.toString('utf8'));
      });

      test.each(INVALID_QUERIES)('an invalid project query (%s) returns 400 validation error', async (_label, qs) => {
        const res = await getBinary(ALICE, `/api/reports/export/csv/${aliceClient}?${qs}`);
        expectValidationBody(res.status, jsonOf(res));
      });

      test('another user gets 404 Client not found', async () => {
        const res = await getBinary(BOB, `/api/reports/export/csv/${aliceClient}?project=Client%20Launch`);
        expect(res.status).toBe(404);
        expect(jsonOf(res)).toEqual({ error: 'Client not found' });
      });
    });

    describe('GET /api/reports/export/pdf/:clientId', () => {
      test('without the parameter exports all rows', async () => {
        const res = await getBinary(ALICE, `/api/reports/export/pdf/${aliceClient}`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/pdf');
        const text = pdfText(res.body);
        expect(text).toContain('Total Entries: 5');
        expect(text).toContain('Total Hours: 11.00');
        expect(text).toContain('untagged');
      });

      test('a filter exports only the exact-match rows and totals', async () => {
        const res = await getBinary(ALICE, `/api/reports/export/pdf/${aliceClient}?project=Client%20Launch`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/pdf');
        const text = pdfText(res.body);
        expect(text).toContain('Total Entries: 2');
        expect(text).toContain('Total Hours: 5.50');
        expect(text).toContain('launch-1');
        expect(text).toContain('launch-2');
        NOT_LAUNCH.forEach((d) => expect(text).not.toContain(d));
      });

      test('no matches still returns a PDF in the existing format', async () => {
        const res = await getBinary(ALICE, `/api/reports/export/pdf/${aliceClient}?project=No%20Such%20Tag`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/pdf');
        expect(res.body.slice(0, 5).toString('latin1')).toBe('%PDF-');
        const text = pdfText(res.body);
        expect(text).toContain('Total Entries: 0');
        expect(text).toContain('Total Hours: 0.00');
      });

      test.each(INVALID_QUERIES)('an invalid project query (%s) returns 400 validation error', async (_label, qs) => {
        const res = await getBinary(ALICE, `/api/reports/export/pdf/${aliceClient}?${qs}`);
        expectValidationBody(res.status, jsonOf(res));
      });

      test('another user gets 404 Client not found', async () => {
        const res = await getBinary(BOB, `/api/reports/export/pdf/${aliceClient}?project=Client%20Launch`);
        expect(res.status).toBe(404);
        expect(jsonOf(res)).toEqual({ error: 'Client not found' });
      });
    });
  });
});
