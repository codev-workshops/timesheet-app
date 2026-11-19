/**
 * API-level contract tests for docs/contracts/project-tag-v1.md (frozen).
 * Expected behaviors are derived only from the contract. Requests go through
 * the real routes, auth middleware, error handler and an in-memory SQLite DB.
 */

// Override the global sqlite3 mock from setup.js: these tests need a real DB.
jest.mock('sqlite3', () => jest.requireActual('sqlite3'));

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { createRequire } = require('module');
const express = require('express');
const request = require('supertest');

const { getDatabase, initializeDatabase, closeDatabase } = require('../../database/init');
const authRoutes = require('../../routes/auth');
const clientRoutes = require('../../routes/clients');
const workEntryRoutes = require('../../routes/workEntries');
const reportRoutes = require('../../routes/reports');
const { errorHandler } = require('../../middleware/errorHandler');

const BACKEND_DIR = path.resolve(__dirname, '../../..');
const DOCKER_INIT_PATH = path.resolve(BACKEND_DIR, '../docker/overrides/database/init.js');

const ALICE = 'alice.project-tag@example.com';
const BOB = 'bob.project-tag@example.com';

// Mirrors the route/error-handler wiring in src/server.js without starting a listener.
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/auth', authRoutes);
  app.use('/api/clients', clientRoutes);
  app.use('/api/work-entries', workEntryRoutes);
  app.use('/api/reports', reportRoutes);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

// ---------- helpers ----------

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function dbClose(db) {
  return new Promise((resolve, reject) => db.close((err) => (err ? reject(err) : resolve())));
}

async function projectColumns(db) {
  const cols = await dbAll(db, 'PRAGMA table_info(work_entries)');
  return cols.filter((c) => c.name === 'project');
}

