const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') {
    return false;
  }

  const match = stored.match(/^scrypt\$([0-9a-f]{32})\$([0-9a-f]{128})$/i);
  if (!match) {
    return false;
  }

  const salt = Buffer.from(match[1], 'hex');
  const expectedHash = Buffer.from(match[2], 'hex');
  if (expectedHash.length !== KEY_LENGTH) {
    return false;
  }

  const actualHash = await scrypt(password, salt, KEY_LENGTH);
  return actualHash.length === expectedHash.length
    && crypto.timingSafeEqual(actualHash, expectedHash);
}

module.exports = {
  hashPassword,
  verifyPassword
};
