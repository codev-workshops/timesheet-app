const DEFAULT_ML_SERVICE_URL = 'http://localhost:8000';
const DEFAULT_ML_TIMEOUT_MS = 2000;

class MlServiceError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'MlServiceError';
    this.code = code;
    Object.assign(this, details);
  }
}

function getConfig() {
  const baseUrl = (process.env.ML_SERVICE_URL || DEFAULT_ML_SERVICE_URL).replace(/\/+$/, '');
  const parsedTimeout = parseInt(process.env.ML_TIMEOUT_MS, 10);
  const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : DEFAULT_ML_TIMEOUT_MS;
  return { baseUrl, timeoutMs };
}

function isValidPrediction(body) {
  return (
    body !== null &&
    typeof body === 'object' &&
    typeof body.estimatedHours === 'number' &&
    Number.isFinite(body.estimatedHours) &&
    typeof body.modelVersion === 'string' &&
    body.modelVersion.length > 0
  );
}

async function predictHours({ clientId, description, userEmail, date, department }) {
  const { baseUrl, timeoutMs } = getConfig();
  const payload = {
    clientId,
    description: description || '',
    userEmail,
    date,
    department: department || null
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  let body;
  try {
    response = await fetch(`${baseUrl}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new MlServiceError(`ML service responded with status ${response.status}`, 'HTTP_ERROR', {
        status: response.status
      });
    }

    try {
      body = await response.json();
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw new MlServiceError('ML service returned invalid JSON', 'BAD_RESPONSE', { cause: err });
    }
  } catch (err) {
    if (err instanceof MlServiceError) throw err;
    if (err && err.name === 'AbortError') {
      throw new MlServiceError(`ML service timed out after ${timeoutMs}ms`, 'TIMEOUT');
    }
    throw new MlServiceError(`ML service request failed: ${err && err.message}`, 'NETWORK', { cause: err });
  } finally {
    clearTimeout(timer);
  }

  if (!isValidPrediction(body)) {
    throw new MlServiceError('ML service returned an unexpected response shape', 'BAD_RESPONSE');
  }

  return { estimatedHours: body.estimatedHours, modelVersion: body.modelVersion };
}

module.exports = {
  predictHours,
  MlServiceError,
  DEFAULT_ML_SERVICE_URL,
  DEFAULT_ML_TIMEOUT_MS
};
