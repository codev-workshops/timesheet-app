const { createCategorizer } = require('../../../services/categorization/categorizerFactory');
const { MockCategorizer } = require('../../../services/categorization/mockCategorizer');
const { OpenAICategorizer } = require('../../../services/categorization/openaiCategorizer');
const { AnthropicCategorizer } = require('../../../services/categorization/anthropicCategorizer');
const { LLMHttpError } = require('../../../services/categorization/errors');
const { categorizeDescriptions } = require('../../../services/categorization/categorizationService');
const { CATEGORY_NAMES } = require('../../../services/categorization/categories');

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => headers[name.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

function openAiBody(results) {
  return { choices: [{ message: { content: JSON.stringify({ results }) } }] };
}

describe('categorizerFactory', () => {
  test('defaults to the mock provider', () => {
    expect(createCategorizer({})).toBeInstanceOf(MockCategorizer);
  });

  test('selects real providers from env only', () => {
    const openai = createCategorizer({ LLM_PROVIDER: 'openai', LLM_API_KEY: 'k', LLM_MODEL: 'gpt-x', LLM_BASE_URL: 'http://llm/v1/' });
    expect(openai).toBeInstanceOf(OpenAICategorizer);
    expect(openai.model).toBe('gpt-x');
    expect(openai.baseUrl).toBe('http://llm/v1');
    expect(createCategorizer({ LLM_PROVIDER: 'Anthropic', LLM_API_KEY: 'k' })).toBeInstanceOf(AnthropicCategorizer);
  });

  test('requires an API key for real providers', () => {
    expect(() => createCategorizer({ LLM_PROVIDER: 'openai' })).toThrow('LLM_API_KEY');
    expect(() => createCategorizer({ LLM_PROVIDER: 'anthropic' })).toThrow('LLM_API_KEY');
  });

  test('rejects unknown providers', () => {
    expect(() => createCategorizer({ LLM_PROVIDER: 'other' })).toThrow('Unknown LLM_PROVIDER');
  });
});

describe('OpenAICategorizer', () => {
  test('sends a temperature=0 request constrained by a JSON schema of allowed categories', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(openAiBody([
      { index: 1, category: 'development', confidence: 0.8 },
      { index: 0, category: 'meetings', confidence: 0.9 }
    ])));
    const categorizer = new OpenAICategorizer({ apiKey: 'secret', model: 'gpt-test', fetchImpl });

    const results = await categorizer.categorizeBatch(['standup', 'fixed bug'], CATEGORY_NAMES);

    expect(results).toEqual([
      { category: 'meetings', confidence: 0.9 },
      { category: 'development', confidence: 0.8 }
    ]);
    const [url, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer secret');
    expect(body.model).toBe('gpt-test');
    expect(body.temperature).toBe(0);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.properties.results.items.properties.category.enum)
      .toEqual(CATEGORY_NAMES);
  });

  test('surfaces 429 with Retry-After as a retryable error', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ error: 'rate' }, { status: 429, headers: { 'retry-after': '2' } }));
    const categorizer = new OpenAICategorizer({ apiKey: 'k', fetchImpl });

    await expect(categorizer.categorizeBatch(['x'], CATEGORY_NAMES)).rejects.toMatchObject({ status: 429, retryAfterMs: 2000 });
  });

  test('wraps network failures and malformed output', async () => {
    const network = new OpenAICategorizer({ apiKey: 'k', fetchImpl: jest.fn().mockRejectedValue(new TypeError('fetch failed')) });
    await expect(network.categorizeBatch(['x'], CATEGORY_NAMES)).rejects.toMatchObject({ status: 0 });

    const refusal = new OpenAICategorizer({ apiKey: 'k', fetchImpl: jest.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { refusal: 'no' } }] })) });
    await expect(refusal.categorizeBatch(['x'], CATEGORY_NAMES)).rejects.toBeInstanceOf(LLMHttpError);

    const invalid = new OpenAICategorizer({ apiKey: 'k', fetchImpl: jest.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: 'not json' } }] })) });
    await expect(invalid.categorizeBatch(['x'], CATEGORY_NAMES)).rejects.toThrow('invalid JSON');
  });

  test('batch path retries a 429 twice then succeeds', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 429, headers: { 'retry-after': '1' } }))
      .mockResolvedValueOnce(jsonResponse({}, { status: 429 }))
      .mockResolvedValueOnce(jsonResponse(openAiBody([{ index: 0, category: 'testing', confidence: 0.7 }])));
    const sleep = jest.fn().mockResolvedValue();
    const categorizer = new OpenAICategorizer({ apiKey: 'k', fetchImpl });

    const outcomes = await categorizeDescriptions(['ran regression suite'], {
      categorizer,
      allowedCategories: CATEGORY_NAMES,
      retryOptions: { sleep, random: () => 0 }
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(outcomes[0]).toMatchObject({ status: 'done', category: 'testing', source: 'llm' });
  });

  test('missing indexes and unknown categories fall back to uncategorized', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(openAiBody([
      { index: 0, category: 'hacked', confidence: 0.99 }
    ])));
    const outcomes = await categorizeDescriptions(['a', 'b'], {
      categorizer: new OpenAICategorizer({ apiKey: 'k', fetchImpl }),
      allowedCategories: CATEGORY_NAMES
    });
    expect(outcomes.map(o => [o.category, o.fallback])).toEqual([['uncategorized', true], ['uncategorized', true]]);
  });
});

describe('AnthropicCategorizer', () => {
  test('forces a tool call whose schema enumerates allowed categories', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
      content: [{ type: 'tool_use', name: 'record_work_entry_categories', input: { results: [{ index: 0, category: 'design', confidence: 0.6 }] } }]
    }));
    const categorizer = new AnthropicCategorizer({ apiKey: 'secret', model: 'claude-test', fetchImpl });

    await expect(categorizer.categorizeBatch(['figma'], CATEGORY_NAMES)).resolves.toEqual([{ category: 'design', confidence: 0.6 }]);
    const [url, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('secret');
    expect(body.temperature).toBe(0);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'record_work_entry_categories' });
    expect(body.tools[0].input_schema.properties.results.items.properties.category.enum).toEqual(CATEGORY_NAMES);
  });

  test('rejects responses without a tool call', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({ content: [{ type: 'text', text: 'hi' }] }));
    const categorizer = new AnthropicCategorizer({ apiKey: 'k', fetchImpl });
    await expect(categorizer.categorizeBatch(['x'], CATEGORY_NAMES)).rejects.toBeInstanceOf(LLMHttpError);
  });
});
