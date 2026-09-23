const {
  CATEGORIES,
  CategorizationError,
  buildPrompt,
  normalizeCategory,
  categorizeEntry
} = require('../../services/categorization');

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body)
  };
}

function completion(content) {
  return { choices: [{ message: { role: 'assistant', content } }] };
}

describe('categorization service', () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    global.fetch = jest.fn();
    jest.spyOn(global, 'setTimeout').mockImplementation((fn) => {
      fn();
      return 0;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.OPENAI_API_KEY = originalKey;
  });

  describe('buildPrompt', () => {
    test('lists every category in the system prompt and includes entry context', () => {
      const messages = buildPrompt({ description: 'Sprint planning', clientName: 'Acme', department: 'Eng' });

      expect(messages[0].role).toBe('system');
      CATEGORIES.forEach((c) => expect(messages[0].content).toContain(c));
      expect(messages[1]).toEqual({
        role: 'user',
        content: 'Description: Sprint planning\nClient: Acme\nDepartment: Eng'
      });
    });

    test('omits missing client context', () => {
      const messages = buildPrompt({ description: '' });
      expect(messages[1].content).toBe('Description: (none)');
    });
  });

  describe('normalizeCategory', () => {
    test('matches categories case-insensitively and strips punctuation', () => {
      expect(normalizeCategory('development')).toBe('Development');
      expect(normalizeCategory(' "Meetings". ')).toBe('Meetings');
    });

    test('returns null for unknown or non-string values', () => {
      expect(normalizeCategory('Vacation')).toBeNull();
      expect(normalizeCategory(undefined)).toBeNull();
      expect(normalizeCategory('')).toBeNull();
    });
  });

  describe('categorizeEntry', () => {
    test('calls the Chat Completions endpoint and returns the normalized category', async () => {
      global.fetch.mockResolvedValue(jsonResponse(200, completion('support')));

      const category = await categorizeEntry({ description: 'Answered customer ticket', clientName: 'Acme' });

      expect(category).toBe('Support');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toContain('/v1/chat/completions');
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe('Bearer test-key');
      const body = JSON.parse(options.body);
      expect(Array.isArray(body.messages)).toBe(true);
      expect(body.messages).toHaveLength(2);
    });

    test('throws 503 when OPENAI_API_KEY is not configured', async () => {
      delete process.env.OPENAI_API_KEY;

      await expect(categorizeEntry({ description: 'x' })).rejects.toMatchObject({
        name: 'CategorizationError',
        status: 503
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('throws 502 on an empty/unrecognized model response', async () => {
      global.fetch.mockResolvedValue(jsonResponse(200, completion('')));

      await expect(categorizeEntry({ description: 'x' })).rejects.toMatchObject({
        status: 502,
        message: 'Model returned an unrecognized category'
      });
    });

    test('throws 502 when the response body is not valid JSON', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockRejectedValue(new SyntaxError('bad json'))
      });

      await expect(categorizeEntry({ description: 'x' })).rejects.toMatchObject({
        status: 502,
        message: 'Malformed categorization response'
      });
    });

    test('throws 502 when the response has no choices', async () => {
      global.fetch.mockResolvedValue(jsonResponse(200, {}));

      await expect(categorizeEntry({ description: 'x' })).rejects.toMatchObject({ status: 502 });
    });

    test('throws 504 when the request times out', async () => {
      const abortError = new Error('aborted');
      abortError.name = 'AbortError';
      global.fetch.mockRejectedValue(abortError);

      await expect(categorizeEntry({ description: 'x' })).rejects.toMatchObject({
        status: 504,
        message: 'Categorization request timed out'
      });
    });

    test('throws 502 on network failure', async () => {
      global.fetch.mockRejectedValue(new Error('ECONNRESET'));

      await expect(categorizeEntry({ description: 'x' })).rejects.toMatchObject({
        status: 502,
        message: 'Categorization request failed: ECONNRESET'
      });
    });

    test('retries on 429 and succeeds when the provider recovers', async () => {
      global.fetch
        .mockResolvedValueOnce(jsonResponse(429, { error: { message: 'rate limited' } }))
        .mockResolvedValueOnce(jsonResponse(200, completion('Admin')));

      await expect(categorizeEntry({ description: 'Filed expense report' })).resolves.toBe('Admin');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    test('throws 429 after exhausting retries on persistent rate limiting', async () => {
      global.fetch.mockResolvedValue(jsonResponse(429, { error: { message: 'rate limited' } }));

      await expect(categorizeEntry({ description: 'x' })).rejects.toMatchObject({
        status: 429,
        message: 'Categorization rate limited'
      });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    test('throws 502 after exhausting retries on provider 5xx errors', async () => {
      global.fetch.mockResolvedValue(jsonResponse(500, {}));

      await expect(categorizeEntry({ description: 'x' })).rejects.toMatchObject({
        status: 502,
        message: 'Categorization provider error'
      });
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    test('throws 502 on non-retryable provider errors', async () => {
      global.fetch.mockResolvedValue(jsonResponse(401, {}));

      await expect(categorizeEntry({ description: 'x' })).rejects.toBeInstanceOf(CategorizationError);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
