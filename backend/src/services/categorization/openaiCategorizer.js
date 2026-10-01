const { postJson } = require('./httpClient');
const { LLMHttpError } = require('./errors');
const { PROMPT_VERSION, buildResultSchema, buildSystemPrompt, buildUserPrompt } = require('./prompt');

class OpenAICategorizer {
  constructor({ apiKey, model = 'gpt-4o-mini', baseUrl = 'https://api.openai.com/v1', fetchImpl = fetch, timeoutMs = 60000 }) {
    if (!apiKey) throw new Error('LLM_API_KEY is required for the openai provider');
    this.provider = 'openai';
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.promptVersion = PROMPT_VERSION;
  }

  async categorizeBatch(descriptions, allowedCategories) {
    const data = await postJson(
      this.fetchImpl,
      `${this.baseUrl}/chat/completions`,
      { Authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        temperature: 0,
        messages: [
          { role: 'system', content: buildSystemPrompt(allowedCategories) },
          { role: 'user', content: buildUserPrompt(descriptions) }
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'work_entry_categories',
            strict: true,
            schema: buildResultSchema(allowedCategories)
          }
        }
      },
      this.timeoutMs
    );

    const message = data && data.choices && data.choices[0] && data.choices[0].message;
    if (!message || message.refusal || typeof message.content !== 'string') {
      throw new LLMHttpError('LLM returned no structured content', { status: 422 });
    }

    let parsed;
    try {
      parsed = JSON.parse(message.content);
    } catch (error) {
      throw new LLMHttpError('LLM returned invalid JSON', { status: 422 });
    }
    return orderResults(parsed.results, descriptions.length);
  }
}

function orderResults(results, expectedLength) {
  const ordered = new Array(expectedLength).fill(null);
  for (const result of Array.isArray(results) ? results : []) {
    if (Number.isInteger(result.index) && result.index >= 0 && result.index < expectedLength) {
      ordered[result.index] = { category: result.category, confidence: result.confidence };
    }
  }
  return ordered;
}

module.exports = {
  OpenAICategorizer,
  orderResults
};
