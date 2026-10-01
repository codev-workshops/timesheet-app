const { MockCategorizer } = require('./mockCategorizer');
const { OpenAICategorizer } = require('./openaiCategorizer');
const { AnthropicCategorizer } = require('./anthropicCategorizer');

const PROVIDERS = ['openai', 'anthropic', 'mock'];

/**
 * Categorizer interface:
 *   provider: string, model: string, promptVersion: string
 *   async categorizeBatch(descriptions: string[], allowedCategories: string[])
 *     -> Array<{ category: string, confidence: number }> (same order/length as descriptions)
 */
function createCategorizer(env = process.env, { fetchImpl } = {}) {
  const provider = (env.LLM_PROVIDER || 'mock').toLowerCase();
  const options = {
    apiKey: env.LLM_API_KEY,
    ...(env.LLM_MODEL ? { model: env.LLM_MODEL } : {}),
    ...(env.LLM_BASE_URL ? { baseUrl: env.LLM_BASE_URL } : {}),
    ...(env.LLM_TIMEOUT_MS ? { timeoutMs: Number(env.LLM_TIMEOUT_MS) } : {}),
    ...(fetchImpl ? { fetchImpl } : {})
  };

  switch (provider) {
    case 'mock':
      return new MockCategorizer();
    case 'openai':
      return new OpenAICategorizer(options);
    case 'anthropic':
      return new AnthropicCategorizer(options);
    default:
      throw new Error(`Unknown LLM_PROVIDER "${provider}". Expected one of: ${PROVIDERS.join(', ')}`);
  }
}

module.exports = {
  createCategorizer,
  PROVIDERS
};
