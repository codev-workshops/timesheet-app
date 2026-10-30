const { hashPassword, verifyPassword } = require('../../security/password');

describe('Password hashing', () => {
  test('should verify the original password', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash.startsWith('scrypt$')).toBe(true);
    await expect(verifyPassword('correct horse battery', hash)).resolves.toBe(true);
  });

  test('should reject a wrong password', async () => {
    const hash = await hashPassword('correct horse battery');
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  test('should salt each hash', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password'), hashPassword('same-password')]);
    expect(a).not.toBe(b);
  });

  test('should reject missing or malformed hashes', async () => {
    await expect(verifyPassword('anything', null)).resolves.toBe(false);
    await expect(verifyPassword('anything', 'plaintext')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'bcrypt$1$2$3$4$5')).resolves.toBe(false);
  });
});
