const REQUIRED = ['JWT_SECRET', 'DATABASE_URL', 'SENDGRID_API_KEY'];
const ORIGINAL = { ...process.env };

const FAKE = {
  JWT_SECRET: 'test-jwt-secret',
  DATABASE_URL: 'postgres://test-user:test-password@localhost:5432/test-db',
  SENDGRID_API_KEY: 'test-sendgrid-key',
};

function loadConfig() {
  let config;
  jest.isolateModules(() => {
    config = require('../../config/production');
  });
  return config;
}

describe('config/production', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL };
    delete process.env.JWT_EXPIRES_IN;
    Object.assign(process.env, FAKE);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  test('reads secrets from the environment with a default expiresIn', () => {
    const config = loadConfig();

    expect(config.jwt.secret).toBe(FAKE.JWT_SECRET);
    expect(config.database.url).toBe(FAKE.DATABASE_URL);
    expect(config.sendgrid.apiKey).toBe(FAKE.SENDGRID_API_KEY);
    expect(config.jwt.expiresIn).toBe('24h');
  });

  test('uses JWT_EXPIRES_IN when set', () => {
    process.env.JWT_EXPIRES_IN = '1h';

    expect(loadConfig().jwt.expiresIn).toBe('1h');
  });

  test.each(REQUIRED)('throws when %s is missing', (name) => {
    delete process.env[name];

    expect(loadConfig).toThrow(Error);
    expect(loadConfig).toThrow(name);
  });

  test('lists every missing variable when all are missing', () => {
    REQUIRED.forEach((name) => delete process.env[name]);

    expect(loadConfig).toThrow(
      'Missing required environment variables: JWT_SECRET, DATABASE_URL, SENDGRID_API_KEY'
    );
  });
});
