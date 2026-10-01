const { checkRequiredEnv, REQUIRED_ENV_VARS } = require('../../config/env-check');

describe('checkRequiredEnv', () => {
  test('should require JWT_SECRET', () => {
    expect(REQUIRED_ENV_VARS).toContain('JWT_SECRET');
  });

  test('should throw when JWT_SECRET is unset', () => {
    expect(() => checkRequiredEnv({})).toThrow('Missing required environment variable(s): JWT_SECRET');
  });

  test('should throw when JWT_SECRET is empty or whitespace', () => {
    expect(() => checkRequiredEnv({ JWT_SECRET: '' })).toThrow(/JWT_SECRET/);
    expect(() => checkRequiredEnv({ JWT_SECRET: '   ' })).toThrow(/JWT_SECRET/);
  });

  test('should not throw when JWT_SECRET is set', () => {
    expect(() => checkRequiredEnv({ JWT_SECRET: 'secret' })).not.toThrow();
  });

  test('should default to process.env', () => {
    const original = process.env.JWT_SECRET;
    try {
      delete process.env.JWT_SECRET;
      expect(() => checkRequiredEnv()).toThrow(/JWT_SECRET/);
      process.env.JWT_SECRET = 'secret';
      expect(() => checkRequiredEnv()).not.toThrow();
    } finally {
      process.env.JWT_SECRET = original;
    }
  });
});
