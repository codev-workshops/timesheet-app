const config = require('../../config/production');

// Shape-only assertions: secret values are deliberately never asserted or logged here.
describe('config/production', () => {
  test('exposes jwt, database and sendgrid sections with string settings', () => {
    expect(Object.keys(config).sort()).toEqual(['database', 'jwt', 'sendgrid']);
    expect(typeof config.jwt.secret).toBe('string');
    expect(config.jwt.secret).not.toMatch(/\s/);
    expect(config.jwt.expiresIn).toBe('24h');
    expect(config.database.url).toMatch(/^postgres:\/\//);
    expect(typeof config.sendgrid.apiKey).toBe('string');
  });

  test('is not imported by the HTTP server startup path', () => {
    const fs = require('fs');
    const path = require('path');
    const server = fs.readFileSync(path.join(__dirname, '../../server.js'), 'utf8');
    expect(server).not.toMatch(/config\/production/);
  });
});
