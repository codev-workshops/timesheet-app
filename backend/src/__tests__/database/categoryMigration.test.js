const path = require('path');

const fs = require('fs');

const BACKEND_INIT = path.join(__dirname, '../../database/init');
const DOCKER_INIT = path.join(__dirname, '../../../../docker/overrides/database/init.js');

function createMockSqlite(runImpl) {
  const mockDatabase = {
    serialize: jest.fn((callback) => callback()),
    run: jest.fn(runImpl),
    close: jest.fn((callback) => callback && callback(null))
  };
  const sqlite3 = {
    verbose: () => ({
      Database: jest.fn((dbPath, callback) => {
        if (callback) callback(null);
        return mockDatabase;
      })
    })
  };
  return { sqlite3, mockDatabase };
}

function loadBackendInit(runImpl) {
  const { sqlite3, mockDatabase } = createMockSqlite(runImpl);
  let init;
  jest.isolateModules(() => {
    jest.doMock('sqlite3', () => sqlite3);
    init = require(BACKEND_INIT);
  });
  return { init, mockDatabase };
}

// The docker override lives outside backend/ (no node_modules on its path), so it is
// evaluated with an injected require instead of going through Jest's module registry.
function loadDockerInit(runImpl) {
  const { sqlite3, mockDatabase } = createMockSqlite(runImpl);
  const source = fs.readFileSync(DOCKER_INIT, 'utf8');
  const module = { exports: {} };
  const injectedRequire = (name) => {
    if (name === 'sqlite3') return sqlite3;
    if (name === 'fs') return { existsSync: () => true, mkdirSync: () => {} };
    return require(name);
  };
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', source)(injectedRequire, module, module.exports);
  return { init: module.exports, mockDatabase };
}

const INIT_MODULES = [
  ['backend', loadBackendInit],
  ['docker override', loadDockerInit]
];

function runWith(errorsByQuery = {}) {
  return (query, paramsOrCallback, callback) => {
    const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
    const match = Object.keys(errorsByQuery).find((key) => query.includes(key));
    if (typeof cb === 'function') cb(match ? errorsByQuery[match] : null);
  };
}

describe.each(INIT_MODULES)('work_entries category migration (%s init.js)', (label, loadInit) => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('declares a nullable category column in CREATE TABLE', async () => {
    const { init, mockDatabase } = loadInit(runWith());
    await init.initializeDatabase();

    const queries = mockDatabase.run.mock.calls.map((call) => call[0]);
    const createWorkEntries = queries.find((q) => q.includes('CREATE TABLE IF NOT EXISTS work_entries'));
    expect(createWorkEntries).toMatch(/category TEXT,/);
    expect(createWorkEntries).not.toMatch(/category TEXT NOT NULL/);
  });

  test('runs the guarded ALTER before creating the category index', async () => {
    const { init, mockDatabase } = loadInit(runWith());
    await expect(init.initializeDatabase()).resolves.toBeUndefined();

    const queries = mockDatabase.run.mock.calls.map((call) => call[0]);
    const alterIndex = queries.indexOf('ALTER TABLE work_entries ADD COLUMN category TEXT');
    const categoryIndex = queries.findIndex((q) => q.includes('idx_work_entries_category'));
    expect(alterIndex).toBeGreaterThan(-1);
    expect(categoryIndex).toBeGreaterThan(alterIndex);
    expect(queries[categoryIndex]).toContain('ON work_entries (category)');
    expect(consoleLogSpy).toHaveBeenCalledWith('Database tables created successfully');
  });

  test('ignores the duplicate column error on an already-migrated database', async () => {
    const { init } = loadInit(
      runWith({ 'ALTER TABLE work_entries': new Error('SQLITE_ERROR: duplicate column name: category') })
    );

    await expect(init.initializeDatabase()).resolves.toBeUndefined();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  test('surfaces any other ALTER error by rejecting', async () => {
    const alterError = new Error('SQLITE_READONLY: attempt to write a readonly database');
    const { init } = loadInit(
      runWith({
        'ALTER TABLE work_entries': alterError,
        idx_work_entries_category: new Error('SQLITE_ERROR: no such column: category')
      })
    );

    await expect(init.initializeDatabase()).rejects.toBe(alterError);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error adding category column:', alterError);
  });

  test('surfaces a category index creation error by rejecting', async () => {
    const indexError = new Error('SQLITE_ERROR: index failure');
    const { init } = loadInit(runWith({ idx_work_entries_category: indexError }));

    await expect(init.initializeDatabase()).rejects.toBe(indexError);
  });

  test('treats an error without a message as a real failure', async () => {
    const bareError = {};
    const { init } = loadInit(runWith({ 'ALTER TABLE work_entries': bareError }));

    await expect(init.initializeDatabase()).rejects.toBe(bareError);
  });
});
