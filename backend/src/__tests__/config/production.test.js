const REQUIRED = ['JWT_SECRET', 'DATABASE_URL', 'SENDGRID_API_KEY'];

describe('production config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    REQUIRED.forEach((name) => delete process.env[name]);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('reads secrets from the environment', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'jwt-from-env';
    process.env.DATABASE_URL = 'postgres://db-from-env';
    process.env.SENDGRID_API_KEY = 'sendgrid-from-env';

    const config = require('../../config/production');

    expect(config.jwt.secret).toBe('jwt-from-env');
    expect(config.jwt.expiresIn).toBe('24h');
    expect(config.database.url).toBe('postgres://db-from-env');
    expect(config.sendgrid.apiKey).toBe('sendgrid-from-env');
  });

  test.each(REQUIRED)('throws in production when %s is unset', (missing) => {
    process.env.NODE_ENV = 'production';
    REQUIRED.filter((name) => name !== missing).forEach((name) => {
      process.env[name] = 'set';
    });

    expect(() => require('../../config/production')).toThrow(
      `Missing required environment variable: ${missing}`
    );
  });

  test('has no fallback secrets outside production', () => {
    process.env.NODE_ENV = 'development';

    const config = require('../../config/production');

    expect(config.jwt.secret).toBeUndefined();
    expect(config.database.url).toBeUndefined();
    expect(config.sendgrid.apiKey).toBeUndefined();
  });
});
