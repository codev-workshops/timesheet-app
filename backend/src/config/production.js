// Production configuration. Secrets come from the environment (see backend/.env.example).
const REQUIRED = ['JWT_SECRET', 'DATABASE_URL', 'SENDGRID_API_KEY'];
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

module.exports = {
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY,
  },
};
