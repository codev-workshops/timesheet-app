// Trains the hours model and writes model.json + EVALUATION.md.
// Usage: node src/ml/train.js [--data dump.json|dump.csv]
// Without --data the synthetic dataset is seeded into the in-memory SQLite DB and read
// back with the same join the work-entries routes use.

const fs = require('fs');
const path = require('path');
const { buildFeatures, toVector, featureNames, buildVocabulary, parseDate } = require('./features');
const { fitRidge, predictRidge } = require('./ridge');
const { fitBaseline, predictClientMean, predictGlobalMean } = require('./baseline');
const { compareToBaselines, regressionMetrics, formatTable } = require('./evaluate');

const MODEL_PATH = path.join(__dirname, 'model.json');
const REPORT_PATH = path.join(__dirname, 'EVALUATION.md');
const TEST_FRACTION = 0.2;
const LAMBDAS = [0.1, 1, 3, 10, 30, 100];
const TRAINING_USER = 'ml-training@example.com';

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { values.push(cur); cur = ''; } else cur += ch;
    }
    values.push(cur);
    return Object.fromEntries(header.map((h, i) => [h, values[i]]));
  });
}

function normalizeRow(r) {
  return {
    clientId: Number(r.client_id),
    department: r.department || '',
    description: r.description || '',
    date: parseDate(r.date),
    hours: Number(r.hours)
  };
}

async function loadFromSeededDb() {
  const { getDatabase, initializeDatabase, closeDatabase } = require('../database/init');
  const { seedDatabase } = require('../database/seed');
  await initializeDatabase();
  const db = getDatabase();
  await seedDatabase(db, { userEmail: TRAINING_USER });
  const rows = await new Promise((resolve, reject) => {
    db.all(
      `SELECT we.id, we.client_id, we.hours, we.description, we.date,
              we.created_at, we.updated_at, c.name as client_name, c.department
       FROM work_entries we
       JOIN clients c ON we.client_id = c.id
       WHERE we.user_email = ?
       ORDER BY we.date ASC, we.id ASC`,
      [TRAINING_USER],
      (err, result) => (err ? reject(err) : resolve(result))
    );
  });
  await closeDatabase();
  return rows;
}

async function loadRows(dataPath) {
  let raw;
  if (dataPath) {
    const text = fs.readFileSync(dataPath, 'utf8');
    raw = dataPath.endsWith('.csv') ? parseCsv(text) : JSON.parse(text);
  } else {
    raw = await loadFromSeededDb();
  }
  return raw.map(normalizeRow).sort((a, b) => a.date - b.date);
}

// Time-based split: everything on/after the cutoff day is held out, so no day is in both sets.
function timeSplit(rows, testFraction) {
  const cutoff = rows[Math.floor(rows.length * (1 - testFraction))].date.getTime();
  return { train: rows.filter((r) => r.date.getTime() < cutoff), test: rows.filter((r) => r.date.getTime() >= cutoff), cutoff };
}

function design(rows, meta) {
  return rows.map((r) => toVector(buildFeatures(r), meta));
}

function fit(rows, lambda) {
  const meta = buildVocabulary(rows);
  const model = fitRidge(design(rows, meta), rows.map((r) => r.hours), lambda);
  return { ...model, meta };
}

function predictRows(model, rows) {
  return design(rows, model.meta).map((x) => predictRidge(model, x));
}

function selectLambda(train) {
  const { train: inner, test: valid } = timeSplit(train, TEST_FRACTION);
  const scores = LAMBDAS.map((lambda) => {
    const yPred = predictRows(fit(inner, lambda), valid);
    return { lambda, mae: regressionMetrics(valid.map((r) => r.hours), yPred).mae };
  });
  return scores.reduce((best, s) => (s.mae < best.mae ? s : best));
}

const r8 = (v) => Math.round(v * 1e8) / 1e8;
const day = (d) => d.toISOString().split('T')[0];

