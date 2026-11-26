const sqlite3 = require('sqlite3');
const { getDatabase, initializeDatabase, closeDatabase } = require('../../database/init');

// Mock sqlite3
jest.mock('sqlite3', () => {
  const mockDatabase = {
    serialize: jest.fn((callback) => callback()),
    run: jest.fn((query, paramsOrCallback, callback) => {
      const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
      if (typeof cb === 'function') cb(null);
    }),
    get: jest.fn((query, paramsOrCallback, callback) => {
      const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
      if (typeof cb === 'function') cb(null, { version: null });
    }),
    exec: jest.fn((sql, callback) => callback(null)),
    close: jest.fn((callback) => callback(null))
  };

  return {
    verbose: jest.fn(() => ({
      Database: jest.fn((path, callback) => {
        callback(null);
        return mockDatabase;
      })
    }))
  };
});

describe('Database Initialization', () => {
  let consoleLogSpy, consoleErrorSpy;

  const executedSql = (db) => [
    ...db.run.mock.calls.map(call => call[0]),
    ...db.exec.mock.calls.map(call => call[0])
  ];

  const statementFor = (db, prefix) => executedSql(db)
    .flatMap(sql => sql.split(';'))
    .map(statement => statement.trim())
    .find(statement => statement.startsWith(prefix));

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Reset the database singleton
    jest.resetModules();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('getDatabase', () => {
    test('should create and return database instance', () => {
      const db = getDatabase();
      
      expect(db).toBeDefined();
      expect(consoleLogSpy).toHaveBeenCalledWith('Connected to SQLite in-memory database');
    });

    test('should return same database instance on multiple calls', () => {
      const db1 = getDatabase();
      const db2 = getDatabase();
      
      expect(db1).toBe(db2);
    });

    test('should handle database connection error', () => {
      jest.resetModules();
      
      jest.doMock('sqlite3', () => {
        return {
          verbose: jest.fn(() => ({
            Database: jest.fn((path, callback) => {
              callback(new Error('Connection failed'));
              return {};
            })
          }))
        };
      });

      const { getDatabase: getDatabaseWithError } = require('../../database/init');
      
      expect(() => getDatabaseWithError()).toThrow('Connection failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error opening database:', expect.any(Error));
    });
  });

  describe('initializeDatabase', () => {
    test('should create all required tables', async () => {
      const db = getDatabase();
      await initializeDatabase();

      expect(db.exec).toHaveBeenCalled();

      const queries = executedSql(db);
      
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS users'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS clients'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS work_entries'))).toBe(true);
    });

    test('should create indexes for performance', async () => {
      const db = getDatabase();
      await initializeDatabase();

      const queries = executedSql(db);
      
      expect(queries.some(q => q.includes('CREATE INDEX IF NOT EXISTS idx_clients_user_email'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE INDEX IF NOT EXISTS idx_work_entries_client_id'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE INDEX IF NOT EXISTS idx_work_entries_user_email'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE INDEX IF NOT EXISTS idx_work_entries_date'))).toBe(true);
    });

    test('should log success message', async () => {
      await initializeDatabase();
      
      expect(consoleLogSpy).toHaveBeenCalledWith('Database tables created successfully');
    });

    test('should resolve promise on success', async () => {
      await expect(initializeDatabase()).resolves.toBeUndefined();
    });

    test('should create schema_migrations table', async () => {
      const db = getDatabase();
      await initializeDatabase();

      const query = executedSql(db).find(sql => sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations'));
      expect(query).toContain('version INTEGER PRIMARY KEY');
      expect(query).toContain('applied_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    });

    test('should apply pending migration in a transaction and record it', async () => {
      const db = getDatabase();
      await initializeDatabase();

      const runQueries = db.run.mock.calls.map(call => call[0]);
      const runOrder = (match) => {
        const idx = runQueries.findIndex(match);
        expect(idx).toBeGreaterThan(-1);
        return db.run.mock.invocationCallOrder[idx];
      };
      const beginOrder = runOrder(q => q === 'BEGIN');
      const insertOrder = runOrder(q => q.includes('INSERT INTO schema_migrations'));
      const commitOrder = runOrder(q => q === 'COMMIT');
      const [schemaOrder] = db.exec.mock.invocationCallOrder;

      expect(db.exec.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS users');
      expect(schemaOrder).toBeGreaterThan(beginOrder);
      expect(insertOrder).toBeGreaterThan(schemaOrder);
      expect(commitOrder).toBeGreaterThan(insertOrder);
      expect(db.run.mock.calls[runQueries.findIndex(q => q.includes('INSERT INTO schema_migrations'))][1])
        .toEqual([1, 'initial_schema']);
      expect(runQueries).not.toContain('ROLLBACK');
    });

    test('should skip migrations that are already applied', async () => {
      const db = getDatabase();
      db.get.mockImplementationOnce((query, params, callback) => callback(null, { version: 2 }));

      await initializeDatabase();

      expect(db.exec).not.toHaveBeenCalled();
      expect(db.run.mock.calls.map(call => call[0])).not.toContain('BEGIN');
    });

    test('should roll back and reject when a migration fails', async () => {
      const db = getDatabase();
      db.exec.mockImplementationOnce((sql, callback) => callback(new Error('Migration failed')));

      await expect(initializeDatabase()).rejects.toThrow('Migration failed');

      const runQueries = db.run.mock.calls.map(call => call[0]);
      expect(runQueries).toContain('ROLLBACK');
      expect(runQueries).not.toContain('COMMIT');
      expect(runQueries.some(q => q.includes('INSERT INTO schema_migrations'))).toBe(false);
    });
  });

  describe('closeDatabase', () => {
    test('should close database connection', () => {
      const db = getDatabase();
      closeDatabase();

      expect(db.close).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('Database connection closed');
    });

    test('should handle close error gracefully', () => {
      const db = getDatabase();
      db.close.mockImplementation((callback) => callback(new Error('Close error')));

      closeDatabase();

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error closing database:', expect.any(Error));
    });

    test('should handle multiple close calls safely', () => {
      const db = getDatabase();
      // Reset close mock to default behavior (no error)
      db.close.mockImplementation((callback) => callback(null));
      closeDatabase();
      closeDatabase(); // Second call should not throw

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('Database Schema', () => {
    test('users table should have correct structure', async () => {
      const db = getDatabase();
      await initializeDatabase();

      const userTableQuery = statementFor(db, 'CREATE TABLE IF NOT EXISTS users');

      expect(userTableQuery).toBeDefined();
      expect(userTableQuery).toContain('email TEXT PRIMARY KEY');
      expect(userTableQuery).toContain('created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    });

    test('clients table should have foreign key to users', async () => {
      const db = getDatabase();
      await initializeDatabase();

      const clientTableQuery = statementFor(db, 'CREATE TABLE IF NOT EXISTS clients');

      expect(clientTableQuery).toBeDefined();
      expect(clientTableQuery).toContain('user_email TEXT NOT NULL');
      expect(clientTableQuery).toContain('FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE');
    });

    test('work_entries table should have foreign keys', async () => {
      const db = getDatabase();
      await initializeDatabase();

      const workEntriesQuery = statementFor(db, 'CREATE TABLE IF NOT EXISTS work_entries');

      expect(workEntriesQuery).toBeDefined();
      expect(workEntriesQuery).toContain('FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE');
      expect(workEntriesQuery).toContain('FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE');
    });
  });
});
