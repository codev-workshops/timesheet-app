const sqlite3 = require('sqlite3');
const { getDatabase, initializeDatabase, closeDatabase } = require('../../database/init');

// Mock sqlite3
jest.mock('sqlite3', () => {
  const mockDatabase = {
    serialize: jest.fn((callback) => callback()),
    run: jest.fn((query, callback) => {
      if (typeof callback === 'function') callback(null);
    }),
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

      expect(db.serialize).toHaveBeenCalled();
      expect(db.run).toHaveBeenCalled();
      
      // Check that run was called for each table and index
      const runCalls = db.run.mock.calls;
      const queries = runCalls.map(call => call[0]);
      
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS users'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS clients'))).toBe(true);
      expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS work_entries'))).toBe(true);
    });

    test('should create indexes for performance', async () => {
      const db = getDatabase();
      await initializeDatabase();

      const runCalls = db.run.mock.calls;
      const queries = runCalls.map(call => call[0]);
      
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

      const userTableQuery = db.run.mock.calls.find(call => 
        call[0].includes('CREATE TABLE IF NOT EXISTS users')
      );

      expect(userTableQuery).toBeDefined();
      expect(userTableQuery[0]).toContain('email TEXT PRIMARY KEY');
      expect(userTableQuery[0]).toContain('created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
    });

    test('clients table should have foreign key to users', async () => {
      const db = getDatabase();
      await initializeDatabase();

      const clientTableQuery = db.run.mock.calls.find(call => 
        call[0].includes('CREATE TABLE IF NOT EXISTS clients')
      );

      expect(clientTableQuery).toBeDefined();
      expect(clientTableQuery[0]).toContain('user_email TEXT NOT NULL');
      expect(clientTableQuery[0]).toContain('FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE');
    });

    test('work_entries table should have foreign keys', async () => {
      const db = getDatabase();
      await initializeDatabase();

      const workEntriesQuery = db.run.mock.calls.find(call => 
        call[0].includes('CREATE TABLE IF NOT EXISTS work_entries')
      );

      expect(workEntriesQuery).toBeDefined();
      expect(workEntriesQuery[0]).toContain('FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE');
      expect(workEntriesQuery[0]).toContain('FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE');
    });
  });
});

