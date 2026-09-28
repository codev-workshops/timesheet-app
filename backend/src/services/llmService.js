const CATEGORIES = ['development', 'meeting', 'review', 'admin', 'other'];
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_SUMMARY_LENGTH = 200;

function fallbackResult(description) {
  return {
    category: 'other',
    summary: description || '',
    source: 'fallback'
  };
}

function buildMessages({ description, clientName, hours, date }) {
  const system = [
    'You categorize and summarize timesheet work entries.',
    'Respond with strict JSON only, no markdown or extra text, in the form:',
    '{"category": "<category>", "summary": "<summary>"}',
    `"category" must be exactly one of: ${CATEGORIES.join(', ')}.`,
    '"summary" must be a single-line summary of the work (max 120 characters).'
  ].join('\n');

  const user = [
    `Client: ${clientName || 'Unknown'}`,
    `Date: ${date || 'Unknown'}`,
    `Hours: ${hours ?? 'Unknown'}`,
    `Description: ${description || '(none)'}`
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

function parseLlmContent(content) {
  if (typeof content !== 'string') {
    return null;
  }

  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const summary = typeof parsed.summary === 'string'
    ? parsed.summary.replace(/\s+/g, ' ').trim().slice(0, MAX_SUMMARY_LENGTH)
    : '';
  if (!summary) {
    return null;
  }

  const rawCategory = typeof parsed.category === 'string' ? parsed.category.trim().toLowerCase() : '';
  const category = CATEGORIES.includes(rawCategory) ? rawCategory : 'other';

  return { category, summary };
}

async function categorizeEntry({ description, clientName, hours, date }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackResult(description);
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const baseUrl = (process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: buildMessages({ description, clientName, hours, date }),
        temperature: 0
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`LLM request failed with status ${response.status}`);
    }

    const data = await response.json();
    const result = parseLlmContent(data?.choices?.[0]?.message?.content);
    if (!result) {
      throw new Error('LLM response could not be parsed');
    }

    return { ...result, source: 'llm' };
  } catch (error) {
    console.error('LLM categorization failed, using fallback:', error.message);
    return fallbackResult(description);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  CATEGORIES,
  categorizeEntry,
  fallbackResult,
  parseLlmContent
};
