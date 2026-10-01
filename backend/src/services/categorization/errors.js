class LLMHttpError extends Error {
  constructor(message, { status = 0, retryAfterMs = null, body = null } = {}) {
    super(message);
    this.name = 'LLMHttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.body = body;
  }
}

function isRetryableError(error) {
  if (!(error instanceof LLMHttpError)) return false;
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500;
}

// Retry-After is either delta-seconds or an HTTP-date (RFC 9110 §10.2.3).
function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}

module.exports = {
  LLMHttpError,
  isRetryableError,
  parseRetryAfter
};
