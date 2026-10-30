const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/**
 * Hashes a password with scrypt and a random salt.
 * @param {string} password
 * @return {Promise<string>} Encoded hash: scrypt$N$r$p$salt$hash (base64).
 */
async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
  const { N, r, p } = SCRYPT_PARAMS;
  return ['scrypt', N, r, p, salt.toString('base64'), derived.toString('base64')].join('$');
}

/**
 * Checks a password against a hash produced by hashPassword.
 * @param {string} password
 * @param {?string} encoded
 * @return {Promise<boolean>}
 */
async function verifyPassword(password, encoded) {
  if (typeof encoded !== 'string') {
    return false;
  }
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const derived = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p)
  });
  return crypto.timingSafeEqual(derived, expected);
}

module.exports = {
  hashPassword,
  verifyPassword
};
