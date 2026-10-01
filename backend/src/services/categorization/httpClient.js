const { LLMHttpError, parseRetryAfter } = require('./errors');

async function postJson(fetchImpl, url, headers, body, timeoutMs) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new LLMHttpError(`LLM request failed: ${error.message}`, { status: 0 });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new LLMHttpError(`LLM request failed with status ${response.status}`, {
      status: response.status,
      retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      body: text.slice(0, 500)
    });
  }

  return response.json();
}

module.exports = {
  postJson
};
