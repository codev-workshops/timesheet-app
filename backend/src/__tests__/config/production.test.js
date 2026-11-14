const fs = require('fs');
const path = require('path');

describe('production config', () => {
  const keys = ['JWT_SECRET', 'DATABASE_URL', 'SENDGRID_API_KEY'];
  const saved = {};

  beforeEach(() => {
    keys.forEach((k) => { saved[k] = process.env[k]; delete process.env[k]; });
    jest.resetModules();
  });

  afterEach(() => {
    keys.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  test('reads secrets from the environment', () => {
    process.env.JWT_SECRET = 'jwt-from-env';
    process.env.DATABASE_URL = 'postgres://u:p@h/db';
    process.env.SENDGRID_API_KEY = 'sg-from-env';
    const config = require('../../config/production');
    expect(config.jwt.secret).toBe('jwt-from-env');
    expect(config.database.url).toBe('postgres://u:p@h/db');
    expect(config.sendgrid.apiKey).toBe('sg-from-env');
  });

  test('throws when a secret is missing', () => {
    const config = require('../../config/production');
    expect(() => config.jwt.secret).toThrow('JWT_SECRET');
    expect(() => config.database.url).toThrow('DATABASE_URL');
    expect(() => config.sendgrid.apiKey).toThrow('SENDGRID_API_KEY');
  });

  test('contains no hard-coded credentials', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../config/production.js'), 'utf8');
    expect(source).not.toMatch(/SG\.[A-Za-z0-9_-]{10,}/);
    expect(source).not.toMatch(/postgres:\/\/[^'"\s]+:[^'"\s]+@/);
  });
});
