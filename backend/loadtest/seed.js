const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const USER_EMAIL = process.env.SEED_USER_EMAIL || 'loadtest@example.com';
const CONCURRENCY = Number.parseInt(process.env.SEED_CONCURRENCY || '25', 10);
const tiers = (process.env.SEED_TIERS || '1000,10000,50000')
  .split(',')
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isInteger(value) && value > 0)
  .sort((a, b) => a - b);

if (tiers.length === 0) {
  throw new Error('SEED_TIERS must contain at least one positive entry count.');
}

if (!Number.isInteger(CONCURRENCY) || CONCURRENCY < 1) {
  throw new Error('SEED_CONCURRENCY must be a positive integer.');
}

async function request(endpoint, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'x-user-email': USER_EMAIL,
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw new Error(`Request to ${BASE_URL}${endpoint} failed: ${error.message}`);
  }

  const body = await response.text();
  if (!response.ok) {
    console.error(`${options.method || 'GET'} ${endpoint} failed with ${response.status}: ${body}`);
    if (response.status === 429) {
      console.error('Hint: start the server with DISABLE_RATE_LIMIT=true for load testing.');
    }
    throw new Error(`Request failed with HTTP ${response.status}`);
  }

  let parsedBody;
  try {
    parsedBody = body ? JSON.parse(body) : null;
  } catch {
    parsedBody = body;
  }

  return parsedBody;
}

function randomDate() {
  const now = Date.now();
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const timestamp = threeYearsAgo.getTime() + Math.random() * (now - threeYearsAgo.getTime());
  return new Date(timestamp).toISOString().slice(0, 10);
}

function randomHours() {
  return Math.round((0.25 + Math.random() * 7.75) * 100) / 100;
}

async function seedEntries(clientId, count) {
  let nextIndex = 0;
  let completed = 0;
  let firstError;
  const workerCount = Math.min(CONCURRENCY, count);

  async function worker() {
    while (!firstError) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= count) {
        return;
      }

      try {
        await request('/api/work-entries', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            clientId,
            hours: randomHours(),
            description: `Seed entry ${index}`,
            date: randomDate()
          })
        });
      } catch (error) {
        firstError = error;
        return;
      }

      completed += 1;
      if (completed % 1000 === 0) {
        console.log(`  ${completed}/${count} entries`);
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (firstError) {
    throw firstError;
  }
}

async function createClient(tier) {
  const body = await request('/api/clients', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: `Load Test Client (${tier} entries)`,
      department: 'LoadTest'
    })
  });

  const clientId = body?.client?.id;
  if (!clientId) {
    throw new Error(`Client creation response did not include an ID: ${JSON.stringify(body)}`);
  }
  return clientId;
}

async function main() {
  try {
    await request('/health');
  } catch (error) {
    throw new Error(`Unable to reach server at ${BASE_URL}. Start the backend first. ${error.message}`);
  }

  const results = [];
  for (const tier of tiers) {
    const startedAt = Date.now();
    const clientId = await createClient(tier);
    console.log(`Seeding ${tier} entries for client ${clientId}...`);
    await seedEntries(clientId, tier);
    results.push({
      tier,
      clientId,
      entries: tier,
      elapsed: `${((Date.now() - startedAt) / 1000).toFixed(2)}s`
    });
  }

  fs.writeFileSync(
    path.join(__dirname, 'seed-output.json'),
    `${JSON.stringify({ userEmail: USER_EMAIL, clients: results.map(({ tier, clientId }) => ({ tier, clientId })) }, null, 2)}\n`
  );

  console.table(results);
  if (tiers.length === 3) {
    const labels = ['SMALL', 'MEDIUM', 'LARGE'];
    console.log(labels.map((label, index) => `${label}_CLIENT_ID=${results[index].clientId}`).join(' '));
  } else {
    console.log(`CLIENT_IDS=${results.map(({ clientId }) => clientId).join(',')}`);
  }
}

main().catch((error) => {
  console.error(`Seed failed: ${error.message}`);
  process.exitCode = 1;
});
