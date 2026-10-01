const { getDatabase } = require('../../database/init');
const { createCategorizer } = require('./categorizerFactory');
const { createRateLimiterFromEnv } = require('./rateLimiter');
const { withRetry } = require('./retry');
const { UNCATEGORIZED } = require('./categories');

const DEFAULT_BATCH_SIZE = 25;
const BLANK_DESCRIPTION_MODEL = 'rule:empty-description';

// Normalizes stored dates (ISO strings or epoch-ms integers written by the API) to YYYY-MM-DD.
const ENTRY_DATE_SQL = `(CASE WHEN typeof(date) IN ('integer', 'real')
  THEN date(date / 1000, 'unixepoch') ELSE date(date) END)`;

let jobRunning = false;

function tryAcquireJobLock() {
  if (jobRunning) return false;
  jobRunning = true;
  return true;
}

function releaseJobLock() {
  jobRunning = false;
}

function isJobRunning() {
  return jobRunning;
}

function dbAll(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function dbRun(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve({ changes: this ? this.changes : 0 });
    });
  });
}

function isBlankDescription(description) {
  return description === null || description === undefined || String(description).trim() === '';
}

function normalizeResult(result, allowedCategories) {
  const name = result && typeof result.category === 'string' ? result.category.trim().toLowerCase() : null;
  if (!name || !allowedCategories.includes(name)) {
    return { category: UNCATEGORIZED, confidence: 0, fallback: true };
  }
  const confidence = Number(result.confidence);
  return {
    category: name,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    fallback: false
  };
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function categorizeChunk(descriptions, { categorizer, allowedCategories, rateLimiter, retryOptions }) {
  const raw = await withRetry(async () => {
    if (rateLimiter) await rateLimiter.take();
    return categorizer.categorizeBatch(descriptions, allowedCategories);
  }, retryOptions);
  const results = Array.isArray(raw) ? raw : [];
  return descriptions.map((_, i) => normalizeResult(results[i], allowedCategories));
}

/**
 * Categorizes descriptions in batches. Blank descriptions resolve to `uncategorized`
 * without calling the categorizer. Returns one outcome per description, in order.
 * `onBatch(outcomes)` is awaited after every batch so callers can persist progress.
 */
async function categorizeDescriptions(descriptions, options) {
  const { categorizer, allowedCategories, batchSize = DEFAULT_BATCH_SIZE, onBatch } = options;
  const outcomes = new Array(descriptions.length);
  const pending = [];

  const blank = [];
  descriptions.forEach((description, index) => {
    if (isBlankDescription(description)) {
      outcomes[index] = { index, status: 'done', category: UNCATEGORIZED, confidence: 1, source: 'seed', skipped: true };
      blank.push(outcomes[index]);
    } else {
      pending.push(index);
    }
  });
  if (blank.length && onBatch) await onBatch(blank);

  for (const indexes of chunk(pending, batchSize)) {
    let batchOutcomes;
    try {
      const results = await categorizeChunk(indexes.map(i => descriptions[i]), { ...options, categorizer, allowedCategories });
      batchOutcomes = indexes.map((index, i) => ({
        index,
        status: 'done',
        category: results[i].category,
        confidence: results[i].confidence,
        fallback: results[i].fallback,
        source: 'llm',
        skipped: false
      }));
    } catch (error) {
      console.error(`Categorization batch failed (${indexes.length} entries): ${error.message}`);
      batchOutcomes = indexes.map(index => ({ index, status: 'failed', error: error.message, skipped: false }));
    }
    batchOutcomes.forEach((outcome) => { outcomes[outcome.index] = outcome; });
    if (onBatch) await onBatch(batchOutcomes);
  }

  return outcomes;
}

function buildSelectQuery({ selection, retryFailed, userEmail, date, limit }) {
  const where = ['category_id IS NULL'];
  const params = [];
  if (selection === 'pending') {
    where.push(retryFailed
      ? "categorization_status IN ('pending', 'failed')"
      : "categorization_status = 'pending'");
  }
  if (userEmail) {
    where.push('user_email = ?');
    params.push(userEmail);
  }
  if (date) {
    where.push(`${ENTRY_DATE_SQL} = ?`);
    params.push(date);
  }
  let sql = `SELECT id, user_email, description FROM work_entries WHERE ${where.join(' AND ')} ORDER BY id`;
  if (limit) {
    sql += ' LIMIT ?';
    params.push(limit);
  }
  return { sql, params };
}

async function loadCategoryIds(db) {
  const rows = await dbAll(db, 'SELECT id, name FROM categories', []);
  const ids = new Map(rows.map(row => [row.name, row.id]));
  if (!ids.has(UNCATEGORIZED)) {
    throw new Error(`Category "${UNCATEGORIZED}" is missing; run database initialization first`);
  }
  return ids;
}

async function persistOutcomes(db, entries, outcomes, { categoryIds, categorizer }) {
  for (const outcome of outcomes) {
    const entry = entries[outcome.index];
    if (outcome.status === 'done') {
      const isRule = outcome.source === 'seed';
      await dbRun(db, `
        UPDATE work_entries
        SET category_id = ?, categorization_status = 'done', categorization_source = ?,
            categorized_at = CURRENT_TIMESTAMP, categorization_model = ?, prompt_version = ?
        WHERE id = ? AND user_email = ? AND category_id IS NULL`,
      [
        categoryIds.get(outcome.category),
        outcome.source,
        isRule ? BLANK_DESCRIPTION_MODEL : categorizer.model,
        isRule ? null : categorizer.promptVersion,
        entry.id,
        entry.user_email
      ]);
    } else {
      await dbRun(db, `
        UPDATE work_entries
        SET categorization_status = 'failed', categorization_model = ?, prompt_version = ?
        WHERE id = ? AND user_email = ? AND category_id IS NULL`,
      [categorizer.model, categorizer.promptVersion, entry.id, entry.user_email]);
    }
  }
}

/**
 * Categorizes uncategorized work entries and persists results batch by batch,
 * so an interrupted run resumes from the remaining entries on the next call.
 *
 * selection: 'pending' (runtime/scheduler: categorization_status='pending')
 *          | 'uncategorized' (backfill: every row with category_id IS NULL)
 */
async function runCategorization(options = {}) {
  const {
    db = getDatabase(),
    categorizer = createCategorizer(),
    selection = 'pending',
    retryFailed = false,
    userEmail,
    date,
    limit,
    dryRun = false,
    batchSize = Number(process.env.LLM_BATCH_SIZE) || DEFAULT_BATCH_SIZE,
    rateLimiter = createRateLimiterFromEnv(),
    retryOptions
  } = options;

  const categoryIds = await loadCategoryIds(db);
  const allowedCategories = [...categoryIds.keys()];
  const { sql, params } = buildSelectQuery({ selection, retryFailed, userEmail, date, limit });
  const entries = await dbAll(db, sql, params);

  const outcomes = await categorizeDescriptions(entries.map(e => e.description), {
    categorizer,
    allowedCategories,
    batchSize,
    rateLimiter,
    retryOptions,
    onBatch: dryRun ? null : batch => persistOutcomes(db, entries, batch, { categoryIds, categorizer })
  });

  const summary = {
    processed: entries.length,
    categorized: 0,
    failed: 0,
    skipped: 0,
    fallbacks: 0,
    dryRun,
    provider: categorizer.provider,
    model: categorizer.model,
    byCategory: {}
  };
  for (const outcome of outcomes) {
    if (outcome.status === 'failed') {
      summary.failed += 1;
      continue;
    }
    if (outcome.skipped) summary.skipped += 1;
    else summary.categorized += 1;
    if (outcome.fallback) summary.fallbacks += 1;
    summary.byCategory[outcome.category] = (summary.byCategory[outcome.category] || 0) + 1;
  }
  return summary;
}

module.exports = {
  runCategorization,
  categorizeDescriptions,
  normalizeResult,
  isBlankDescription,
  tryAcquireJobLock,
  releaseJobLock,
  isJobRunning,
  dbAll,
  dbRun,
  DEFAULT_BATCH_SIZE
};
