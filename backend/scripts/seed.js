/**
 * Performance seed: populates the in-memory SQLite DB with a large, deterministic dataset.
 *
 * Because the DB is `:memory:` and per-process, this must run inside the server process
 * (see SEED_PERF in src/server.js). It can also be run standalone for ad-hoc inspection:
 *   node scripts/seed.js
 *
 * Env vars (all optional):
 *   SEED_USER_EMAIL   default perf@example.com
 *   SEED_CLIENTS      default 20
 *   SEED_ENTRIES      default 50000
 *   SEED_RANDOM_SEED  default 42 (deterministic PRNG so runs are reproducible)
 */
const { getDatabase, initializeDatabase } = require('../src/database/init');

const DEFAULTS = {
  userEmail: 'perf@example.com',
  clients: 20,
  entries: 50000,
  randomSeed: 42
};

function readConfig(env = process.env) {
  return {
    userEmail: env.SEED_USER_EMAIL || DEFAULTS.userEmail,
    clients: parseInt(env.SEED_CLIENTS, 10) || DEFAULTS.clients,
    entries: parseInt(env.SEED_ENTRIES, 10) || DEFAULTS.entries,
    randomSeed: parseInt(env.SEED_RANDOM_SEED, 10) || DEFAULTS.randomSeed
  };
}

// mulberry32: small deterministic PRNG
function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DESCRIPTIONS = [
  'Sprint planning and backlog grooming',
  'Implemented API endpoint and unit tests',
  'Code review and pairing session',
  'Customer call and requirements follow-up',
  'Bug triage and hotfix deployment',
  'Database schema migration',
  'Wrote integration tests for reporting module',
  'Refactored authentication middleware',
  'Performance profiling of export pipeline',
  'Documentation and onboarding notes',
  null
];

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function pad(n) {
  return String(n).padStart(2, '0');
}

async function seedPerfData(config = readConfig()) {
  const db = getDatabase();
  const rng = createRng(config.randomSeed);
  const started = Date.now();

  await run(db, 'INSERT OR IGNORE INTO users (email) VALUES (?)', [config.userEmail]);

  const clientIds = [];
  for (let i = 1; i <= config.clients; i++) {
    const result = await run(
      db,
      'INSERT INTO clients (name, description, department, email, user_email) VALUES (?, ?, ?, ?, ?)',
      [
        `Perf Client ${pad(i)}`,
        `Synthetic client #${i} for load testing`,
        ['Engineering', 'Sales', 'Marketing', 'Finance'][i % 4],
        `client${i}@perf.example.com`,
        config.userEmail
      ]
    );
    clientIds.push(result.lastID);
  }

  // Two years of dates, ending 2024-12-31 so the dataset is stable across runs.
  const end = Date.UTC(2024, 11, 31);
  const dayMs = 24 * 60 * 60 * 1000;
  const spanDays = 730;

  await run(db, 'BEGIN TRANSACTION');
  const stmt = db.prepare(
    'INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (?, ?, ?, ?, ?)'
  );
  for (let i = 0; i < config.entries; i++) {
    const clientId = clientIds[Math.floor(rng() * clientIds.length)];
    const hours = Math.round((0.25 + rng() * 9.75) * 4) / 4; // 0.25 .. 10.00 in quarter hours
    const description = DESCRIPTIONS[Math.floor(rng() * DESCRIPTIONS.length)];
    const d = new Date(end - Math.floor(rng() * spanDays) * dayMs);
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    stmt.run([clientId, config.userEmail, hours, description, date]);
  }
  await new Promise((resolve, reject) => stmt.finalize((err) => (err ? reject(err) : resolve())));
  await run(db, 'COMMIT');

  const summary = {
    ...config,
    clientIds,
    durationMs: Date.now() - started
  };
  console.log(
    `[seed] user=${config.userEmail} clients=${config.clients} entries=${config.entries} ` +
      `seed=${config.randomSeed} clientIds=${clientIds[0]}..${clientIds[clientIds.length - 1]} ` +
      `(${summary.durationMs}ms)`
  );
  return summary;
}

module.exports = { seedPerfData, readConfig, DEFAULTS };

if (require.main === module) {
  initializeDatabase()
    .then(() => seedPerfData())
    .then((s) => {
      console.log(JSON.stringify(s));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[seed] failed:', err);
      process.exit(1);
    });
}
