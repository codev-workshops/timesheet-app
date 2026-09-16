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
