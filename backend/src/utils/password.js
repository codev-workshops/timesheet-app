const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const HASH_PREFIX = 'scrypt';
// Hashed when no stored hash exists so unknown accounts take as long as wrong passwords.
const DUMMY_SALT = crypto.randomBytes(SALT_BYTES);

async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `${HASH_PREFIX}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  const parts = typeof storedHash === 'string' ? storedHash.split('$') : [];
  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) {
    await scrypt(password, DUMMY_SALT, KEY_LENGTH);
    return false;
  }

  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return expected.length === derived.length && crypto.timingSafeEqual(derived, expected);
}

module.exports = {
  hashPassword,
  verifyPassword
};
