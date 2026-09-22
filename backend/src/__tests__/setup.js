// Retry every test once more in CI to absorb transient failures (timing,
// resource contention). Locally tests run once so real bugs surface fast.
// Override with TEST_CI_RETRIES; mark known-flaky suites with `flaky()` from
// ./helpers/retry.js instead of raising this globally.
const ciRetries = parseInt(process.env.TEST_CI_RETRIES || (process.env.CI ? '1' : '0'), 10);
if (ciRetries > 0) {
  jest.retryTimes(ciRetries, { logErrorsBeforeRetry: true });
}

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
