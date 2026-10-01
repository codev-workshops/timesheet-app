jest.unmock('sqlite3');

const { setupDatabase, resetData, insertEntries, getEntries, silenceConsole } = require('../../helpers/realDatabase');
const { runCategorization, isBlankDescription, normalizeResult } = require('../../../services/categorization/categorizationService');
const { MockCategorizer } = require('../../../services/categorization/mockCategorizer');
const { LLMHttpError } = require('../../../services/categorization/errors');
const { closeDatabase } = require('../../../database/init');
const { seedTestData } = require('../../../scripts/seedTestData');

const noRetry = { retries: 0 };

describe('categorizationService (real SQLite)', () => {
  let db;
  let restoreConsole;
  let categorizer;

  beforeAll(async () => {
    restoreConsole = silenceConsole();
    db = await setupDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
    restoreConsole();
  });

  beforeEach(async () => {
    await resetData(db);
    categorizer = new MockCategorizer();
    jest.spyOn(categorizer, 'categorizeBatch');
  });

  test('empty/NULL/whitespace descriptions become uncategorized without calling the LLM', async () => {
    await insertEntries(db, [null, '', '   ', '\t\n']);

    const summary = await runCategorization({ db, categorizer });

    expect(categorizer.categorizeBatch).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ processed: 4, categorized: 0, skipped: 4, failed: 0 });
    const rows = await getEntries(db);
    expect(rows.every(r => r.category === 'uncategorized')).toBe(true);
    expect(rows.every(r => r.categorization_source === 'seed' && r.categorization_status === 'done')).toBe(true);
    expect(rows[0].categorization_model).toBe('rule:empty-description');
  });

  test('only non-blank descriptions are sent to the provider', async () => {
    await insertEntries(db, ['Daily standup', '', 'Fixed login bug', null]);

    await runCategorization({ db, categorizer });

    expect(categorizer.categorizeBatch).toHaveBeenCalledTimes(1);
    expect(categorizer.categorizeBatch.mock.calls[0][0]).toEqual(['Daily standup', 'Fixed login bug']);
  });

  test('mock provider categorizes keyword descriptions and records provenance', async () => {
    await insertEntries(db, ['Daily standup', 'Fixed login bug', 'Figma mockups', 'worked on stuff']);

    const summary = await runCategorization({ db, categorizer });

    expect(summary).toMatchObject({ processed: 4, categorized: 4, skipped: 0, failed: 0 });
    expect(summary.byCategory).toEqual({ meetings: 1, development: 1, design: 1, uncategorized: 1 });
    const rows = await getEntries(db);
    expect(rows.map(r => r.category)).toEqual(['meetings', 'development', 'design', 'uncategorized']);
    expect(rows[0]).toMatchObject({
      categorization_status: 'done',
      categorization_source: 'llm',
      categorization_model: 'mock-keyword-v1',
      prompt_version: 'mock-v1'
    });
    expect(rows[0].categorized_at).toBeTruthy();
  });

  test('categorizes the synthetic seed dataset', async () => {
    await seedTestData({ db });

    const summary = await runCategorization({ db, categorizer });

    expect(summary.processed).toBe(100);
    expect(summary.failed).toBe(0);
    expect(summary.skipped).toBe(4);
    const rows = await getEntries(db);
    expect(rows.every(r => r.category_id !== null)).toBe(true);
    for (const category of ['development', 'meetings', 'design', 'testing', 'documentation', 'research', 'support', 'admin', 'uncategorized']) {
      expect(summary.byCategory[category]).toBeGreaterThan(0);
    }
  });

  test('sends descriptions in batches of the configured size', async () => {
    await insertEntries(db, Array.from({ length: 60 }, (_, i) => `Fixed bug ${i}`));

    await runCategorization({ db, categorizer, batchSize: 25 });

    expect(categorizer.categorizeBatch.mock.calls.map(call => call[0].length)).toEqual([25, 25, 10]);
  });

  test('is idempotent: a second run processes 0 entries', async () => {
    await insertEntries(db, ['Daily standup', '', 'Wrote unit tests']);

    const first = await runCategorization({ db, categorizer });
    const second = await runCategorization({ db, categorizer });

    expect(first.processed).toBe(3);
    expect(second).toMatchObject({ processed: 0, categorized: 0, failed: 0, skipped: 0 });
  });

  test('unknown category from the LLM falls back to uncategorized', async () => {
    await insertEntries(db, ['Daily standup']);
    const rogue = {
      provider: 'fake', model: 'fake-1', promptVersion: 'v1',
      categorizeBatch: jest.fn().mockResolvedValue([{ category: 'hacked', confidence: 0.99 }])
    };

    const summary = await runCategorization({ db, categorizer: rogue });

    expect(summary).toMatchObject({ categorized: 1, fallbacks: 1, byCategory: { uncategorized: 1 } });
    const [row] = await getEntries(db);
    expect(row.category).toBe('uncategorized');
  });

  test('failed batches are marked failed and retried only with retryFailed', async () => {
    await insertEntries(db, ['Daily standup', 'Fixed bug']);
    const failing = {
      provider: 'fake', model: 'fake-1', promptVersion: 'v1',
      categorizeBatch: jest.fn().mockRejectedValue(new LLMHttpError('unauthorized', { status: 401 }))
    };

    const summary = await runCategorization({ db, categorizer: failing, retryOptions: noRetry });
    expect(summary).toMatchObject({ processed: 2, failed: 2, categorized: 0 });
    expect((await getEntries(db)).map(r => r.categorization_status)).toEqual(['failed', 'failed']);

    expect((await runCategorization({ db, categorizer })).processed).toBe(0);
    const retried = await runCategorization({ db, categorizer, retryFailed: true });
    expect(retried).toMatchObject({ processed: 2, categorized: 2 });
  });

  test('persists completed batches even when a later batch fails', async () => {
    await insertEntries(db, ['Fixed bug 1', 'Fixed bug 2', 'Fixed bug 3']);
    const flaky = {
      provider: 'fake', model: 'fake-1', promptVersion: 'v1',
      categorizeBatch: jest.fn()
        .mockResolvedValueOnce([{ category: 'development', confidence: 1 }, { category: 'development', confidence: 1 }])
        .mockRejectedValueOnce(new LLMHttpError('boom', { status: 400 }))
    };

    const summary = await runCategorization({ db, categorizer: flaky, batchSize: 2, retryOptions: noRetry });

    expect(summary).toMatchObject({ categorized: 2, failed: 1 });
    expect((await getEntries(db)).map(r => r.categorization_status)).toEqual(['done', 'done', 'failed']);
  });

  test('dry run reports results without writing', async () => {
    await insertEntries(db, ['Daily standup', '']);

    const summary = await runCategorization({ db, categorizer, dryRun: true });

    expect(summary).toMatchObject({ dryRun: true, processed: 2, categorized: 1, skipped: 1 });
    const rows = await getEntries(db);
    expect(rows.every(r => r.category_id === null && r.categorization_status === 'pending')).toBe(true);
  });

  test('scopes by userEmail and date', async () => {
    await insertEntries(db, ['Daily standup'], { userEmail: 'a@example.com', date: '2024-01-15' });
    await insertEntries(db, ['Daily standup'], { userEmail: 'b@example.com', date: '2024-01-15' });
    await insertEntries(db, ['Daily standup'], { userEmail: 'a@example.com', date: '2024-02-01' });
    // API-created rows store dates as epoch milliseconds.
    await insertEntries(db, ['Daily standup'], { userEmail: 'a@example.com', date: Date.parse('2024-01-15') });

    const summary = await runCategorization({ db, categorizer, userEmail: 'a@example.com', date: '2024-01-15' });

    expect(summary.processed).toBe(2);
    const rows = await getEntries(db);
    expect(rows.map(r => r.categorization_status)).toEqual(['done', 'pending', 'pending', 'done']);
  });

  test('re-categorizes only pending rows; manually categorized rows are untouched', async () => {
    const [id] = await insertEntries(db, ['Daily standup']);
    await db.run(
      "UPDATE work_entries SET category_id = (SELECT id FROM categories WHERE name = 'admin'), categorization_status = 'done', categorization_source = 'manual' WHERE id = ?",
      [id]
    );

    const summary = await runCategorization({ db, categorizer });

    expect(summary.processed).toBe(0);
    const [row] = await getEntries(db);
    expect(row).toMatchObject({ category: 'admin', categorization_source: 'manual' });
  });
});

describe('helpers', () => {
  test('isBlankDescription', () => {
    expect([null, undefined, '', '  ', '\n\t'].every(isBlankDescription)).toBe(true);
    expect(isBlankDescription('x')).toBe(false);
  });

  test('normalizeResult clamps confidence and normalizes case', () => {
    expect(normalizeResult({ category: ' Meetings ', confidence: 7 }, ['meetings', 'uncategorized']))
      .toEqual({ category: 'meetings', confidence: 1, fallback: false });
    expect(normalizeResult(null, ['uncategorized'])).toEqual({ category: 'uncategorized', confidence: 0, fallback: true });
    expect(normalizeResult({ category: 'meetings', confidence: 'abc' }, ['meetings']).confidence).toBe(0);
  });
});
