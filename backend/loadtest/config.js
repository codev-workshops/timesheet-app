export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
export const USER_EMAIL = __ENV.USER_EMAIL || 'loadtest@example.com';

export function headers() {
  return { 'x-user-email': USER_EMAIL };
}

export function clientIds() {
  const large = __ENV.LARGE_CLIENT_ID;
  if (!large) {
    throw new Error('LARGE_CLIENT_ID is required. Export it from seed.js before running this scenario.');
  }

  return {
    small: __ENV.SMALL_CLIENT_ID,
    medium: __ENV.MEDIUM_CLIENT_ID,
    large
  };
}
