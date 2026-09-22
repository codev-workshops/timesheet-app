/**
 * Retry helpers for flaky and network-dependent tests.
 *
 * Default retry counts are controlled by env vars so CI can be stricter or
 * looser without code changes:
 *   TEST_RETRIES          - retries for tests marked with `flaky` (default 2)
 *   TEST_NETWORK_RETRIES  - retries for `withNetworkRetry` operations (default 3)
 */

const DEFAULT_FLAKY_RETRIES = parseInt(process.env.TEST_RETRIES || '2', 10);
const DEFAULT_NETWORK_RETRIES = parseInt(process.env.TEST_NETWORK_RETRIES || '3', 10);
const DEFAULT_BACKOFF_MS = 200;

const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EPIPE',
  'ECONNABORTED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/**
 * Returns true when an error looks like a transient network failure.
 * @param {unknown} err
 * @return {boolean}
 */
function isTransientNetworkError(err) {
  if (!err || typeof err !== 'object') return false;
  const code = err.code || (err.cause && err.cause.code);
  if (code && TRANSIENT_NETWORK_CODES.has(code)) return true;
  const status = err.status || err.statusCode || (err.response && err.response.status);
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * @param {number} ms
 * @return {!Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `operation` and retries it on failure with exponential backoff.
 *
 * By default only transient network errors are retried; pass
 * `shouldRetry: () => true` to retry on any error.
 *
 * @template T
 * @param {function(number): (T|!Promise<T>)} operation Receives the attempt
 *     number (1-based).
 * @param {{retries: (number|undefined), backoffMs: (number|undefined),
 *     shouldRetry: (function(unknown): boolean|undefined)}=} options
 * @return {!Promise<T>}
 */
async function withNetworkRetry(operation, options = {}) {
  const {
    retries = DEFAULT_NETWORK_RETRIES,
    backoffMs = DEFAULT_BACKOFF_MS,
    shouldRetry = isTransientNetworkError,
  } = options;

  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;
      if (attempt > retries || !shouldRetry(err)) throw err;
      await sleep(backoffMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

/**
 * Declares a describe block whose tests are retried on failure. Use for tests
 * that are known to be timing-sensitive or depend on external resources.
 *
 * Example:
 *   flaky('report export', () => { it('streams CSV', ...); });
 *   flaky.only(...) / flaky.skip(...) are also available.
 *
 * @param {string} name
 * @param {function(): void} fn
 * @param {number=} retries
 */
function flaky(name, fn, retries = DEFAULT_FLAKY_RETRIES) {
  describe(name, () => {
    jest.retryTimes(retries, { logErrorsBeforeRetry: true });
    fn();
  });
}

flaky.only = (name, fn, retries = DEFAULT_FLAKY_RETRIES) => {
  describe.only(name, () => {
    jest.retryTimes(retries, { logErrorsBeforeRetry: true });
    fn();
  });
};

flaky.skip = (name, fn) => describe.skip(name, fn);

module.exports = {
  flaky,
  withNetworkRetry,
  isTransientNetworkError,
  DEFAULT_FLAKY_RETRIES,
  DEFAULT_NETWORK_RETRIES,
};
