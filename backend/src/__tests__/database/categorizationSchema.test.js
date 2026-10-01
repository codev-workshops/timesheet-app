jest.unmock('sqlite3');

const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const { silenceConsole } = require('../helpers/realDatabase');
const { CATEGORY_NAMES } = require('../../services/categorization/categories');

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
}

describe('categorization schema (real SQLite)', () => {
  let restoreConsole;
  let tmpDir;
  const originalDbFile = process.env.DB_FILE;

  beforeEach(() => {
    restoreConsole = silenceConsole();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timesheet-db-'));
    jest.resetModules();
  });

  afterEach(() => {
    restoreConsole();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalDbFile === undefined) delete process.env.DB_FILE;
    else process.env.DB_FILE = originalDbFile;
  });

  test('seeds categories and adds categorization columns', async () => {
    delete process.env.DB_FILE;
    const { initializeDatabase, getDatabase, closeDatabase } = require('../../database/init');
    await initializeDatabase();
    const db = getDatabase();

    const categories = await all(db, 'SELECT name FROM categories ORDER BY id');
    expect(categories.map(c => c.name)).toEqual(CATEGORY_NAMES);
    const columns = (await all(db, 'PRAGMA table_info(work_entries)')).map(c => c.name);
    expect(columns).toEqual(expect.arrayContaining([
      'category_id', 'categorization_status', 'categorization_source',
      'categorized_at', 'categorization_model', 'prompt_version'
    ]));
    await closeDatabase();
  });

  test('DB_FILE persists data across connections and initialization is re-runnable', async () => {
    process.env.DB_FILE = path.join(tmpDir, 'nested', 'timesheet.db');
    let init = require('../../database/init');
    await init.initializeDatabase();
    await new Promise((resolve, reject) => init.getDatabase().run(
      "INSERT INTO users (email) VALUES ('persist@example.com')", err => (err ? reject(err) : resolve())
    ));
    await init.closeDatabase();

    jest.resetModules();
    init = require('../../database/init');
    await init.initializeDatabase();
    const users = await all(init.getDatabase(), 'SELECT email FROM users');
    const categories = await all(init.getDatabase(), 'SELECT COUNT(*) AS n FROM categories');
    expect(users).toEqual([{ email: 'persist@example.com' }]);
    expect(categories[0].n).toBe(CATEGORY_NAMES.length);
    await init.closeDatabase();
  });

  test('migrates a pre-existing work_entries table in place', async () => {
    const file = path.join(tmpDir, 'legacy.db');
    const legacy = new sqlite3.Database(file);
    await new Promise((resolve, reject) => legacy.exec(`
      CREATE TABLE work_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT, client_id INTEGER NOT NULL, user_email TEXT NOT NULL,
        hours DECIMAL(5,2) NOT NULL, description TEXT, date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (1, 'a@example.com', 1, 'old', '2023-01-01');
    `, err => (err ? reject(err) : resolve())));
    await new Promise(resolve => legacy.close(resolve));

    process.env.DB_FILE = file;
    const init = require('../../database/init');
    await init.initializeDatabase();
    const [row] = await all(init.getDatabase(), 'SELECT description, category_id, categorization_status FROM work_entries');
    expect(row).toEqual({ description: 'old', category_id: null, categorization_status: 'pending' });
    await init.closeDatabase();
  });
});
