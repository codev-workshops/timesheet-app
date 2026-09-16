const JWT_EXPIRES_IN = '24h';
const COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const isProduction = () => process.env.NODE_ENV === 'production';

const authCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction(),
  sameSite: 'strict',
  maxAge: COOKIE_MAX_AGE_MS,
  path: '/',
});

const csrfCookieOptions = () => ({
  httpOnly: false,
  secure: isProduction(),
  sameSite: 'strict',
  maxAge: COOKIE_MAX_AGE_MS,
  path: '/',
});

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

function getJwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || JWT_EXPIRES_IN;
}

module.exports = {
  getJwtSecret,
  getJwtExpiresIn,
  authCookieOptions,
  csrfCookieOptions,
  isProduction,
  AUTH_COOKIE: 'token',
  CSRF_COOKIE: 'csrfToken',
  CSRF_HEADER: 'x-csrf-token',
};
