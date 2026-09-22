const { flaky, withNetworkRetry, isTransientNetworkError } = require('./retry');

describe('isTransientNetworkError', () => {
  it('recognises transient socket error codes', () => {
    expect(isTransientNetworkError({ code: 'ECONNRESET' })).toBe(true);
    expect(isTransientNetworkError({ cause: { code: 'ETIMEDOUT' } })).toBe(true);
  });

  it('recognises retryable HTTP statuses', () => {
    expect(isTransientNetworkError({ status: 503 })).toBe(true);
    expect(isTransientNetworkError({ response: { status: 429 } })).toBe(true);
  });

  it('rejects non-transient errors', () => {
    expect(isTransientNetworkError(new Error('assertion failed'))).toBe(false);
    expect(isTransientNetworkError({ status: 400 })).toBe(false);
    expect(isTransientNetworkError(null)).toBe(false);
  });
});

describe('withNetworkRetry', () => {
  it('returns the result on first success', async () => {
    const op = jest.fn().mockResolvedValue('ok');
    await expect(withNetworkRetry(op, { backoffMs: 0 })).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries transient errors then succeeds', async () => {
    const op = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 503 }))
      .mockResolvedValue('ok');
    await expect(withNetworkRetry(op, { retries: 3, backoffMs: 0 })).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(3);
    expect(op).toHaveBeenLastCalledWith(3);
  });

  it('does not retry non-transient errors', async () => {
    const op = jest.fn().mockRejectedValue(new Error('boom'));
    await expect(withNetworkRetry(op, { retries: 3, backoffMs: 0 })).rejects.toThrow('boom');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('gives up after the configured number of retries', async () => {
    const op = jest.fn().mockRejectedValue(Object.assign(new Error('down'), { code: 'ECONNREFUSED' }));
    await expect(withNetworkRetry(op, { retries: 2, backoffMs: 0 })).rejects.toThrow('down');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('honours a custom shouldRetry predicate', async () => {
    const op = jest.fn().mockRejectedValueOnce(new Error('any')).mockResolvedValue('ok');
    await expect(
      withNetworkRetry(op, { retries: 1, backoffMs: 0, shouldRetry: () => true })
    ).resolves.toBe('ok');
    expect(op).toHaveBeenCalledTimes(2);
  });
});

flaky('flaky()', () => {
  let attempts = 0;

  it('re-runs a test that fails on its first attempt', () => {
    attempts++;
    expect(attempts).toBeGreaterThan(1);
  });
}, 2);
