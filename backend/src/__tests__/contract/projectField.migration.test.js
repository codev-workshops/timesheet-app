// Contract acceptance suite: `work_entries.project` schema + idempotent migration
// (CONTRACT.md "Database"). Each scenario runs in a child Node process against a
// real SQLite database, for both init.js copies.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BACKEND_ROOT = path.resolve(__dirname, '../../..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');
const INIT_FILES = [
  ['backend/src/database/init.js', path.join(BACKEND_ROOT, 'src/database/init.js')],
  ['docker/overrides/database/init.js', path.join(REPO_ROOT, 'docker/overrides/database/init.js')]
];

const CHILD_SCRIPT = `
const [initPath, mode] = process.argv.slice(1);
const consoleErrors = [];
console.error = (...args) => consoleErrors.push(args.map(String).join(' '));
console.log = () => {};
const { getDatabase, initializeDatabase, closeDatabase } = require(initPath);
const db = getDatabase();
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, (e) => (e ? rej(e) : res())));
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const columns = () => all('PRAGMA table_info(work_entries)');
async function settle() {
  for (let i = 0; i < 40; i++) {
    if ((await columns()).some((c) => c.name === 'project')) break;
    await sleep(25);
  }
  await sleep(100);
}
(async () => {
  if (mode === 'legacy') {
    await run('CREATE TABLE users (email TEXT PRIMARY KEY, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
    await run(\`CREATE TABLE clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
      department TEXT, email TEXT, user_email TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)\`);
    await run(\`CREATE TABLE work_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, user_email TEXT NOT NULL,
      hours DECIMAL(5,2) NOT NULL, description TEXT, date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)\`);
    await run("INSERT INTO users (email) VALUES ('legacy@example.com')");
    await run("INSERT INTO clients (name, user_email) VALUES ('Legacy Co', 'legacy@example.com')");
    await run("INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (1, 'legacy@example.com', 2, 'legacy row', '2023-01-01')");
  }
  const runs = Number(process.env.INIT_RUNS || 2);
  const initErrors = [];
  for (let i = 0; i < runs; i++) {
    try { await initializeDatabase(); } catch (e) { initErrors.push(String(e && e.message || e)); }
    await settle();
  }
  const cols = await columns();
  let insertError = null;
  try {
    await run("INSERT OR IGNORE INTO users (email) VALUES ('probe@example.com')");
    await run("INSERT INTO clients (name, user_email) VALUES ('Probe Co', 'probe@example.com')");
    await run("INSERT INTO work_entries (client_id, user_email, hours, description, date, project) VALUES ((SELECT MAX(id) FROM clients), 'probe@example.com', 1, 'probe', '2024-01-01', 'Probe')");
  } catch (e) { insertError = String(e.message || e); }
  const rows = await all('SELECT description, project FROM work_entries ORDER BY id');
  await closeDatabase();
  process.stdout.write('__RESULT__' + JSON.stringify({ cols, rows, initErrors, consoleErrors, insertError }) + '\\n');
})().catch((e) => {
  process.stdout.write('__RESULT__' + JSON.stringify({ fatal: String(e && e.stack || e) }) + '\\n');
});
`;

function runInit(initPath, mode, env = {}) {
  const proc = spawnSync(process.execPath, ['-e', CHILD_SCRIPT, initPath, mode], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, NODE_PATH: path.join(BACKEND_ROOT, 'node_modules'), ...env }
  });
  const line = (proc.stdout || '').split('\n').find((l) => l.startsWith('__RESULT__'));
  if (!line) {
    throw new Error(`init child produced no result (status ${proc.status}): ${proc.stderr}`);
  }
  const result = JSON.parse(line.slice('__RESULT__'.length));
  if (result.fatal) throw new Error(result.fatal);
  return result;
}

function expectProjectColumn(cols) {
  const projectCols = cols.filter((c) => c.name === 'project');
  expect(projectCols).toHaveLength(1);
  expect(projectCols[0].type.toUpperCase()).toBe('TEXT');
  expect(projectCols[0].notnull).toBe(0);
  expect(projectCols[0].dflt_value === null || /^null$/i.test(projectCols[0].dflt_value)).toBe(true);
}

function expectCleanInit(result) {
  expect(result.initErrors).toEqual([]);
  expect(result.consoleErrors).toEqual([]);
  expect(result.insertError).toBeNull();
}

describe.each(INIT_FILES)('Contract: work_entries.project schema in %s', (_label, initPath) => {
  test('fresh database gets a nullable TEXT project column (init run twice)', () => {
    const result = runInit(initPath, 'fresh');
    expectCleanInit(result);
    expectProjectColumn(result.cols);
    expect(result.rows).toEqual([{ description: 'probe', project: 'Probe' }]);
  });

  test('legacy table without project is migrated idempotently; existing rows stay NULL', () => {
    const result = runInit(initPath, 'legacy', { INIT_RUNS: '3' });
    expectCleanInit(result);
    expectProjectColumn(result.cols);
    expect(result.rows).toEqual([
      { description: 'legacy row', project: null },
      { description: 'probe', project: 'Probe' }
    ]);
  });
});

describe('Contract: docker init.js migrates a persisted legacy database across restarts', () => {
  let tmpDir;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-contract-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('first start migrates, second start is a no-op that keeps data', () => {
    const dockerInit = INIT_FILES[1][1];
    const env = { DATABASE_PATH: path.join(tmpDir, 'timesheet.db'), INIT_RUNS: '1' };

    const first = runInit(dockerInit, 'legacy', env);
    expectCleanInit(first);
    expectProjectColumn(first.cols);

    const second = runInit(dockerInit, 'reopen', env);
    expectCleanInit(second);
    expectProjectColumn(second.cols);
    expect(second.rows).toEqual([
      { description: 'legacy row', project: null },
      { description: 'probe', project: 'Probe' },
      { description: 'probe', project: 'Probe' }
    ]);
  });
});
