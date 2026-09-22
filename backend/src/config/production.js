// Production configuration
// All values are read from the environment. Never commit credentials to this file.

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  jwt: {
    get secret() {
      return required('JWT_SECRET');
    },
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  database: {
    get url() {
      return required('DATABASE_URL');
    },
  },
  sendgrid: {
    get apiKey() {
      return required('SENDGRID_API_KEY');
    },
  },
};