async function main() {
  const dataIndex = process.argv.indexOf('--data');
  const rows = await loadRows(dataIndex > -1 ? process.argv[dataIndex + 1] : null);
  const { train, test, cutoff } = timeSplit(rows, TEST_FRACTION);
  const { lambda } = selectLambda(train);

  const model = fit(train, lambda);
  const baseline = fitBaseline(train);
  const yTest = test.map((r) => r.hours);
  const results = compareToBaselines(yTest, {
    ridge: predictRows(model, test).map((v) => Math.min(24, Math.max(0.25, v))),
    per_client_mean: test.map((r) => predictClientMean(baseline, r.clientId)),
    global_mean: test.map(() => predictGlobalMean(baseline))
  });
  const gatePassed = results.ridge.mae < results.per_client_mean.mae;
  const split = {
    trainRows: train.length,
    testRows: test.length,
    trainRange: [day(train[0].date), day(train[train.length - 1].date)],
    testRange: [day(new Date(cutoff)), day(test[test.length - 1].date)]
  };

  console.log(`Time-based split: train ${split.trainRange.join('..')} (${split.trainRows}), test ${split.testRange.join('..')} (${split.testRows}); lambda=${lambda}`);
  console.log(formatTable(results));
  console.log(`Gate (ridge MAE < per-client-mean MAE): ${gatePassed ? 'PASS' : 'FAIL'}`);
  if (!gatePassed) {
    process.exitCode = 1;
    return;
  }

  // Deployed model is refit on all rows (incl. the most recent) with the selected lambda.
  const final = fit(rows, lambda);
  const artifact = {
    format: 'timesheet-hours-ridge',
    version: 1,
    lambda,
    meta: final.meta,
    featureNames: featureNames(final.meta),
    intercept: r8(final.intercept),
    weights: final.weights.map(r8),
    means: final.means.map(r8),
    stds: final.stds.map(r8),
    training: { rows: rows.length, range: [day(rows[0].date), day(rows[rows.length - 1].date)] },
    evaluation: { split, results, gatePassed }
  };
  fs.writeFileSync(MODEL_PATH, `${JSON.stringify(artifact, null, 2)}\n`);

  const topWeights = artifact.featureNames
    .map((name, j) => ({ name, effect: final.weights[j] / final.stds[j] }))
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
    .slice(0, 10)
    .map((w) => `| ${w.name} | ${w.effect.toFixed(3)} |`);
  fs.writeFileSync(
    REPORT_PATH,
    [
      '# Hours model evaluation',
      '',
      'Generated by `npm run ml:train`. Do not edit by hand.',
      '',
      `- Data: ${rows.length} synthetic work entries from \`src/database/seed.js\` (seed 42).`,
      `- Time-based split: train ${split.trainRange.join(' → ')} (${split.trainRows} rows), test ${split.testRange.join(' → ')} (${split.testRows} rows).`,
      `- Model: ridge regression on standardized features, lambda=${lambda} chosen on an inner time split of the training set.`,
      `- Acceptance gate (ridge MAE < per-client-mean MAE): **${gatePassed ? 'PASS' : 'FAIL'}**.`,
      '',
      formatTable(results),
      '',
      '## Largest per-unit effects (hours, final model)',
      '',
      '| feature | effect |',
      '|---|---|',
      ...topWeights,
      '',
      '> Caveat: the data is synthetic (`hours = archetype base + client effect + weekday effect + noise`),',
      '> so these numbers only show that the pipeline recovers the injected rules. They say nothing about',
      '> accuracy on real timesheets. The deployed `model.json` is refit on all rows after evaluation;',
      '> client one-hots are keyed by the client ids of the seeded dataset, so for other users\' clients',
      '> the prediction falls back to department, weekday and description features.',
      ''
    ].join('\n')
  );
  console.log(`Wrote ${path.relative(process.cwd(), MODEL_PATH)} and ${path.relative(process.cwd(), REPORT_PATH)}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { timeSplit, parseCsv, normalizeRow, fit, predictRows };
