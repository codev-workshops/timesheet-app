const productionConfig = require('../../config/production');

describe('Production Config', () => {
  test('should export an object with jwt, database and sendgrid sections', () => {
    expect(productionConfig).toEqual(expect.any(Object));
    expect(Object.keys(productionConfig).sort()).toEqual(['database', 'jwt', 'sendgrid']);
  });

  test('jwt section should have a non-empty string secret and expiresIn', () => {
    const { jwt } = productionConfig;
    expect(typeof jwt).toBe('object');
    expect(typeof jwt.secret).toBe('string');
    expect(jwt.secret.length).toBeGreaterThan(0);
    expect(typeof jwt.expiresIn).toBe('string');
    expect(jwt.expiresIn.length).toBeGreaterThan(0);
  });

  test('jwt secret should not contain whitespace', () => {
    expect(/\s/.test(productionConfig.jwt.secret)).toBe(false);
  });

  test('database section should have a non-empty string url', () => {
    const { database } = productionConfig;
    expect(typeof database).toBe('object');
    expect(typeof database.url).toBe('string');
    expect(database.url.length).toBeGreaterThan(0);
  });

  test('sendgrid section should have a non-empty string apiKey', () => {
    const { sendgrid } = productionConfig;
    expect(typeof sendgrid).toBe('object');
    expect(typeof sendgrid.apiKey).toBe('string');
    expect(sendgrid.apiKey.length).toBeGreaterThan(0);
  });
});
