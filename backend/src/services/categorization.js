const { CATEGORIES } = require('./categories');

const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

class CategorizationError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'CategorizationError';
    this.status = status;
  }
}

function buildPrompt({ description, clientName, department }) {
  const context = [
    `Description: ${description || '(none)'}`,
    clientName ? `Client: ${clientName}` : null,
    department ? `Department: ${department}` : null
  ].filter(Boolean).join('\n');

  return [
    {
      role: 'system',
      content:
        'You classify timesheet work entries. Respond with exactly one of the following ' +
        `categories and nothing else: ${CATEGORIES.join(', ')}.`
    },
    { role: 'user', content: context }
  ];
}

function normalizeCategory(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().replace(/[.\s"']+$/g, '').replace(/^["']+/, '');
  return CATEGORIES.find((c) => c.toLowerCase() === cleaned.toLowerCase()) || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callChatCompletions(messages, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model: OPENAI_MODEL, messages, temperature: 0, max_tokens: 10 }),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new CategorizationError('Categorization request timed out', 504);
    }
    throw new CategorizationError(`Categorization request failed: ${err.message}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

async function categorizeEntry({ description, clientName, department }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new CategorizationError('OPENAI_API_KEY is not configured', 503);
  }

  const messages = buildPrompt({ description, clientName, department });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await callChatCompletions(messages, apiKey);

    if (response.status === 429 || response.status >= 500) {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
        continue;
      }
      throw new CategorizationError(
        response.status === 429 ? 'Categorization rate limited' : 'Categorization provider error',
        response.status === 429 ? 429 : 502
      );
    }

    if (!response.ok) {
      throw new CategorizationError(`Categorization provider returned ${response.status}`, 502);
    }

    let body;
    try {
      body = await response.json();
    } catch (err) {
      throw new CategorizationError('Malformed categorization response', 502);
    }

    const category = normalizeCategory(body?.choices?.[0]?.message?.content);
    if (!category) {
      throw new CategorizationError('Model returned an unrecognized category', 502);
    }
    return category;
  }

  throw new CategorizationError('Categorization failed', 502);
}

module.exports = {
  CATEGORIES,
  CategorizationError,
  buildPrompt,
  normalizeCategory,
  categorizeEntry
};
