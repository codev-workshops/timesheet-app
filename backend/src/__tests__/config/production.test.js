const config = require('../../config/production');

describe('Production Config', () => {
  test('exposes jwt configuration', () => {
    expect(config.jwt).toBeDefined();
    expect(typeof config.jwt.secret).toBe('string');
    expect(config.jwt.secret.length).toBeGreaterThan(0);
    expect(config.jwt.secret).not.toContain(' ');
    expect(config.jwt.expiresIn).toBe('24h');
  });

  test('exposes database configuration', () => {
    expect(config.database).toBeDefined();
    expect(config.database.url).toMatch(/^postgres:\/\//);
  });

  test('exposes sendgrid configuration', () => {
    expect(config.sendgrid).toBeDefined();
    expect(typeof config.sendgrid.apiKey).toBe('string');
    expect(config.sendgrid.apiKey.length).toBeGreaterThan(0);
  });
});
