require('dotenv').config();

const Joi = require('joi');
const featureDefaults = require('./features.json');

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

function parseIntOr(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

function flag(name, defaultValue) {
  const raw = process.env[`FEATURE_${name}`];
  if (raw === undefined) return defaultValue;
  return TRUTHY.has(String(raw).trim().toLowerCase());
}

// camelCase -> UPPER_SNAKE_CASE (darkMode -> DARK_MODE)
function toEnvName(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

const features = Object.freeze(
  Object.fromEntries(
    Object.entries(featureDefaults).map(([name, def]) => [name, flag(toEnvName(name), def)])
  )
);

const raw = {
  env,
  port: parseIntOr(process.env.PORT, 3001),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  logLevel: process.env.LOG_LEVEL || 'info',
  logFormat: process.env.LOG_FORMAT || (isProduction ? 'combined' : 'dev'),
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  database: {
    url: process.env.DATABASE_URL,
    path: process.env.DATABASE_PATH || ':memory:',
  },
  rateLimit: {
    windowMs: parseIntOr(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: parseIntOr(process.env.RATE_LIMIT_MAX, 100),
  },
  bodyLimit: process.env.BODY_LIMIT || '10mb',
  features,
};

const schema = Joi.object({
  env: Joi.string().valid('development', 'test', 'production').required(),
  port: Joi.number().integer().min(0).max(65535).required(),
  frontendUrl: Joi.string().uri().required(),
  logLevel: Joi.string().valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly').required(),
  logFormat: Joi.string().required(),
  jwt: Joi.object({
    secret: isProduction ? Joi.string().min(32).required() : Joi.string().allow('').optional(),
    expiresIn: Joi.string().required(),
  }).required(),
  database: Joi.object({
    url: Joi.string().optional(),
    path: Joi.string().required(),
  }).required(),
  rateLimit: Joi.object({
    windowMs: Joi.number().integer().positive().required(),
    max: Joi.number().integer().positive().required(),
  }).required(),
  bodyLimit: Joi.string().required(),
  features: Joi.object().pattern(Joi.string(), Joi.boolean()).required(),
});

const { error, value } = schema.validate(raw, { abortEarly: false });
if (error) {
  throw new Error(`Invalid configuration: ${error.details.map((d) => d.message).join('; ')}`);
}

function deepFreeze(obj) {
  Object.values(obj).forEach((v) => {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  });
  return Object.freeze(obj);
}

module.exports = deepFreeze(value);
