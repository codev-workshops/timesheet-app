const { categorizeEntry, parseLlmContent } = require('../../services/llmService');

const entry = {
  description: 'Sprint planning with the team',
  clientName: 'Client A',
  hours: 1.5,
  date: '2024-01-01'
};

const llmResponse = (content, ok = true, status = 200) => ({
  ok,
  status,
  json: jest.fn().mockResolvedValue({ choices: [{ message: { content } }] })
});

describe('llmService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_BASE_URL;
    global.fetch = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    delete global.fetch;
    jest.restoreAllMocks();
  });

  describe('categorizeEntry', () => {
    test('returns fallback without calling the API when OPENAI_API_KEY is missing', async () => {
      delete process.env.OPENAI_API_KEY;

      const result = await categorizeEntry(entry);

      expect(result).toEqual({ category: 'other', summary: entry.description, source: 'fallback' });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('calls chat completions with defaults and returns LLM result', async () => {
      global.fetch.mockResolvedValue(llmResponse('{"category":"meeting","summary":"Sprint planning"}'));

      const result = await categorizeEntry(entry);

      expect(result).toEqual({ category: 'meeting', summary: 'Sprint planning', source: 'llm' });
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(options.headers.Authorization).toBe('Bearer test-key');
      const body = JSON.parse(options.body);
      expect(body.model).toBe('gpt-4o-mini');
      expect(body.messages[1].content).toContain('Client A');
    });

    test('uses OPENAI_MODEL and OPENAI_BASE_URL overrides', async () => {
      process.env.OPENAI_MODEL = 'llama3';
      process.env.OPENAI_BASE_URL = 'http://localhost:11434/v1/';
      global.fetch.mockResolvedValue(llmResponse('{"category":"development","summary":"Coding"}'));

      await categorizeEntry(entry);

      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe('http://localhost:11434/v1/chat/completions');
      expect(JSON.parse(options.body).model).toBe('llama3');
    });

    test('returns fallback when the request throws', async () => {
      global.fetch.mockRejectedValue(new Error('network'));

      const result = await categorizeEntry(entry);

      expect(result).toEqual({ category: 'other', summary: entry.description, source: 'fallback' });
      expect(console.error).toHaveBeenCalled();
    });

    test('returns fallback on non-2xx response', async () => {
      global.fetch.mockResolvedValue(llmResponse('', false, 503));

      const result = await categorizeEntry(entry);

      expect(result.source).toBe('fallback');
    });

    test('returns fallback when response cannot be parsed', async () => {
      global.fetch.mockResolvedValue(llmResponse('not json at all'));

      const result = await categorizeEntry(entry);

      expect(result).toEqual({ category: 'other', summary: entry.description, source: 'fallback' });
    });

    test('returns fallback with empty summary when description is null', async () => {
      delete process.env.OPENAI_API_KEY;

      const result = await categorizeEntry({ ...entry, description: null });

      expect(result).toEqual({ category: 'other', summary: '', source: 'fallback' });
    });
  });

  describe('parseLlmContent', () => {
    test('extracts JSON wrapped in markdown fences', () => {
      expect(parseLlmContent('```json\n{"category":"Review","summary":"PR review"}\n```'))
        .toEqual({ category: 'review', summary: 'PR review' });
    });

    test('coerces unknown categories to other', () => {
      expect(parseLlmContent('{"category":"coding","summary":"Did work"}'))
        .toEqual({ category: 'other', summary: 'Did work' });
    });

    test('collapses multi-line summaries to one line', () => {
      expect(parseLlmContent('{"category":"admin","summary":"Line one\\nline two"}'))
        .toEqual({ category: 'admin', summary: 'Line one line two' });
    });

    test('returns null for invalid content', () => {
      expect(parseLlmContent(undefined)).toBeNull();
      expect(parseLlmContent('{bad json}')).toBeNull();
      expect(parseLlmContent('{"category":"admin"}')).toBeNull();
      expect(parseLlmContent('[1]')).toBeNull();
    });
  });
});
