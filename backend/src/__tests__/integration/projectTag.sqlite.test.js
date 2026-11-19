// Exercises the project tag against a real in-memory SQLite database.
jest.mock('sqlite3', () => jest.requireActual('sqlite3'));

const mockPdfTexts = [];
jest.mock('pdfkit', () => jest.fn().mockImplementation(() => {
  const doc = { y: 100 };
  ['fontSize', 'moveDown', 'moveTo', 'lineTo', 'stroke', 'addPage'].forEach((method) => {
    doc[method] = jest.fn(() => doc);
  });
  doc.text = jest.fn((text) => {
    mockPdfTexts.push(String(text));
    return doc;
  });
  doc.pipe = jest.fn((res) => { doc.res = res; });
  doc.end = jest.fn(() => doc.res.end());
  return doc;
}));

const request = require('supertest');
const express = require('express');
const { getDatabase, initializeDatabase, closeDatabase } = require('../../database/init');
const clientRoutes = require('../../routes/clients');
const workEntryRoutes = require('../../routes/workEntries');
const reportRoutes = require('../../routes/reports');
const { errorHandler } = require('../../middleware/errorHandler');

const ALICE = 'alice@example.com';
const BOB = 'bob@example.com';

const app = express();
app.use(express.json());
app.use('/api/clients', clientRoutes);
app.use('/api/work-entries', workEntryRoutes);
app.use('/api/reports', reportRoutes);
app.use(errorHandler);

const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  getDatabase().run(sql, params, function (err) {
    if (err) return reject(err);
    resolve(this);
  });
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  getDatabase().all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
});

const as = (email) => ({
  get: (url) => request(app).get(url).set('x-user-email', email),
  post: (url, body) => request(app).post(url).set('x-user-email', email).send(body),
  put: (url, body) => request(app).put(url).set('x-user-email', email).send(body)
});

async function createClient(email, name) {
  const res = await as(email).post('/api/clients', { name });
  expect(res.status).toBe(201);
  return res.body.client.id;
}

async function createEntry(email, body) {
  const res = await as(email).post('/api/work-entries', { hours: 1, date: '2024-03-01', ...body });
  expect(res.status).toBe(201);
  return res.body.workEntry;
}

let logSpy;
let errorSpy;

beforeAll(() => {
  logSpy = jest.spyOn(console, 'log').mockImplementation();
  errorSpy = jest.spyOn(console, 'error').mockImplementation();
});

