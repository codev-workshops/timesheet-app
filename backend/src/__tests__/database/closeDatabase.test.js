describe('closeDatabase edge cases', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  const loadWithDeferredClose = () => {
    const pending = [];
    const mockDb = {
      serialize: jest.fn((callback) => callback()),
      run: jest.fn(),
      close: jest.fn((callback) => pending.push(callback))
    };
    const Database = jest.fn((path, callback) => {
      callback(null);
      return mockDb;
    });
    jest.doMock('sqlite3', () => ({ verbose: () => ({ Database }) }));
    const init = require('../../database/init');
    const finishClose = (err = null) => pending.shift()(err);
    return { init, mockDb, Database, finishClose };
  };

  beforeEach(() => {
    jest.resetModules();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.dontMock('sqlite3');
  });

  test('resolves immediately when no connection was ever opened', async () => {
    const { init, mockDb } = loadWithDeferredClose();

    await expect(init.closeDatabase()).resolves.toBeUndefined();
    expect(mockDb.close).not.toHaveBeenCalled();
  });

  test('a concurrent close waits for the in-flight close to finish', async () => {
    const { init, mockDb, finishClose } = loadWithDeferredClose();
    init.getDatabase();

    const first = init.closeDatabase();
    const second = init.closeDatabase();
    let secondResolved = false;
    second.then(() => {
      secondResolved = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(mockDb.close).toHaveBeenCalledTimes(1);
    expect(secondResolved).toBe(false);

    finishClose();
    await first;
    await second;
    expect(secondResolved).toBe(true);
    expect(consoleLogSpy).toHaveBeenCalledWith('Database connection closed');
  });

  test('closing an already closed connection is a no-op', async () => {
    const { init, mockDb, finishClose } = loadWithDeferredClose();
    init.getDatabase();

    const first = init.closeDatabase();
    finishClose();
    await first;
    await init.closeDatabase();

    expect(mockDb.close).toHaveBeenCalledTimes(1);
  });

  test('getDatabase opens a fresh connection after close and it can be closed again', async () => {
    const { init, mockDb, Database, finishClose } = loadWithDeferredClose();
    init.getDatabase();
    const first = init.closeDatabase();
    finishClose();
    await first;

    init.getDatabase();
    expect(Database).toHaveBeenCalledTimes(2);

    const second = init.closeDatabase();
    finishClose(new Error('close failed'));
    await second;

    expect(mockDb.close).toHaveBeenCalledTimes(2);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error closing database:', expect.any(Error));
  });

  test('initializeDatabase opens the in-memory database and creates schema', async () => {
    const { init, mockDb, Database } = loadWithDeferredClose();

    await init.initializeDatabase();

    expect(Database).toHaveBeenCalledWith(':memory:', expect.any(Function));
    const statements = mockDb.run.mock.calls.map(([sql]) => sql);
    ['users', 'clients', 'work_entries'].forEach((table) => {
      expect(statements.some((sql) => sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`))).toBe(true);
    });
    expect(statements.filter((sql) => sql.includes('CREATE INDEX'))).toHaveLength(4);
  });
});
