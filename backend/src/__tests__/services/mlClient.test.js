const { predictHours, MlServiceError, DEFAULT_ML_SERVICE_URL } = require('../../services/mlClient');

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body)
  };
}

const validInput = {
  clientId: 3,
  description: 'Code review for PR',
  userEmail: 'alice@example.com',
  date: '2026-10-29',
  department: 'Engineering'
};

describe('mlClient.predictHours', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    global.fetch = jest.fn();
    delete process.env.ML_SERVICE_URL;
    delete process.env.ML_TIMEOUT_MS;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  test('returns the estimate on success', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ estimatedHours: 2.5, modelVersion: 'xgb-1' }));

    const result = await predictHours(validInput);

    expect(result).toEqual({ estimatedHours: 2.5, modelVersion: 'xgb-1' });
    expect(global.fetch).toHaveBeenCalledWith(
      `${DEFAULT_ML_SERVICE_URL}/predict`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: expect.any(AbortSignal)
      })
    );
  });

  test('uses ML_SERVICE_URL from the environment and strips trailing slashes', async () => {
    process.env.ML_SERVICE_URL = 'http://ml:8000/';
    global.fetch.mockResolvedValue(jsonResponse({ estimatedHours: 1, modelVersion: 'v' }));

    await predictHours(validInput);

    expect(global.fetch.mock.calls[0][0]).toBe('http://ml:8000/predict');
  });

  test('drops extra response fields', async () => {
    global.fetch.mockResolvedValue(jsonResponse({ estimatedHours: 1.25, modelVersion: 'v', extra: true }));

    await expect(predictHours(validInput)).resolves.toEqual({ estimatedHours: 1.25, modelVersion: 'v' });
  });

  test('throws TIMEOUT when the service does not answer within ML_TIMEOUT_MS', async () => {
    process.env.ML_TIMEOUT_MS = '20';
    global.fetch.mockImplementation((url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        const err = new Error('This operation was aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));

    const promise = predictHours(validInput);
    await expect(promise).rejects.toBeInstanceOf(MlServiceError);
    await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  test('falls back to the default timeout for an invalid ML_TIMEOUT_MS', async () => {
    process.env.ML_TIMEOUT_MS = 'not-a-number';
    global.fetch.mockResolvedValue(jsonResponse({ estimatedHours: 1, modelVersion: 'v' }));

    await expect(predictHours(validInput)).resolves.toEqual({ estimatedHours: 1, modelVersion: 'v' });
  });

  test('throws NETWORK on connection errors', async () => {
    global.fetch.mockRejectedValue(new TypeError('fetch failed'));

    await expect(predictHours(validInput)).rejects.toMatchObject({
      name: 'MlServiceError',
      code: 'NETWORK'
    });
  });

  test.each([422, 500, 503])('throws HTTP_ERROR on a %i response', async (status) => {
    global.fetch.mockResolvedValue(jsonResponse({ detail: 'nope' }, status));

    await expect(predictHours(validInput)).rejects.toMatchObject({ code: 'HTTP_ERROR', status });
  });

  test.each([
    ['null body', null],
    ['missing estimatedHours', { modelVersion: 'v' }],
    ['string estimatedHours', { estimatedHours: '2.5', modelVersion: 'v' }],
    ['NaN estimatedHours', { estimatedHours: NaN, modelVersion: 'v' }],
    ['missing modelVersion', { estimatedHours: 2.5 }],
    ['empty modelVersion', { estimatedHours: 2.5, modelVersion: '' }],
    ['numeric modelVersion', { estimatedHours: 2.5, modelVersion: 7 }]
  ])('throws BAD_RESPONSE for a malformed response (%s)', async (label, body) => {
    global.fetch.mockResolvedValue(jsonResponse(body));

    await expect(predictHours(validInput)).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });

  test('throws BAD_RESPONSE when the body is not JSON', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token'))
    });

    await expect(predictHours(validInput)).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });
});
