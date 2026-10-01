const pRetry = require('p-retry');
const { isRetryableError } = require('./errors');
const { defaultSleep } = require('./rateLimiter');

const DEFAULT_RETRY_OPTIONS = {
  retries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  maxRetryAfterMs: 120000
};

// Exponential backoff with full jitter; a server-provided Retry-After takes precedence.
function computeDelay(error, attemptNumber, options, random = Math.random) {
  if (error && typeof error.retryAfterMs === 'number') {
    return Math.min(error.retryAfterMs, options.maxRetryAfterMs);
  }
  const exp = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attemptNumber - 1));
  return Math.round(random() * exp);
}

function withRetry(fn, overrides = {}) {
  const options = { ...DEFAULT_RETRY_OPTIONS, ...overrides };
  const sleep = options.sleep || defaultSleep;
  const random = options.random || Math.random;

  return pRetry(async (attemptNumber) => {
    try {
      return await fn(attemptNumber);
    } catch (error) {
      if (!isRetryableError(error)) {
        throw new pRetry.AbortError(error);
      }
      throw error;
    }
  }, {
    retries: options.retries,
    // Delays are applied in onFailedAttempt so Retry-After can be honored exactly.
    minTimeout: 0,
    maxTimeout: 0,
    factor: 1,
    onFailedAttempt: async (error) => {
      if (error.retriesLeft <= 0) return;
      const delay = computeDelay(error, error.attemptNumber, options, random);
      if (options.onRetry) options.onRetry(error, delay);
      await sleep(delay);
    }
  });
}

module.exports = {
  withRetry,
  computeDelay,
  DEFAULT_RETRY_OPTIONS
};
