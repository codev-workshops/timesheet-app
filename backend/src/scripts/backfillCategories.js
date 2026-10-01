#!/usr/bin/env node
/**
 * One-off migration: categorize every historical work entry with category_id IS NULL.
 *
 *   DB_FILE=./data/timesheet.db LLM_PROVIDER=mock node src/scripts/backfillCategories.js --dry-run
 *
 * Options: --dry-run, --user-email=<email>, --batch-size=<n>, --limit=<n>
 * Exits with code 1 when entries remain unresolved so it can gate a rollout.
 */
const { getDatabase, initializeDatabase, closeDatabase, resolveDatabaseFile } = require('../database/init');
const { createCategorizer } = require('../services/categorization/categorizerFactory');
const { runCategorization, dbAll } = require('../services/categorization/categorizationService');

function parseArgs(argv) {
  const args = { dryRun: false };
  for (const arg of argv) {
    const [key, rawValue] = arg.split('=');
    switch (key) {
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--user-email':
        args.userEmail = rawValue;
        break;
      case '--batch-size':
        args.batchSize = Number(rawValue);
        break;
      case '--limit':
        args.limit = Number(rawValue);
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

async function validateBackfill(db, { userEmail } = {}) {
  const scope = userEmail ? 'WHERE we.user_email = ?' : '';
  const params = userEmail ? [userEmail] : [];
  const rows = await dbAll(db, `
    SELECT cat.name AS category, COUNT(*) AS count
    FROM work_entries we
    LEFT JOIN categories cat ON we.category_id = cat.id
    ${scope}
    GROUP BY cat.name
    ORDER BY cat.name`, params);
  const unresolvedRows = await dbAll(db, `
    SELECT we.id FROM work_entries we
    ${scope ? `${scope} AND` : 'WHERE'} we.category_id IS NULL
    ORDER BY we.id LIMIT 50`, params);

  const byCategory = {};
  let unresolved = 0;
  for (const row of rows) {
    if (row.category === null) unresolved = row.count;
    else byCategory[row.category] = row.count;
  }
  return { byCategory, unresolved, unresolvedIds: unresolvedRows.map(r => r.id) };
}

async function runBackfill(options = {}) {
  const db = options.db || getDatabase();
  const summary = await runCategorization({
    ...options,
    db,
    categorizer: options.categorizer || createCategorizer(),
    selection: 'uncategorized'
  });

  // Dry runs write nothing, so validation reports the projected outcome of this run.
  const validation = summary.dryRun
    ? { byCategory: summary.byCategory, unresolved: summary.failed, unresolvedIds: [] }
    : await validateBackfill(db, { userEmail: options.userEmail });

  return { summary, validation };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node src/scripts/backfillCategories.js [--dry-run] [--user-email=<email>] [--batch-size=<n>] [--limit=<n>]');
    return;
  }
  if (resolveDatabaseFile() === ':memory:') {
    console.warn('DB_FILE is not set: backfilling an empty in-memory database');
  }

  await initializeDatabase();
  try {
    const report = await runBackfill(args);
    console.log(JSON.stringify(report, null, 2));
    if (report.validation.unresolved > 0) {
      console.error(`${report.validation.unresolved} work entries remain unresolved`);
      process.exitCode = 1;
    }
  } finally {
    await closeDatabase();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  runBackfill,
  validateBackfill
};
