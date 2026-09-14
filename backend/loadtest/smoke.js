const autocannon = require('autocannon');

const baseUrl = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const path = process.env.SMOKE_PATH || '/api/work-entries';
const connections = Number.parseInt(process.env.SMOKE_CONNECTIONS || '10', 10);
const durationValue = process.env.SMOKE_DURATION || '10s';
const duration = Number.parseInt(String(durationValue).replace(/s$/, ''), 10);
const userEmail = process.env.USER_EMAIL || 'loadtest@example.com';

if (!Number.isInteger(connections) || connections < 1) {
  throw new Error('SMOKE_CONNECTIONS must be a positive integer.');
}

if (!Number.isInteger(duration) || duration < 1) {
  throw new Error('SMOKE_DURATION must be a positive number of seconds.');
}

const instance = autocannon({
  url: `${baseUrl}${path}`,
  connections,
  duration,
  headers: {
    'x-user-email': userEmail
  }
}, (error) => {
  if (error) {
    console.error(`Smoke test failed: ${error.message}`);
    process.exitCode = 1;
  }
});

autocannon.track(instance);
