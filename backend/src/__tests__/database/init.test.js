jest.unmock('sqlite3');

const { getDatabase, initializeDatabase, closeDatabase } = require('../../database/init');

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function columns(db, table) {
  return (await all(db, `PRAGMA table_info(${table})`)).map((c) => c.name);
}

describe('Database Initialization', () => {
  let consoleLogSpy, consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(async () => {
    await closeDatabase();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('getDatabase', () => {
    test('should create and return database instance', async () => {
      const db = getDatabase();
      await all(db, 'SELECT 1');

      expect(db).toBeDefined();
      expect(consoleLogSpy).toHaveBeenCalledWith('Connected to SQLite in-memory database');
    });

    test('should return same database instance on multiple calls', () => {
      expect(getDatabase()).toBe(getDatabase());
    });

    test('should handle database connection error', () => {
      jest.isolateModules(() => {
        jest.doMock('sqlite3', () => ({
          verbose: jest.fn(() => ({
            Database: jest.fn((path, callback) => {
              callback(new Error('Connection failed'));
              return {};
            })
          }))
        }));

        const { getDatabase: getDatabaseWithError } = require('../../database/init');

        expect(() => getDatabaseWithError()).toThrow('Connection failed');
        expect(consoleErrorSpy).toHaveBeenCalledWith('Error opening database:', expect.any(Error));
      });
      jest.dontMock('sqlite3');
    });
  });

  describe('initializeDatabase', () => {
    test('should create all required tables via migrations', async () => {
      await initializeDatabase();

      const tables = (await all(getDatabase(), "SELECT name FROM sqlite_master WHERE type = 'table'"))
        .map((t) => t.name);

      expect(tables).toEqual(expect.arrayContaining([
        'users', 'clients', 'work_entries', 'projects', 'knex_migrations'
      ]));
    });

    test('should record all migrations as applied', async () => {
      await initializeDatabase();

      const applied = (await all(getDatabase(), 'SELECT name FROM knex_migrations ORDER BY id'))
        .map((m) => m.name);

      expect(applied).toEqual([
        '000_baseline.js',
        '001_create_projects.js',
        '002_add_project_id_to_work_entries.js'
      ]);
    });

    test('should create indexes for performance', async () => {
      await initializeDatabase();

      const indexes = (await all(getDatabase(), "SELECT name FROM sqlite_master WHERE type = 'index'"))
        .map((i) => i.name);

      expect(indexes).toEqual(expect.arrayContaining([
        'idx_clients_user_email',
        'idx_work_entries_client_id',
        'idx_work_entries_user_email',
        'idx_work_entries_date',
        'idx_projects_client_id',
        'idx_work_entries_project_id'
      ]));
    });

    test('should log success message', async () => {
      await initializeDatabase();

      expect(consoleLogSpy).toHaveBeenCalledWith('Database migrations applied successfully');
    });

    test('should be idempotent when run twice', async () => {
      await initializeDatabase();
      await expect(initializeDatabase()).resolves.toBeUndefined();

      const [{ count }] = await all(getDatabase(), 'SELECT COUNT(*) AS count FROM knex_migrations');
      expect(count).toBe(3);
    });

    test('should enable foreign key enforcement on the shared connection', async () => {
      await initializeDatabase();

      const [{ foreign_keys: fk }] = await all(getDatabase(), 'PRAGMA foreign_keys');
      expect(fk).toBe(1);
      await expect(
        run(getDatabase(), 'INSERT INTO clients (name, user_email) VALUES (?, ?)', ['Acme', 'missing@example.com'])
      ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    });

    test('should baseline an already-initialized legacy database without changes', async () => {
      const db = getDatabase();
      await run(db, 'CREATE TABLE users (email TEXT PRIMARY KEY, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
      await run(db, "INSERT INTO users (email) VALUES ('legacy@example.com')");

      await initializeDatabase();

      const users = await all(db, 'SELECT email FROM users');
      expect(users).toEqual([{ email: 'legacy@example.com' }]);
      expect(await columns(db, 'work_entries')).toContain('project_id');
    });
  });

  describe('closeDatabase', () => {
    test('should close database connection', async () => {
      getDatabase();
      await closeDatabase();

      expect(consoleLogSpy).toHaveBeenCalledWith('Database connection closed');
    });

    test('should handle multiple close calls safely', async () => {
      getDatabase();
      await Promise.all([closeDatabase(), closeDatabase()]);
      await closeDatabase();

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    test('should resolve when no database is open', async () => {
      await expect(closeDatabase()).resolves.toBeUndefined();
    });
  });

  describe('Database Schema', () => {
    beforeEach(async () => {
      await initializeDatabase();
    });

    test('users table should have correct structure', async () => {
      const info = await all(getDatabase(), 'PRAGMA table_info(users)');
      const email = info.find((c) => c.name === 'email');

      expect(email.pk).toBe(1);
      expect(info.map((c) => c.name)).toEqual(['email', 'created_at']);
    });

    test('clients table should have foreign key to users', async () => {
      const fks = await all(getDatabase(), 'PRAGMA foreign_key_list(clients)');

      expect(await columns(getDatabase(), 'clients')).toEqual([
        'id', 'name', 'description', 'department', 'email', 'user_email', 'created_at', 'updated_at'
      ]);
      expect(fks).toEqual([
        expect.objectContaining({ table: 'users', from: 'user_email', to: 'email', on_delete: 'CASCADE' })
      ]);
    });

    test('work_entries table should have foreign keys', async () => {
      const fks = await all(getDatabase(), 'PRAGMA foreign_key_list(work_entries)');

      expect(fks).toEqual(expect.arrayContaining([
        expect.objectContaining({ table: 'clients', from: 'client_id', to: 'id', on_delete: 'CASCADE' }),
        expect.objectContaining({ table: 'users', from: 'user_email', to: 'email', on_delete: 'CASCADE' }),
        expect.objectContaining({ table: 'projects', from: 'project_id', to: 'id', on_delete: 'SET NULL' })
      ]));
    });
  });
});
