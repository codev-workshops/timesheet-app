describe('server startup environment check', () => {
  let originalSecret;
  let exitSpy;
  let errorSpy;

  beforeEach(() => {
    originalSecret = process.env.JWT_SECRET;
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
    exitSpy.mockRestore();
    errorSpy.mockRestore();
    jest.resetModules();
  });

  test('should exit with code 1 before initializing the database when JWT_SECRET is unset', async () => {
    delete process.env.JWT_SECRET;
    const initializeDatabase = jest.fn().mockResolvedValue(undefined);
    jest.doMock('../../database/init', () => ({
      initializeDatabase,
      getDatabase: jest.fn()
    }));

    jest.isolateModules(() => {
      require('../../server');
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(initializeDatabase).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to start server:',
      expect.objectContaining({ message: expect.stringContaining('JWT_SECRET') })
    );
  });
});
