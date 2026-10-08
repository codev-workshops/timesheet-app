const productionConfig = require('../../config/production');

describe('Production config', () => {
  test('exposes jwt, database and sendgrid sections', () => {
    expect(productionConfig).toEqual({
      jwt: { secret: expect.any(String), expiresIn: '24h' },
      database: { url: expect.any(String) },
      sendgrid: { apiKey: expect.any(String) }
    });
  });

  test('jwt secret contains no whitespace', () => {
    expect(productionConfig.jwt.secret).not.toMatch(/\s/);
    expect(productionConfig.jwt.secret.length).toBeGreaterThan(0);
  });
});
