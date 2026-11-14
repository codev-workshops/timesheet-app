// Production configuration. Secrets must come from the environment / secret manager.

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  jwt: {
    get secret() {
      return requireEnv('JWT_SECRET');
    },
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  database: {
    get url() {
      return requireEnv('DATABASE_URL');
    },
  },
  sendgrid: {
    get apiKey() {
      return requireEnv('SENDGRID_API_KEY');
    },
  },
};
