// The app refuses to sign or verify tokens without a secret, so provide a deterministic one.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-with-at-least-32-characters';
// Keep bcrypt cheap in tests; production uses the default cost factor of 12.
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '4';

// Mock sqlite3 globally to avoid native module loading issues in tests
jest.mock('sqlite3', () => {
  const mockDatabase = {
    serialize: jest.fn((callback) => callback()),
    run: jest.fn((query, paramsOrCallback, callback) => {
      const cb = typeof paramsOrCallback === 'function' ? paramsOrCallback : callback;
      if (typeof cb === 'function') cb(null);
    }),
    get: jest.fn(),
    all: jest.fn(),
    close: jest.fn((callback) => callback && callback(null))
  };

  return {
    verbose: jest.fn(() => ({
      Database: jest.fn((path, callback) => {
        if (callback) callback(null);
        return mockDatabase;
      })
    }))
  };
});
