const { withRetry, computeDelay, DEFAULT_RETRY_OPTIONS } = require('../../../services/categorization/retry');
const { LLMHttpError, isRetryableError, parseRetryAfter } = require('../../../services/categorization/errors');
const { TokenBucket } = require('../../../services/categorization/rateLimiter');

describe('withRetry', () => {
  test('retries 429 twice then succeeds, honoring Retry-After', async () => {
    const sleep = jest.fn().mockResolvedValue();
    const fn = jest.fn()
      .mockRejectedValueOnce(new LLMHttpError('rate limited', { status: 429, retryAfterMs: 2000 }))
      .mockRejectedValueOnce(new LLMHttpError('rate limited', { status: 429, retryAfterMs: 500 }))
      .mockResolvedValueOnce('ok');

    await expect(withRetry(fn, { sleep })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[2000], [500]]);
  });

  test('uses exponential backoff with jitter when Retry-After is absent', async () => {
    const sleep = jest.fn().mockResolvedValue();
    const fn = jest.fn()
      .mockRejectedValueOnce(new LLMHttpError('server error', { status: 503 }))
      .mockRejectedValueOnce(new LLMHttpError('server error', { status: 503 }))
      .mockResolvedValueOnce('ok');

    await withRetry(fn, { sleep, random: () => 0.5, baseDelayMs: 100 });
    expect(sleep.mock.calls).toEqual([[50], [100]]);
  });

  test('does not retry non-retryable errors', async () => {
    const sleep = jest.fn().mockResolvedValue();
    const error = new LLMHttpError('bad request', { status: 400 });
    const fn = jest.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { sleep })).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  test('gives up after the configured number of retries', async () => {
    const sleep = jest.fn().mockResolvedValue();
    const fn = jest.fn().mockRejectedValue(new LLMHttpError('rate limited', { status: 429 }));

    await expect(withRetry(fn, { sleep, retries: 2 })).rejects.toThrow('rate limited');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  test('caps delays', () => {
    const options = { ...DEFAULT_RETRY_OPTIONS, maxDelayMs: 1000, maxRetryAfterMs: 5000 };
    expect(computeDelay({}, 10, options, () => 1)).toBe(1000);
    expect(computeDelay({ retryAfterMs: 60000 }, 1, options)).toBe(5000);
  });
});

describe('errors', () => {
  test('parseRetryAfter handles seconds, HTTP dates and garbage', () => {
    const now = Date.parse('2024-01-01T00:00:00Z');
    expect(parseRetryAfter('3', now)).toBe(3000);
    expect(parseRetryAfter('Mon, 01 Jan 2024 00:00:10 GMT', now)).toBe(10000);
    expect(parseRetryAfter('soon', now)).toBeNull();
    expect(parseRetryAfter(null, now)).toBeNull();
  });

  test('isRetryableError classifies statuses', () => {
    expect(isRetryableError(new LLMHttpError('x', { status: 429 }))).toBe(true);
    expect(isRetryableError(new LLMHttpError('x', { status: 500 }))).toBe(true);
    expect(isRetryableError(new LLMHttpError('x', { status: 0 }))).toBe(true);
    expect(isRetryableError(new LLMHttpError('x', { status: 401 }))).toBe(false);
    expect(isRetryableError(new Error('x'))).toBe(false);
  });
});

describe('TokenBucket', () => {
  test('throttles once the bucket is empty', async () => {
    let now = 0;
    const sleep = jest.fn(async (ms) => { now += ms; });
    const bucket = new TokenBucket({ capacity: 2, refillPerSecond: 1, now: () => now, sleep });

    await bucket.take();
    await bucket.take();
    expect(sleep).not.toHaveBeenCalled();
    await bucket.take();
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  test('rejects invalid configuration', () => {
    expect(() => new TokenBucket({ capacity: 0, refillPerSecond: 1 })).toThrow();
  });
});
