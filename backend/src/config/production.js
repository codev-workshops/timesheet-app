// Production configuration. Secrets are read from the environment only
// (backend/.env locally, a secret manager in deployed environments).

const isProduction = process.env.NODE_ENV === 'production';

function requireEnv(name) {
  const value = process.env[name];
  if (!value && isProduction) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: '24h',
  },
  database: {
    url: requireEnv('DATABASE_URL'),
  },
  sendgrid: {
    apiKey: requireEnv('SENDGRID_API_KEY'),
  },
};
