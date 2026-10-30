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
  describe('closeDatabase lifecycle', () => {
    let initModule;
    let sqlite3Mock;

    beforeEach(() => {
      // Earlier tests may leave an erroring sqlite3 mock registered via doMock
      jest.doMock('sqlite3', () => {
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

      jest.isolateModules(() => {
        sqlite3Mock = require('sqlite3');
        initModule = require('../../database/init');
      });
    });

    test('should resolve immediately when no database has been opened', async () => {
      await expect(initModule.closeDatabase()).resolves.toBeUndefined();

      expect(sqlite3Mock.verbose).toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalledWith('Database connection closed');
    });

    test('should close an open database and resolve', async () => {
      const db = initModule.getDatabase();

      await expect(initModule.closeDatabase()).resolves.toBeUndefined();

      expect(db.close).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith('Database connection closed');
    });

    test('should resolve without closing again when already closed', async () => {
      const db = initModule.getDatabase();
      await initModule.closeDatabase();
      db.close.mockClear();

      await expect(initModule.closeDatabase()).resolves.toBeUndefined();

      expect(db.close).not.toHaveBeenCalled();
    });

    test('should resolve after close error and mark database as closed', async () => {
      const db = initModule.getDatabase();
      db.close.mockImplementationOnce((callback) => callback(new Error('Close error')));

      await expect(initModule.closeDatabase()).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error closing database:', expect.any(Error));

      db.close.mockClear();
      await initModule.closeDatabase();
      expect(db.close).not.toHaveBeenCalled();
    });

    test('should wait for an in-progress close to finish on concurrent calls', async () => {
      jest.useFakeTimers();
      try {
        const db = initModule.getDatabase();
        let finishClose;
        db.close.mockImplementationOnce((callback) => {
          finishClose = () => callback(null);
        });

        const firstClose = initModule.closeDatabase();
        let secondResolved = false;
        const secondClose = initModule.closeDatabase().then(() => {
          secondResolved = true;
        });

        expect(db.close).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(50);
        await Promise.resolve();
        expect(secondResolved).toBe(false);

        finishClose();
        await firstClose;

        jest.advanceTimersByTime(10);
        await secondClose;

        expect(secondResolved).toBe(true);
        expect(db.close).toHaveBeenCalledTimes(1);
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });

    test('should open a new connection after close and allow closing it again', async () => {
      const db = initModule.getDatabase();
      await initModule.closeDatabase();
      db.close.mockClear();

      const reopened = initModule.getDatabase();
      expect(reopened).toBeDefined();

      await initModule.closeDatabase();
      expect(reopened.close).toHaveBeenCalledTimes(1);
    });
  });
});
