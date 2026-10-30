const { issueToken, verifyToken, resetJwtSecretForTests } = require('../../security/token');

describe('Session tokens', () => {
  afterEach(() => {
    delete process.env.JWT_SECRET;
    resetJwtSecretForTests();
  });

  test('should round-trip the subject email', () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    resetJwtSecretForTests();
    expect(verifyToken(issueToken('alice@example.com'))).toBe('alice@example.com');
  });

  test('should reject tokens after the secret changes', () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    resetJwtSecretForTests();
    const token = issueToken('alice@example.com');

    process.env.JWT_SECRET = 'b'.repeat(32);
    resetJwtSecretForTests();
    expect(() => verifyToken(token)).toThrow();
  });

  test('should refuse a JWT_SECRET shorter than 32 characters', () => {
    process.env.JWT_SECRET = 'short';
    resetJwtSecretForTests();
    expect(() => issueToken('alice@example.com')).toThrow(/at least 32/);
  });

  test('should fall back to a random secret when JWT_SECRET is unset', () => {
    resetJwtSecretForTests();
    expect(verifyToken(issueToken('alice@example.com'))).toBe('alice@example.com');
  });
});
