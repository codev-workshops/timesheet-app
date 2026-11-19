jest.mock('sqlite3', () => jest.requireActual('sqlite3'));

const { getDatabase, initializeDatabase, closeDatabase } = require('../../database/init');

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

describe('work_entries.project migration (real SQLite)', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(async () => {
    await closeDatabase();
    jest.restoreAllMocks();
  });

  test('adds project to a pre-existing table idempotently without losing data', async () => {
    await run(`CREATE TABLE work_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      user_email TEXT NOT NULL,
      hours DECIMAL(5,2) NOT NULL,
      description TEXT,
      date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await run(
      'INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (?, ?, ?, ?, ?)',
      [1, 'legacy@example.com', 2, 'legacy', '2023-12-31']
    );

    await initializeDatabase();
    await initializeDatabase();

    const columns = await all('PRAGMA table_info(work_entries)');
    const projectColumns = columns.filter((c) => c.name === 'project');
    expect(projectColumns).toHaveLength(1);
    expect(projectColumns[0].type).toBe('TEXT');
    expect(projectColumns[0].notnull).toBe(0);
    expect(projectColumns[0].dflt_value).toBeNull();

    const rows = await all('SELECT description, date, project FROM work_entries');
    expect(rows).toEqual([{ description: 'legacy', date: '2023-12-31', project: null }]);
  });
});
