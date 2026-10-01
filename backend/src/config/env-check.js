const REQUIRED_ENV_VARS = ['JWT_SECRET'];

function checkRequiredEnv(env = process.env) {
  const missing = REQUIRED_ENV_VARS.filter((name) => !env[name] || !env[name].trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}

module.exports = {
  REQUIRED_ENV_VARS,
  checkRequiredEnv
};
