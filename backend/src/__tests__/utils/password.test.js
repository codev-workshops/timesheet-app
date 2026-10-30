const { hashPassword, verifyPassword } = require('../../utils/password');

describe('Password hashing', () => {
  test('should not store the plaintext password', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash).not.toContain('correct horse');
    expect(hash.startsWith('scrypt$')).toBe(true);
  });

  test('should use a unique salt per hash', async () => {
    const first = await hashPassword('same-password');
    const second = await hashPassword('same-password');
    expect(first).not.toBe(second);
  });

  test('should verify the correct password', async () => {
    const hash = await hashPassword('correct horse');
    await expect(verifyPassword('correct horse', hash)).resolves.toBe(true);
  });

  test('should reject a wrong password', async () => {
    const hash = await hashPassword('correct horse');
    await expect(verifyPassword('wrong horse', hash)).resolves.toBe(false);
  });

  test.each([null, undefined, '', 'plaintext', 'scrypt$abc', 'md5$aa$bb'])(
    'should reject missing or malformed stored hash %p',
    async (stored) => {
      await expect(verifyPassword('anything', stored)).resolves.toBe(false);
    }
  );

  test('should reject a truncated hash', async () => {
    const hash = await hashPassword('correct horse');
    await expect(verifyPassword('correct horse', hash.slice(0, -4))).resolves.toBe(false);
  });
});
