const { postJson } = require('./httpClient');
const { LLMHttpError } = require('./errors');
const { orderResults } = require('./openaiCategorizer');
const { PROMPT_VERSION, buildResultSchema, buildSystemPrompt, buildUserPrompt } = require('./prompt');

const TOOL_NAME = 'record_work_entry_categories';

class AnthropicCategorizer {
  constructor({ apiKey, model = 'claude-3-5-haiku-latest', baseUrl = 'https://api.anthropic.com/v1', fetchImpl = fetch, timeoutMs = 60000 }) {
    if (!apiKey) throw new Error('LLM_API_KEY is required for the anthropic provider');
    this.provider = 'anthropic';
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
      `${this.baseUrl}/messages`,
      { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      {
        model: this.model,
        max_tokens: 4096,
        temperature: 0,
        system: buildSystemPrompt(allowedCategories),
        messages: [{ role: 'user', content: buildUserPrompt(descriptions) }],
        tools: [{
          name: TOOL_NAME,
          description: 'Record the category chosen for each work entry description.',
          input_schema: buildResultSchema(allowedCategories)
        }],
        tool_choice: { type: 'tool', name: TOOL_NAME }
      },
      this.timeoutMs
    );

    const toolUse = Array.isArray(data && data.content)
      ? data.content.find(block => block.type === 'tool_use' && block.name === TOOL_NAME)
      : null;
    if (!toolUse || !toolUse.input) {
      throw new LLMHttpError('LLM returned no structured content', { status: 422 });
    }
    return orderResults(toolUse.input.results, descriptions.length);
  }
}

module.exports = {
  AnthropicCategorizer
};