const LEGACY_SCHEMA = [
  `CREATE TABLE users (email TEXT PRIMARY KEY, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE clients (
     id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
     department TEXT, email TEXT, user_email TEXT NOT NULL,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE work_entries (
     id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, user_email TEXT NOT NULL,
     hours DECIMAL(5,2) NOT NULL, description TEXT, date DATE NOT NULL,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `INSERT INTO users (email) VALUES ('legacy@example.com')`,
  `INSERT INTO clients (name, user_email) VALUES ('Legacy Client', 'legacy@example.com')`,
  `INSERT INTO work_entries (client_id, user_email, hours, description, date)
     VALUES (1, 'legacy@example.com', 3.5, 'legacy row', '2024-01-02')`
];

async function createLegacySchema(db) {
  for (const sql of LEGACY_SCHEMA) {
    await dbRun(db, sql);
  }
}

// Loads the Docker override exactly as the Dockerfile deploys it (in place of
// src/database/init.js), with a fresh module instance per call.
function loadDockerInit() {
  const source = fs.readFileSync(DOCKER_INIT_PATH, 'utf8');
  const deployedPath = path.join(BACKEND_DIR, 'src/database/init.js');
  const mod = { exports: {} };
  const wrapper = new Function('require', 'module', 'exports', '__filename', '__dirname', source);
  wrapper(createRequire(deployedPath), mod, mod.exports, deployedPath, path.dirname(deployedPath));
  return mod.exports;
}

// Makes ALTER ... ADD COLUMN project fail with an unexpected (non-duplicate) error.
function failProjectMigration(db) {
  const failure = () => Object.assign(new Error('SQLITE_IOERR: disk I/O error'), { code: 'SQLITE_IOERR', errno: 10 });
  const isProjectAlter = (sql) => typeof sql === 'string' && /ALTER\s+TABLE\s+\S*work_entries\S*\s+ADD\s+(COLUMN\s+)?\S*project/i.test(sql);
  const origRun = db.run.bind(db);
  const origExec = db.exec.bind(db);
  db.run = function (sql, ...args) {
    if (isProjectAlter(sql)) {
      const cb = args.find((a) => typeof a === 'function');
      if (cb) process.nextTick(() => cb.call({}, failure()));
      else process.nextTick(() => db.emit('error', failure()));
      return db;
    }
    return origRun(sql, ...args);
  };
  db.exec = function (sql, cb) {
    if (isProjectAlter(sql)) {
      if (cb) process.nextTick(() => cb.call({}, failure()));
      else process.nextTick(() => db.emit('error', failure()));
      return db;
    }
    return origExec(sql, cb);
  };
}

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

function expectValidationError(res) {
  expect(res.status).toBe(400);
  expect(res.body.error).toBe('Validation error');
  expect(Array.isArray(res.body.details)).toBe(true);
  expect(res.body.details.length).toBeGreaterThan(0);
  res.body.details.forEach((d) => expect(typeof d).toBe('string'));
}

const EXISTING_ENTRY_KEYS = ['id', 'client_id', 'hours', 'description', 'date', 'created_at', 'updated_at', 'client_name'];

function expectWorkEntryShape(entry) {
  EXISTING_ENTRY_KEYS.forEach((k) => expect(entry).toHaveProperty(k));
  expect(Object.prototype.hasOwnProperty.call(entry, 'project')).toBe(true);
  expect(entry.project === null || typeof entry.project === 'string').toBe(true);
}

function binaryParser(res, cb) {
  const chunks = [];
  res.on('data', (c) => chunks.push(Buffer.from(c)));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

function getBinary(user, url) {
  return request(app).get(url).set('x-user-email', user).buffer(true).parse(binaryParser);
}

function parseJsonBody(res) {
  return JSON.parse(Buffer.isBuffer(res.body) ? res.body.toString('utf8') : res.text);
}

// Extracts the text drawn by PDFKit (hex strings inside TJ arrays of content streams).
function pdfText(buffer) {
  const raw = buffer.toString('latin1');
  const out = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = streamRe.exec(raw)) !== null) {
    const bytes = Buffer.from(m[1], 'latin1');
    let content;
    try {
      content = zlib.inflateSync(bytes).toString('latin1');
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

const csvDataLines = (text) => text.split(/\r?\n/).filter((l) => l.length > 0).slice(1);
const csvHeader = (text) => text.split(/\r?\n/)[0];

// ---------- Database ----------

describe('Project tag v1 contract — database initialization', () => {
  describe('backend initializer (src/database/init.js)', () => {
    beforeEach(async () => {
      await closeDatabase();
    });

    afterAll(async () => {
      await closeDatabase();
    });

    test('fresh database gets a nullable TEXT project column defaulting to NULL', async () => {
      await initializeDatabase();
      const cols = await projectColumns(getDatabase());
      expect(cols).toHaveLength(1);
      expect(cols[0].type.toUpperCase()).toBe('TEXT');
      expect(cols[0].notnull).toBe(0);
      expect(cols[0].dflt_value === null || /^NULL$/i.test(cols[0].dflt_value)).toBe(true);
    });

    test('existing table without project is migrated; existing rows keep data and are NULL', async () => {
      const db = getDatabase();
      await createLegacySchema(db);
      await initializeDatabase();
      expect(await projectColumns(db)).toHaveLength(1);
      const rows = await dbAll(db, 'SELECT * FROM work_entries');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ description: 'legacy row', date: '2024-01-02', project: null });
      expect(Number(rows[0].hours)).toBe(3.5);
    });

    test('re-running initialization does not duplicate the column, lose data, or overwrite tags', async () => {
      const db = getDatabase();
      await createLegacySchema(db);
      await initializeDatabase();
      await dbRun(db, 'UPDATE work_entries SET project = ? WHERE id = 1', ['Kept Tag']);
      await initializeDatabase();
      await initializeDatabase();
      expect(await projectColumns(db)).toHaveLength(1);
      const rows = await dbAll(db, 'SELECT * FROM work_entries');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ description: 'legacy row', project: 'Kept Tag' });
    });

    test('an unexpected migration error fails initialization', async () => {
      const db = getDatabase();
      await createLegacySchema(db);
      failProjectMigration(db);
      db.on('error', () => {});
      await expect(initializeDatabase()).rejects.toBeDefined();
    });
  });

  describe('Docker override (docker/overrides/database/init.js)', () => {
    let tmpDir;
    let dbPath;
    const savedPath = process.env.DATABASE_PATH;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-tag-'));
      dbPath = path.join(tmpDir, 'timesheet.db');
      process.env.DATABASE_PATH = dbPath;
    });

    afterEach(() => {
      if (savedPath === undefined) delete process.env.DATABASE_PATH;
      else process.env.DATABASE_PATH = savedPath;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    async function seedLegacyFile() {
      const sqlite3 = jest.requireActual('sqlite3');
      const raw = await new Promise((resolve, reject) => {
        const d = new sqlite3.Database(dbPath, (err) => (err ? reject(err) : resolve(d)));
      });
      await createLegacySchema(raw);
      await dbClose(raw);
    }

    test('fresh database gets a nullable TEXT project column defaulting to NULL', async () => {
      const dockerInit = loadDockerInit();
      try {
        await dockerInit.initializeDatabase();
        const cols = await projectColumns(dockerInit.getDatabase());
        expect(cols).toHaveLength(1);
        expect(cols[0].type.toUpperCase()).toBe('TEXT');
        expect(cols[0].notnull).toBe(0);
        expect(cols[0].dflt_value === null || /^NULL$/i.test(cols[0].dflt_value)).toBe(true);
      } finally {
        await dockerInit.closeDatabase();
      }
    });

    test('existing file database is migrated; re-running keeps data and tags', async () => {
      await seedLegacyFile();

      const first = loadDockerInit();
      try {
        await first.initializeDatabase();
        const db = first.getDatabase();
        expect(await projectColumns(db)).toHaveLength(1);
        const rows = await dbAll(db, 'SELECT * FROM work_entries');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ description: 'legacy row', project: null });
        await dbRun(db, 'UPDATE work_entries SET project = ? WHERE id = 1', ['Kept Tag']);
      } finally {
        await first.closeDatabase();
      }

      const second = loadDockerInit();
      try {
        await second.initializeDatabase();
        await second.initializeDatabase();
        const db = second.getDatabase();
        expect(await projectColumns(db)).toHaveLength(1);
        const rows = await dbAll(db, 'SELECT * FROM work_entries');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ description: 'legacy row', project: 'Kept Tag' });
      } finally {
        await second.closeDatabase();
      }
    });

    test('an unexpected migration error fails initialization', async () => {
      await seedLegacyFile();
      const dockerInit = loadDockerInit();
      try {
        const db = dockerInit.getDatabase();
        failProjectMigration(db);
        db.on('error', () => {});
        await expect(dockerInit.initializeDatabase()).rejects.toBeDefined();
      } finally {
        await dockerInit.closeDatabase();
      }
    });
  });
});

// ---------- API ----------

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
    test('omitting project stores NULL and returns project: null with the existing envelope', async () => {
      const res = await as(ALICE).post('/api/work-entries', { clientId: aliceClient, hours: 2, date: '2024-03-01', description: 'no tag' });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Work entry created successfully');
      expectWorkEntryShape(res.body.workEntry);
      expect(res.body.workEntry.project).toBeNull();
      expect(res.body.workEntry.client_name).toBe('Alice Client');

      const read = await as(ALICE).get(`/api/work-entries/${res.body.workEntry.id}`);
      expect(read.body.workEntry.project).toBeNull();
    });

    test('stores the trimmed tag, preserving case and internal whitespace', async () => {
      const res = await as(ALICE).post('/api/work-entries', { clientId: aliceClient, hours: 1, date: '2024-03-01', project: '  Client   LAUNCH v2 \t' });
      expect(res.status).toBe(201);
      expect(res.body.workEntry.project).toBe('Client   LAUNCH v2');

      const read = await as(ALICE).get(`/api/work-entries/${res.body.workEntry.id}`);
      expect(read.body.workEntry.project).toBe('Client   LAUNCH v2');
    });

    test.each([
      ['null', null],
      ['empty string', ''],
      ['whitespace-only', '   \t ']
    ])('%s project stores NULL', async (_label, project) => {
      const res = await as(ALICE).post('/api/work-entries', { clientId: aliceClient, hours: 1, date: '2024-03-01', project });
      expect(res.status).toBe(201);
      expect(res.body.workEntry.project).toBeNull();
      const read = await as(ALICE).get(`/api/work-entries/${res.body.workEntry.id}`);
      expect(read.body.workEntry.project).toBeNull();
    });

    test('accepts 50 characters after trimming', async () => {
      const tag = 'a'.repeat(50);
      const res = await as(ALICE).post('/api/work-entries', { clientId: aliceClient, hours: 1, date: '2024-03-01', project: `   ${tag}   ` });
      expect(res.status).toBe(201);
      expect(res.body.workEntry.project).toBe(tag);
    });

    test('limit is measured in UTF-16 code units', async () => {
      const ok = '\u{1F600}'.repeat(25); // 50 code units
      const okRes = await as(ALICE).post('/api/work-entries', { clientId: aliceClient, hours: 1, date: '2024-03-01', project: ok });
      expect(okRes.status).toBe(201);
      expect(okRes.body.workEntry.project).toBe(ok);

      const tooLong = await as(ALICE).post('/api/work-entries', { clientId: aliceClient, hours: 1, date: '2024-03-01', project: `${ok}a` });
      expectValidationError(tooLong);
    });

    test.each([
      ['over 50 characters', 'a'.repeat(51)],
      ['a number', 42],
      ['a boolean', true],
      ['an array', ['Client Launch']],
      ['an object', { name: 'Client Launch' }]
    ])('rejects project that is %s and creates nothing', async (_label, project) => {
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

    test('existing clients that omit project keep working', async () => {
      const res = await as(ALICE).post('/api/work-entries', { clientId: aliceClient, hours: 4.25, date: '2024-03-05' });
      expect(res.status).toBe(201);
      expect(res.body.workEntry).toMatchObject({ client_id: aliceClient, hours: 4.25, description: null, project: null });
    });
  });

  describe('PUT /api/work-entries/:id', () => {
    let entry;

    beforeEach(async () => {
      entry = await createEntry(ALICE, { clientId: aliceClient, project: 'Client Launch', description: 'tagged' });
    });

    test('omitting project keeps the current tag', async () => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, { hours: 7, description: 'changed' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Work entry updated successfully');
      expectWorkEntryShape(res.body.workEntry);
      expect(res.body.workEntry).toMatchObject({ hours: 7, description: 'changed', project: 'Client Launch' });
    });

    test('changing the client keeps the current tag', async () => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, { clientId: aliceOtherClient });
      expect(res.status).toBe(200);
      expect(res.body.workEntry).toMatchObject({ client_id: aliceOtherClient, client_name: 'Alice Other', project: 'Client Launch' });
    });

    test('a body containing only project is valid and stores the trimmed tag', async () => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, { project: '  Internal  Ops ' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Work entry updated successfully');
      expect(res.body.workEntry).toMatchObject({ project: 'Internal  Ops', description: 'tagged' });

      const read = await as(ALICE).get(`/api/work-entries/${entry.id}`);
      expect(read.body.workEntry.project).toBe('Internal  Ops');
    });

    test.each([
      ['null', null],
      ['empty string', ''],
      ['whitespace-only', '    ']
    ])('%s project clears the tag to NULL', async (_label, project) => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, { project });
      expect(res.status).toBe(200);
      expect(res.body.workEntry.project).toBeNull();
      const read = await as(ALICE).get(`/api/work-entries/${entry.id}`);
      expect(read.body.workEntry.project).toBeNull();
    });

    test.each([
      ['over 50 characters', ` ${'b'.repeat(51)} `],
      ['a number', 7],
      ['a boolean', false],
      ['an array', []],
      ['an object', {}]
    ])('rejects project that is %s and leaves the tag unchanged', async (_label, project) => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, { project });
      expectValidationError(res);
      const read = await as(ALICE).get(`/api/work-entries/${entry.id}`);
      expect(read.body.workEntry.project).toBe('Client Launch');
    });

    test('an empty body is a validation error', async () => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, {});
      expectValidationError(res);
    });

    test('another user cannot update the tag (404) and the owner tag is unchanged', async () => {
      const res = await as(BOB).put(`/api/work-entries/${entry.id}`, { project: 'Hijacked' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Work entry not found' });
      const read = await as(ALICE).get(`/api/work-entries/${entry.id}`);
      expect(read.body.workEntry.project).toBe('Client Launch');
    });

    test('invalid work entry ID keeps the existing error', async () => {
      const res = await as(ALICE).put('/api/work-entries/abc', { project: 'X' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid work entry ID' });
    });

    test('moving to a client owned by another user keeps the existing error and the tag', async () => {
      const res = await as(ALICE).put(`/api/work-entries/${entry.id}`, { clientId: bobClient, project: 'Other' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Client not found or does not belong to user' });
      const read = await as(ALICE).get(`/api/work-entries/${entry.id}`);
      expect(read.body.workEntry.project).toBe('Client Launch');
    });
  });

  describe('GET /api/work-entries and /api/work-entries/:id', () => {
    test('every listed entry includes project (string or null) and only the current user entries', async () => {
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

    test('GET by id includes project; another user gets 404', async () => {
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

  describe('authentication header (unchanged)', () => {
    test('missing x-user-email returns 401', async () => {
      const res = await request(app).post('/api/work-entries').send({ clientId: 1, hours: 1, date: '2024-03-01', project: 'X' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'User email required in x-user-email header' });
    });

    test('malformed x-user-email returns 400', async () => {
      const res = await request(app).get('/api/reports/client/1?project=X').set('x-user-email', 'not-an-email');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid email format' });
    });
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

    describe('GET /api/reports/client/:clientId', () => {
      test('without the parameter returns the unfiltered report including untagged rows', async () => {
        const res = await as(ALICE).get(`/api/reports/client/${aliceClient}`);
        expect(res.status).toBe(200);
        expect(Object.keys(res.body).sort()).toEqual(['client', 'entryCount', 'totalHours', 'workEntries']);
        expect(res.body.client).toMatchObject({ id: aliceClient, name: 'Alice Client' });
        expect(res.body.entryCount).toBe(5);
        expect(res.body.workEntries).toHaveLength(5);
        expect(res.body.totalHours).toBeCloseTo(11, 5);
        res.body.workEntries.forEach((row) => {
          ['id', 'hours', 'description', 'date', 'created_at', 'updated_at'].forEach((k) => expect(row).toHaveProperty(k));
          expect(Object.prototype.hasOwnProperty.call(row, 'project')).toBe(true);
          expect(row.project === null || typeof row.project === 'string').toBe(true);
        });
        const untagged = res.body.workEntries.find((r) => r.description === 'untagged');
        expect(untagged.project).toBeNull();
      });

      test('filters by exact, case-sensitive match; rows and totals reflect the filtered set', async () => {
        const res = await as(ALICE).get(`/api/reports/client/${aliceClient}?project=Client%20Launch`);
        expect(res.status).toBe(200);
        expect(res.body.client).toMatchObject({ id: aliceClient, name: 'Alice Client' });
        expect(res.body.workEntries.map((r) => r.description).sort()).toEqual(['launch-1', 'launch-2']);
        res.body.workEntries.forEach((r) => expect(r.project).toBe('Client Launch'));
        expect(res.body.entryCount).toBe(2);
        expect(res.body.totalHours).toBeCloseTo(5.5, 5);
      });

      test('the filter value is trimmed before matching', async () => {
        const res = await as(ALICE).get(`/api/reports/client/${aliceClient}?project=%20%20Client%20Launch%20`);
        expect(res.status).toBe(200);
        expect(res.body.entryCount).toBe(2);
        expect(res.body.totalHours).toBeCloseTo(5.5, 5);
      });

      test('case variants match only their own exact tag', async () => {
        const res = await as(ALICE).get(`/api/reports/client/${aliceClient}?project=client%20launch`);
        expect(res.status).toBe(200);
        expect(res.body.workEntries.map((r) => r.description)).toEqual(['lower-case']);
        expect(res.body.entryCount).toBe(1);
        expect(res.body.totalHours).toBeCloseTo(1, 5);
      });

      test.each([
        ['substring', 'Client'],
        ['suffix', 'Launch'],
        ['SQL LIKE wildcard %', 'Client%'],
        ['SQL LIKE wildcard _', '_lient Launch'],
        ['bare %', '%'],
        ['glob wildcard', 'Client*'],
        ['upper case variant', 'CLIENT LAUNCH'],
        ['quote injection', "' OR '1'='1"],
        ['50-character value', 'z'.repeat(50)]
      ])('a valid filter with no exact match (%s) returns an empty report, not an error', async (_label, value) => {
        const res = await as(ALICE).get(`/api/reports/client/${aliceClient}?project=${encodeURIComponent(value)}`);
        expect(res.status).toBe(200);
        expect(res.body.client).toMatchObject({ id: aliceClient, name: 'Alice Client' });
        expect(res.body.workEntries).toEqual([]);
        expect(res.body.totalHours).toBe(0);
        expect(res.body.entryCount).toBe(0);
      });

      test.each([
        ['empty', 'project='],
        ['whitespace-only', 'project=%20%20%20'],
        ['repeated', 'project=Client%20Launch&project=Client%20Launch'],
        ['structured (object)', 'project[name]=Client%20Launch'],
        ['structured (array)', 'project[]=Client%20Launch'],
        ['over 50 characters', `project=${'a'.repeat(51)}`],
        ['over 50 characters after trimming', `project=%20${'a'.repeat(51)}%20`]
      ])('an invalid project query (%s) returns 400 validation error', async (_label, qs) => {
        const res = await as(ALICE).get(`/api/reports/client/${aliceClient}?${qs}`);
        expectValidationError(res);
      });

      test('tenant isolation: another user gets 404 for the client, with or without a filter', async () => {
        const filtered = await as(BOB).get(`/api/reports/client/${aliceClient}?project=Client%20Launch`);
        expect(filtered.status).toBe(404);
        expect(filtered.body).toEqual({ error: 'Client not found' });

        const own = await as(BOB).get(`/api/reports/client/${bobClient}?project=Client%20Launch`);
        expect(own.status).toBe(200);
        expect(own.body.workEntries.map((r) => r.description)).toEqual(['bob-entry']);
        expect(own.body.totalHours).toBeCloseTo(6, 5);
      });

      test('filtering is scoped to the requested client', async () => {
        const res = await as(ALICE).get(`/api/reports/client/${aliceOtherClient}?project=Client%20Launch`);
        expect(res.status).toBe(200);
        expect(res.body.workEntries.map((r) => r.description)).toEqual(['other-client']);
        expect(res.body.entryCount).toBe(1);
      });

      test('unknown client with a valid filter returns 404 Client not found', async () => {
        const res = await as(ALICE).get('/api/reports/client/999999?project=Client%20Launch');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'Client not found' });
      });
    });

    describe('GET /api/reports/export/csv/:clientId', () => {
      test('without the parameter exports all rows with the existing columns', async () => {
        const res = await getBinary(ALICE, `/api/reports/export/csv/${aliceClient}`);
        expect(res.status).toBe(200);
        const text = res.body.toString('utf8');
        expect(csvHeader(text)).toBe('Date,Hours,Description,Created At');
        expect(csvDataLines(text)).toHaveLength(5);
        expect(text).toContain('untagged');
      });

      test('a filter exports only the exact-match rows with unchanged columns', async () => {
        const res = await getBinary(ALICE, `/api/reports/export/csv/${aliceClient}?project=Client%20Launch`);
        expect(res.status).toBe(200);
        const text = res.body.toString('utf8');
        expect(csvHeader(text)).toBe('Date,Hours,Description,Created At');
        const lines = csvDataLines(text);
        expect(lines).toHaveLength(2);
        expect(lines.some((l) => l.includes('launch-1'))).toBe(true);
        expect(lines.some((l) => l.includes('launch-2'))).toBe(true);
        ['lower-case', 'superstring', 'untagged', 'other-client', 'bob-entry'].forEach((d) => expect(text).not.toContain(d));
      });

      test('no matches keeps the existing format (same as an export with no rows)', async () => {
        const emptyClient = await createClient(ALICE, 'Empty Client');
        const baseline = await getBinary(ALICE, `/api/reports/export/csv/${emptyClient}`);
        expect(baseline.status).toBe(200);

        const res = await getBinary(ALICE, `/api/reports/export/csv/${aliceClient}?project=No%20Such%20Tag`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe(baseline.headers['content-type']);
        expect(res.body.toString('utf8')).toBe(baseline.body.toString('utf8'));
      });

      test.each([
        ['empty', 'project='],
        ['repeated', 'project=a&project=b'],
        ['structured', 'project[x]=a'],
        ['over 50 characters', `project=${'a'.repeat(51)}`]
      ])('an invalid project query (%s) returns 400 validation error', async (_label, qs) => {
        const res = await getBinary(ALICE, `/api/reports/export/csv/${aliceClient}?${qs}`);
        expect(res.status).toBe(400);
        const body = parseJsonBody(res);
        expect(body.error).toBe('Validation error');
        expect(Array.isArray(body.details)).toBe(true);
        expect(body.details.length).toBeGreaterThan(0);
      });

      test('tenant isolation: another user gets 404 Client not found', async () => {
        const res = await getBinary(BOB, `/api/reports/export/csv/${aliceClient}?project=Client%20Launch`);
        expect(res.status).toBe(404);
        expect(parseJsonBody(res)).toEqual({ error: 'Client not found' });
      });
    });

    describe('GET /api/reports/export/pdf/:clientId', () => {
      test('without the parameter exports all rows', async () => {
        const res = await getBinary(ALICE, `/api/reports/export/pdf/${aliceClient}`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/pdf');
        const text = pdfText(res.body);
        expect(text).toContain('Total Entries: 5');
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
        ['lower-case', 'superstring', 'untagged', 'other-client', 'bob-entry'].forEach((d) => expect(text).not.toContain(d));
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

      test.each([
        ['whitespace-only', 'project=%20'],
        ['repeated', 'project=a&project=b'],
        ['structured', 'project[]=a'],
        ['over 50 characters', `project=${'a'.repeat(51)}`]
      ])('an invalid project query (%s) returns 400 validation error', async (_label, qs) => {
        const res = await getBinary(ALICE, `/api/reports/export/pdf/${aliceClient}?${qs}`);
        expect(res.status).toBe(400);
        const body = parseJsonBody(res);
        expect(body.error).toBe('Validation error');
        expect(Array.isArray(body.details)).toBe(true);
        expect(body.details.length).toBeGreaterThan(0);
      });

      test('tenant isolation: another user gets 404 Client not found', async () => {
        const res = await getBinary(BOB, `/api/reports/export/pdf/${aliceClient}?project=Client%20Launch`);
        expect(res.status).toBe(404);
        expect(parseJsonBody(res)).toEqual({ error: 'Client not found' });
      });
    });
  });
});
