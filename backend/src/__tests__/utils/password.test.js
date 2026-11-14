const { hashPassword, verifyPassword } = require('../../utils/password');

describe('Password hashing', () => {
  test('hashes and verifies a password', async () => {
    const hash = await hashPassword('correct password');

    expect(hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    await expect(verifyPassword('correct password', hash)).resolves.toBe(true);
  });

  test('rejects a wrong password', async () => {
    const hash = await hashPassword('correct password');

    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  test.each([null, undefined, '', 'not-a-hash', 'scrypt$abcd$1234'])(
    'rejects malformed stored value %s',
    async (stored) => {
      await expect(verifyPassword('password', stored)).resolves.toBe(false);
    }
  );

  test('uses a unique salt for each hash', async () => {
    const first = await hashPassword('same password');
    const second = await hashPassword('same password');

    expect(first).not.toBe(second);
  });
});
