const { flag } = require('../../config');

describe('config.flag', () => {
  const NAME = 'FEATURE_TEST_FLAG';

  afterEach(() => {
    delete process.env[NAME];
  });

  it('returns the default when the variable is undefined', () => {
    expect(flag(NAME, true)).toBe(true);
    expect(flag(NAME, false)).toBe(false);
  });

  it.each(['1', 'true', 'TRUE', 'yes', 'On', ' true '])('treats %j as true', (value) => {
    process.env[NAME] = value;
    expect(flag(NAME, false)).toBe(true);
  });

  it.each(['0', 'false', 'no', 'off', '', 'random'])('treats %j as false', (value) => {
    process.env[NAME] = value;
    expect(flag(NAME, true)).toBe(false);
  });
});

describe('config.features', () => {
  it('is frozen and exposes boolean flags', () => {
    const config = require('../../config');
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.features)).toBe(true);
    expect(typeof config.features.csvExport).toBe('boolean');
    expect(typeof config.features.pdfReports).toBe('boolean');
  });
});