describe('Database lifecycle (isolated module instances)', () => {
  let consoleLogSpy, consoleErrorSpy;

  const loadFreshModule = (closeImpl) => {
    const mockDb = {
      serialize: jest.fn((callback) => callback()),
      run: jest.fn((query, callback) => {
        if (typeof callback === 'function') callback(null);
      }),
      close: jest.fn(closeImpl || ((callback) => callback(null)))
    };
    const DatabaseCtor = jest.fn((path, callback) => {
      if (callback) callback(null);
      return mockDb;
    });
    let mod;
    jest.isolateModules(() => {
      jest.doMock('sqlite3', () => ({ verbose: jest.fn(() => ({ Database: DatabaseCtor })) }));
      mod = require('../../database/init');
    });
    return { mod, mockDb, DatabaseCtor };
  };

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  test('opens an in-memory database', () => {
    const { mod, DatabaseCtor } = loadFreshModule();
    mod.getDatabase();
    expect(DatabaseCtor).toHaveBeenCalledTimes(1);
    expect(DatabaseCtor).toHaveBeenCalledWith(':memory:', expect.any(Function));
  });

  test('initializeDatabase lazily opens the connection', async () => {
    const { mod, DatabaseCtor, mockDb } = loadFreshModule();
    await mod.initializeDatabase();
    expect(DatabaseCtor).toHaveBeenCalledTimes(1);
    expect(mockDb.serialize).toHaveBeenCalledTimes(1);
  });

  test('creates the composite (user_email, date) index on work_entries', async () => {
    const { mod, mockDb } = loadFreshModule();
    await mod.initializeDatabase();
    const queries = mockDb.run.mock.calls.map((call) => call[0]);
    expect(queries).toContain(
      'CREATE INDEX IF NOT EXISTS idx_work_entries_user_email_date ON work_entries (user_email, date)'
    );
  });

  test('creates exactly 3 tables and 5 indexes', async () => {
    const { mod, mockDb } = loadFreshModule();
    await mod.initializeDatabase();
    const queries = mockDb.run.mock.calls.map((call) => call[0]);
    expect(queries.filter((q) => q.includes('CREATE TABLE IF NOT EXISTS'))).toHaveLength(3);
    expect(queries.filter((q) => q.includes('CREATE INDEX IF NOT EXISTS'))).toHaveLength(5);
  });

  test('work_entries table scopes rows by user_email and requires core columns', async () => {
    const { mod, mockDb } = loadFreshModule();
    await mod.initializeDatabase();
    const query = mockDb.run.mock.calls
      .map((call) => call[0])
      .find((q) => q.includes('CREATE TABLE IF NOT EXISTS work_entries'));
    expect(query).toContain('user_email TEXT NOT NULL');
    expect(query).toContain('client_id INTEGER NOT NULL');
    expect(query).toContain('hours DECIMAL(5,2) NOT NULL');
    expect(query).toContain('date DATE NOT NULL');
  });

  test('initializeDatabase is idempotent across repeated calls', async () => {
    const { mod, DatabaseCtor, mockDb } = loadFreshModule();
    await mod.initializeDatabase();
    await mod.initializeDatabase();
    expect(DatabaseCtor).toHaveBeenCalledTimes(1);
    expect(mockDb.serialize).toHaveBeenCalledTimes(2);
  });

  test('closeDatabase resolves without closing when no connection exists', async () => {
    const { mod, mockDb } = loadFreshModule();
    await expect(mod.closeDatabase()).resolves.toBeUndefined();
    expect(mockDb.close).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalledWith('Database connection closed');
  });

  test('closeDatabase resolves after closing an open connection', async () => {
    const { mod, mockDb } = loadFreshModule();
    mod.getDatabase();
    await expect(mod.closeDatabase()).resolves.toBeUndefined();
    expect(mockDb.close).toHaveBeenCalledTimes(1);
    expect(consoleLogSpy).toHaveBeenCalledWith('Database connection closed');
  });

  test('closeDatabase still resolves when close reports an error', async () => {
    const { mod, mockDb } = loadFreshModule((callback) => callback(new Error('Close error')));
    mod.getDatabase();
    await expect(mod.closeDatabase()).resolves.toBeUndefined();
    expect(mockDb.close).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error closing database:', expect.any(Error));
  });

  test('second close after completion resolves immediately without closing again', async () => {
    const { mod, mockDb } = loadFreshModule();
    mod.getDatabase();
    await mod.closeDatabase();
    await expect(mod.closeDatabase()).resolves.toBeUndefined();
    expect(mockDb.close).toHaveBeenCalledTimes(1);
  });

  test('concurrent close waits for the in-flight close to finish', async () => {
    jest.useFakeTimers();
    let finishClose;
    const { mod, mockDb } = loadFreshModule((callback) => {
      finishClose = callback;
    });
    mod.getDatabase();

    let firstDone = false;
    let secondDone = false;
    const first = mod.closeDatabase().then(() => { firstDone = true; });
    const second = mod.closeDatabase().then(() => { secondDone = true; });

    jest.advanceTimersByTime(50);
    await Promise.resolve();
    expect(firstDone).toBe(false);
    expect(secondDone).toBe(false);
    expect(mockDb.close).toHaveBeenCalledTimes(1);

    finishClose(null);
    await first;
    expect(firstDone).toBe(true);

    jest.advanceTimersByTime(10);
    await second;
    expect(secondDone).toBe(true);
    expect(mockDb.close).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('getDatabase opens a new connection after close', async () => {
    const { mod, DatabaseCtor } = loadFreshModule();
    mod.getDatabase();
    await mod.closeDatabase();
    mod.getDatabase();
    expect(DatabaseCtor).toHaveBeenCalledTimes(2);

    await mod.closeDatabase();
    expect(DatabaseCtor).toHaveBeenCalledTimes(2);
  });
});