afterAll(async () => {
  await closeDatabase();
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('work_entries.project migration', () => {
  beforeEach(async () => {
    await closeDatabase();
  });

  test('fresh database gets a nullable project column', async () => {
    await initializeDatabase();
    const columns = await dbAll('PRAGMA table_info(work_entries)');
    const project = columns.filter((col) => col.name === 'project');
    expect(project).toHaveLength(1);
    expect(project[0].type).toBe('TEXT');
    expect(project[0].notnull).toBe(0);
    expect(project[0].dflt_value).toBeNull();
  });

  test('existing table is migrated once, keeping rows and tags across re-runs', async () => {
    await dbRun('CREATE TABLE users (email TEXT PRIMARY KEY, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
    await dbRun(`CREATE TABLE work_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      user_email TEXT NOT NULL,
      hours DECIMAL(5,2) NOT NULL,
      description TEXT,
      date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbRun(
      'INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (?, ?, ?, ?, ?)',
      [1, ALICE, 2, 'Legacy row', '2024-01-01']
    );

    await initializeDatabase();
    let columns = await dbAll('PRAGMA table_info(work_entries)');
    expect(columns.filter((col) => col.name === 'project')).toHaveLength(1);

    let rows = await dbAll('SELECT description, project FROM work_entries');
    expect(rows).toEqual([{ description: 'Legacy row', project: null }]);

    await dbRun('UPDATE work_entries SET project = ? WHERE description = ?', ['Client Launch', 'Legacy row']);
    await initializeDatabase();
    await initializeDatabase();

    columns = await dbAll('PRAGMA table_info(work_entries)');
    expect(columns.filter((col) => col.name === 'project')).toHaveLength(1);
    rows = await dbAll('SELECT description, project FROM work_entries');
    expect(rows).toEqual([{ description: 'Legacy row', project: 'Client Launch' }]);
  });

  test('concurrent initializations on a legacy table both succeed', async () => {
    await dbRun(`CREATE TABLE work_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      user_email TEXT NOT NULL,
      hours DECIMAL(5,2) NOT NULL,
      description TEXT,
      date DATE NOT NULL
    )`);
    await expect(Promise.all([initializeDatabase(), initializeDatabase()])).resolves.toBeDefined();
    const columns = await dbAll('PRAGMA table_info(work_entries)');
    expect(columns.filter((col) => col.name === 'project')).toHaveLength(1);
  });
});

describe('project tag API', () => {
  let aliceClient;
  let aliceOtherClient;
  let bobClient;

  beforeAll(async () => {
    await closeDatabase();
    await initializeDatabase();
    aliceClient = await createClient(ALICE, 'Acme');
    aliceOtherClient = await createClient(ALICE, 'Globex');
    bobClient = await createClient(BOB, 'Initech');
  });

  describe('POST /api/work-entries', () => {
    test('omitted project is stored and returned as null', async () => {
      const entry = await createEntry(ALICE, { clientId: aliceClient });
      expect(entry).toHaveProperty('project', null);
      const [row] = await dbAll('SELECT project FROM work_entries WHERE id = ?', [entry.id]);
      expect(row.project).toBeNull();
    });

    test.each([
      ['null', null],
      ['empty', ''],
      ['whitespace-only', '   ']
    ])('%s project is stored as null', async (_label, project) => {
      const entry = await createEntry(ALICE, { clientId: aliceClient, project });
      expect(entry.project).toBeNull();
    });

    test('project is trimmed with case and internal whitespace preserved', async () => {
      const entry = await createEntry(ALICE, { clientId: aliceClient, project: '  Mixed  Case Tag  ' });
      expect(entry.project).toBe('Mixed  Case Tag');
      const [row] = await dbAll('SELECT project FROM work_entries WHERE id = ?', [entry.id]);
      expect(row.project).toBe('Mixed  Case Tag');
    });

    test('limit of 50 applies after trimming', async () => {
      const fifty = 'p'.repeat(50);
      const entry = await createEntry(ALICE, { clientId: aliceClient, project: `  ${fifty}  ` });
      expect(entry.project).toBe(fifty);

      const res = await as(ALICE).post('/api/work-entries', {
        clientId: aliceClient, hours: 1, date: '2024-03-01', project: 'p'.repeat(51)
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(Array.isArray(res.body.details)).toBe(true);
    });

    test.each([
      ['number', 42],
      ['boolean', true],
      ['array', ['Client Launch']],
      ['object', { name: 'Client Launch' }]
    ])('rejects a %s project', async (_label, project) => {
      const res = await as(ALICE).post('/api/work-entries', {
        clientId: aliceClient, hours: 1, date: '2024-03-01', project
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    test('cannot create an entry against another tenant\'s client', async () => {
      const res = await as(BOB).post('/api/work-entries', {
        clientId: aliceClient, hours: 1, date: '2024-03-01', project: 'Client Launch'
      });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Client not found or does not belong to user' });
    });

    test('requires the email header', async () => {
      const missing = await request(app).post('/api/work-entries').send({});
      expect(missing.status).toBe(401);
      expect(missing.body).toEqual({ error: 'User email required in x-user-email header' });

      const malformed = await request(app).post('/api/work-entries').set('x-user-email', 'not-an-email').send({});
      expect(malformed.status).toBe(400);
      expect(malformed.body).toEqual({ error: 'Invalid email format' });
    });
  });

  describe('PUT /api/work-entries/:id', () => {
    let entry;

    beforeEach(async () => {
      entry = await createEntry(ALICE, {
        clientId: aliceClient, hours: 3, description: 'Original', project: 'Alpha'
      });
    });

    test('a body with only project is valid and changes only the tag', async () => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, { project: ' Beta ' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Work entry updated successfully');
      expect(res.body.workEntry).toMatchObject({
        id: entry.id, project: 'Beta', description: 'Original', hours: 3, client_name: 'Acme'
      });
    });

    test('omitting project keeps the current tag', async () => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, { hours: 4 });
      expect(res.status).toBe(200);
      expect(res.body.workEntry).toMatchObject({ hours: 4, project: 'Alpha' });
    });

    test.each([null, '', '  '])('project %p clears the tag', async (project) => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, { project });
      expect(res.status).toBe(200);
      expect(res.body.workEntry.project).toBeNull();
    });

    test('empty body is a validation error', async () => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, {});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(Array.isArray(res.body.details)).toBe(true);
    });

    test('rejects an over-limit project', async () => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, { project: 'x'.repeat(51) });
      expect(res.status).toBe(400);
      const [row] = await dbAll('SELECT project FROM work_entries WHERE id = ?', [entry.id]);
      expect(row.project).toBe('Alpha');
    });

    test('another tenant cannot update or read the entry', async () => {
      const put = await as(BOB).put(`/api/work-entries/${entry.id}`, { project: 'Taken' });
      expect(put.status).toBe(404);
      expect(put.body).toEqual({ error: 'Work entry not found' });

      const get = await as(BOB).get(`/api/work-entries/${entry.id}`);
      expect(get.status).toBe(404);

      const [row] = await dbAll('SELECT project FROM work_entries WHERE id = ?', [entry.id]);
      expect(row.project).toBe('Alpha');
    });

    test('cannot move an entry to another tenant\'s client', async () => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, { clientId: bobClient });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Client not found or does not belong to user' });
    });
  });

  describe('GET /api/work-entries', () => {
    test('every entry includes a project key, scoped to the current user', async () => {
      await createEntry(BOB, { clientId: bobClient, project: 'Client Launch' });

      const res = await as(ALICE).get('/api/work-entries');
      expect(res.status).toBe(200);
      expect(res.body.workEntries.length).toBeGreaterThan(0);
      res.body.workEntries.forEach((we) => {
        expect(we).toHaveProperty('project');
        expect(we.project === null || typeof we.project === 'string').toBe(true);
        expect(we.client_name).not.toBe('Initech');
      });

      const bobRes = await as(BOB).get('/api/work-entries');
      expect(bobRes.body.workEntries.every((we) => we.client_name === 'Initech')).toBe(true);
    });

    test('GET by id includes project', async () => {
      const entry = await createEntry(ALICE, { clientId: aliceClient, project: 'Detail' });
      const res = await as(ALICE).get(`/api/work-entries/${entry.id}`);
      expect(res.status).toBe(200);
      expect(res.body.workEntry).toMatchObject({ id: entry.id, project: 'Detail', client_name: 'Acme' });
    });
  });
});

describe('project-filtered reports', () => {
  let aliceClient;
  let bobClient;

  beforeAll(async () => {
    await closeDatabase();
    await initializeDatabase();
    aliceClient = await createClient(ALICE, 'Acme');
    bobClient = await createClient(BOB, 'Initech');

    await createEntry(ALICE, { clientId: aliceClient, hours: 2, description: 'Launch prep', project: 'Client Launch' });
    await createEntry(ALICE, { clientId: aliceClient, hours: 3.5, description: 'Launch day', project: 'Client Launch' });
    await createEntry(ALICE, { clientId: aliceClient, hours: 1, description: 'Lowercase tag', project: 'client launch' });
    await createEntry(ALICE, { clientId: aliceClient, hours: 4, description: 'Untagged work' });
    await createEntry(BOB, { clientId: bobClient, hours: 8, description: 'Other tenant', project: 'Client Launch' });
  });

  beforeEach(() => {
    mockPdfTexts.length = 0;
  });

  test('unfiltered report includes untagged entries and a project key on each row', async () => {
    const res = await as(ALICE).get(`/api/reports/client/${aliceClient}`);
    expect(res.status).toBe(200);
    expect(res.body.entryCount).toBe(4);
    expect(res.body.totalHours).toBe(10.5);
    expect(res.body.workEntries.map((we) => we.project).sort()).toEqual(
      ['Client Launch', 'Client Launch', 'client launch', null].sort()
    );
  });

  test('filter matches the decoded, trimmed value exactly', async () => {
    for (const query of ['Client%20Launch', '%20%20Client%20Launch%20']) {
      const res = await as(ALICE).get(`/api/reports/client/${aliceClient}?project=${query}`);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(['client', 'entryCount', 'totalHours', 'workEntries']);
      expect(res.body.entryCount).toBe(2);
      expect(res.body.totalHours).toBe(5.5);
      expect(res.body.workEntries.every((we) => we.project === 'Client Launch')).toBe(true);
    }
  });

  test.each(['CLIENT%20LAUNCH', 'Client', 'Launch', 'Client%25', 'Nonexistent'])(
    'non-exact value %s returns an empty report',
    async (query) => {
      const res = await as(ALICE).get(`/api/reports/client/${aliceClient}?project=${query}`);
      expect(res.status).toBe(200);
      expect(res.body.workEntries).toEqual([]);
      expect(res.body.totalHours).toBe(0);
      expect(res.body.entryCount).toBe(0);
    }
  );

  test('filter does not include another tenant\'s entries with the same tag', async () => {
    const res = await as(BOB).get(`/api/reports/client/${bobClient}?project=Client%20Launch`);
    expect(res.body.entryCount).toBe(1);
    expect(res.body.totalHours).toBe(8);
  });

  test.each([
    ['empty', 'project='],
    ['whitespace-only', 'project=%20%20'],
    ['repeated', 'project=Client%20Launch&project=Client%20Launch'],
    ['structured', 'project[name]=Client%20Launch'],
    ['over-limit', `project=${'a'.repeat(51)}`]
  ])('%s project query is a validation error on every report route', async (_label, query) => {
    for (const route of ['client', 'export/csv', 'export/pdf']) {
      const res = await as(ALICE).get(`/api/reports/${route}/${aliceClient}?${query}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(Array.isArray(res.body.details)).toBe(true);
    }
  });

  test('a 50-character filter is accepted', async () => {
    const res = await as(ALICE).get(`/api/reports/client/${aliceClient}?project=${'a'.repeat(50)}`);
    expect(res.status).toBe(200);
    expect(res.body.entryCount).toBe(0);
  });

  test('another tenant\'s client is not found on all report routes', async () => {
    for (const route of ['client', 'export/csv', 'export/pdf']) {
      const res = await as(BOB).get(`/api/reports/${route}/${aliceClient}?project=Client%20Launch`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Client not found' });
    }
  });

  test('CSV export uses the filtered set and keeps its columns', async () => {
    const res = await as(ALICE).get(`/api/reports/export/csv/${aliceClient}?project=Client%20Launch`);
    expect(res.status).toBe(200);
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe('Date,Hours,Description,Created At');
    expect(lines).toHaveLength(3);
    expect(res.text).toContain('Launch prep');
    expect(res.text).toContain('Launch day');
    expect(res.text).not.toContain('Untagged work');
    expect(res.text).not.toContain('Other tenant');
  });

  test('CSV export with no matches still sends the header', async () => {
    const res = await as(ALICE).get(`/api/reports/export/csv/${aliceClient}?project=Nonexistent`);
    expect(res.status).toBe(200);
    expect(res.text.trim()).toBe('Date,Hours,Description,Created At');
  });

  test('unfiltered CSV export includes untagged entries', async () => {
    const res = await as(ALICE).get(`/api/reports/export/csv/${aliceClient}`);
    expect(res.status).toBe(200);
    expect(res.text.trim().split('\n')).toHaveLength(5);
  });

  test('PDF export uses the filtered set', async () => {
    const res = await as(ALICE).get(`/api/reports/export/pdf/${aliceClient}?project=Client%20Launch`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(mockPdfTexts).toContain('Total Hours: 5.50');
    expect(mockPdfTexts).toContain('Total Entries: 2');
    expect(mockPdfTexts).not.toContain('Untagged work');
  });

  test('PDF export with no matches reports zero entries', async () => {
    const res = await as(ALICE).get(`/api/reports/export/pdf/${aliceClient}?project=Nonexistent`);
    expect(res.status).toBe(200);
    expect(mockPdfTexts).toContain('Total Hours: 0.00');
    expect(mockPdfTexts).toContain('Total Entries: 0');
  });
});
