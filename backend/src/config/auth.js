// Authentication configuration.
// The JWT signing secret is read from the environment only — never hard-coded.

const MIN_SECRET_LENGTH = 32;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is not set. Refusing to sign or verify tokens.');
  }

  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters.`);
  }

  return secret;
}

// Called during startup so a misconfigured deployment fails immediately rather than
// serving traffic with broken authentication.
function assertAuthConfig() {
  getJwtSecret();
}

// Cost factor is overridable so the test suite can run with a cheap factor; production
// deployments should leave it at the default.
const bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

module.exports = {
  getJwtSecret,
  assertAuthConfig,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  jwtAlgorithm: 'HS256',
  bcryptRounds,
  MIN_SECRET_LENGTH
};
