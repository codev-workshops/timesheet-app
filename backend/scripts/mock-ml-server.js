#!/usr/bin/env node
// Deterministic stand-in for the ML hours-estimate service (ml/serve.py) for local dev.
// Usage: node scripts/mock-ml-server.js   (PORT env, default 8000)
const http = require('http');

const PORT = parseInt(process.env.PORT, 10) || 8000;
const MODEL_VERSION = 'mock-deterministic-v1';

function estimate({ clientId, description, department }) {
  const words = description.trim() ? description.trim().split(/\s+/).length : 0;
  const raw = 1 + (clientId % 4) * 0.5 + words * 0.25 + (department ? 0.5 : 0);
  return Math.round(Math.min(12, Math.max(0.25, raw)) * 100) / 100;
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, { status: 'ok', modelLoaded: true, modelVersion: MODEL_VERSION });
  }

  if (req.method === 'POST' && req.url === '/predict') {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 422, { detail: 'Invalid JSON body' });
      }
      const valid =
        body && Number.isInteger(body.clientId) &&
        typeof body.description === 'string' &&
        typeof body.userEmail === 'string' &&
        typeof body.date === 'string' &&
        (body.department === undefined || body.department === null || typeof body.department === 'string');
      if (!valid) {
        return send(res, 422, { detail: 'Invalid request body' });
      }
      console.log(`[mock-ml] predict ${JSON.stringify(body)}`);
      return send(res, 200, { estimatedHours: estimate(body), modelVersion: MODEL_VERSION });
    });
    return undefined;
  }

  return send(res, 404, { detail: 'Not Found' });
});

server.listen(PORT, () => {
  console.log(`Mock ML service listening on http://localhost:${PORT}`);
});
