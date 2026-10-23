// Synthetic, deterministic timesheet data for demos and for training the hours model.
// hours = archetype base + client effect + weekday effect + gaussian noise (+ rare outliers),
// clipped to (0, 24] and rounded to 2 decimals so every row passes workEntrySchema.

const CLIENTS = [
  { name: 'Acme Corp', department: 'Engineering', effect: 0.8, weight: 0.22 },
  { name: 'Globex', department: 'Engineering', effect: 0.3, weight: 0.18 },
  { name: 'Initech', department: 'Finance', effect: -0.4, weight: 0.14 },
  { name: 'Umbrella Health', department: 'Healthcare', effect: 1.2, weight: 0.12 },
  { name: 'Stark Retail', department: 'Retail', effect: -0.6, weight: 0.12 },
  { name: 'Wayne Logistics', department: 'Finance', effect: 0.0, weight: 0.1 },
  { name: 'Hooli', department: 'Engineering', effect: 0.5, weight: 0.07 },
  { name: 'Soylent Foods', department: 'Retail', effect: -0.9, weight: 0.05 }
];

const ARCHETYPES = [
  { name: 'bug fix', base: 2.5, weight: 0.2, templates: ['Bug fix in checkout flow', 'Fixed login bug', 'Bug fix: null pointer on save', 'Hotfix for payment bug'] },
  { name: 'deployment', base: 1.5, weight: 0.1, templates: ['Production deployment', 'Deploy release to production', 'Staging deployment'] },
  { name: 'client meeting', base: 1.0, weight: 0.17, templates: ['Client meeting', 'Weekly sync meeting with client', 'Requirements meeting'] },
  { name: 'code review', base: 1.25, weight: 0.15, templates: ['Code review', 'Reviewed pull requests', 'Code review for API changes'] },
  { name: 'documentation', base: 2.0, weight: 0.1, templates: ['Documentation update', 'Wrote API documentation', 'Updated onboarding docs'] },
  { name: 'feature development', base: 5.5, weight: 0.18, templates: ['Feature development: dashboard', 'Implemented new reporting feature', 'Built CSV import feature'] },
  { name: 'testing', base: 3.0, weight: 0.1, templates: ['Testing and QA', 'Wrote unit tests', 'Regression testing'] }
];

// Index = Date#getUTCDay() (0 = Sunday).
const WEEKDAY_EFFECT = [-1.0, 0.5, 0.3, 0.0, -0.1, -0.6, -0.8];
// Relative frequency of entries per weekday: clustered Mon-Thu, rare weekends.
const WEEKDAY_WEIGHT = [0.02, 1.0, 1.0, 0.95, 0.9, 0.6, 0.03];

const DEFAULTS = {
  seed: 42,
  entryCount: 1500,
  startDate: '2026-01-01',
  endDate: '2026-09-30',
  noiseSd: 0.6,
  emptyDescriptionRate: 0.08,
  outlierRate: 0.02
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand) {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pickWeighted(rand, items, weightOf) {
  const total = items.reduce((sum, item, i) => sum + weightOf(item, i), 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weightOf(items[i], i);
    if (r <= 0) return i;
  }
  return items.length - 1;
}

function toIsoDate(ms) {
  return new Date(ms).toISOString().split('T')[0];
}

function generateDataset(options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const rand = mulberry32(opts.seed);
  const dayMs = 24 * 60 * 60 * 1000;
  const start = Date.parse(`${opts.startDate}T00:00:00Z`);
  const end = Date.parse(`${opts.endDate}T00:00:00Z`);
  const days = [];
  for (let t = start; t <= end; t += dayMs) days.push(t);

  const clients = CLIENTS.map((c) => ({
    name: c.name,
    department: c.department,
    description: `Synthetic demo client (${c.department})`,
    email: `contact@${c.name.toLowerCase().replace(/[^a-z]+/g, '')}.example.com`
  }));

  const entries = [];
  for (let i = 0; i < opts.entryCount; i++) {
    const clientIndex = pickWeighted(rand, CLIENTS, (c) => c.weight);
    const archetype = ARCHETYPES[pickWeighted(rand, ARCHETYPES, (a) => a.weight)];
    const dayIndex = pickWeighted(rand, days, (t) => WEEKDAY_WEIGHT[new Date(t).getUTCDay()]);
    const dateMs = days[dayIndex];
    const weekday = new Date(dateMs).getUTCDay();

    let hours = archetype.base + CLIENTS[clientIndex].effect + WEEKDAY_EFFECT[weekday] + opts.noiseSd * gaussian(rand);
    if (rand() < opts.outlierRate) hours = hours * (2.5 + rand()) + 2;
    hours = Math.round(Math.min(24, Math.max(0.25, hours)) * 100) / 100;

    const description = rand() < opts.emptyDescriptionRate
      ? ''
      : archetype.templates[Math.floor(rand() * archetype.templates.length)];

    entries.push({
      clientIndex,
      clientName: CLIENTS[clientIndex].name,
      department: CLIENTS[clientIndex].department,
      archetype: archetype.name,
      hours,
      description,
      date: toIsoDate(dateMs)
    });
  }

  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return { clients, entries };
}

function run(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

// Writes the dataset for one user. Dates are stored as epoch ms, matching what
// POST /api/work-entries stores (Joi converts the ISO date to a Date).
async function seedDatabase(db, { userEmail, ...options }) {
  if (!userEmail) throw new Error('seedDatabase requires a userEmail');
  const { clients, entries } = generateDataset(options);

  await run(db, 'INSERT OR IGNORE INTO users (email) VALUES (?)', [userEmail]);
  const clientIds = [];
  for (const c of clients) {
    const result = await run(
      db,
      'INSERT INTO clients (name, description, department, email, user_email) VALUES (?, ?, ?, ?, ?)',
      [c.name, c.description, c.department, c.email, userEmail]
    );
    clientIds.push(result.lastID);
  }
  for (const e of entries) {
    await run(
      db,
      'INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (?, ?, ?, ?, ?)',
      [clientIds[e.clientIndex], userEmail, e.hours, e.description || null, Date.parse(`${e.date}T00:00:00Z`)]
    );
  }
  return { clients: clients.length, workEntries: entries.length };
}

function toCsv(entries) {
  const header = 'client_id,client_name,department,hours,description,date';
  const quote = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = entries.map((e) =>
    [e.clientIndex + 1, quote(e.clientName), quote(e.department), e.hours, quote(e.description), e.date].join(',')
  );
  return `${[header, ...rows].join('\n')}\n`;
}

// CLI: node src/database/seed.js --out dataset.(json|csv)
if (require.main === module) {
  const fs = require('fs');
  const outIndex = process.argv.indexOf('--out');
  const out = outIndex > -1 ? process.argv[outIndex + 1] : null;
  const { entries } = generateDataset();
  const rows = entries.map((e) => ({
    client_id: e.clientIndex + 1,
    client_name: e.clientName,
    department: e.department,
    hours: e.hours,
    description: e.description,
    date: e.date
  }));
  const body = out && out.endsWith('.csv') ? toCsv(entries) : `${JSON.stringify(rows, null, 2)}\n`;
  if (out) {
    fs.writeFileSync(out, body);
    console.log(`Wrote ${rows.length} entries to ${out}`);
  } else {
    process.stdout.write(body);
  }
}

module.exports = { generateDataset, seedDatabase, toCsv, CLIENTS, ARCHETYPES, WEEKDAY_EFFECT };
