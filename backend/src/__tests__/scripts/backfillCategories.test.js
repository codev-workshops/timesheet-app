jest.unmock('sqlite3');

const { runBackfill, parseArgs, validateBackfill } = require('../../scripts/backfillCategories');
const { MockCategorizer } = require('../../services/categorization/mockCategorizer');
const { LLMHttpError } = require('../../services/categorization/errors');
const { closeDatabase } = require('../../database/init');
const { seedTestData } = require('../../scripts/seedTestData');
const { setupDatabase, resetData, insertEntries, getEntries, silenceConsole } = require('../helpers/realDatabase');

describe('backfillCategories', () => {
  let db;
  let restoreConsole;

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
  });

  test('dry run reports counts per category without writing', async () => {
    await seedTestData({ db });

    const report = await runBackfill({ db, categorizer: new MockCategorizer(), dryRun: true });

    expect(report.summary).toMatchObject({ dryRun: true, processed: 100, failed: 0, skipped: 4 });
    const total = Object.values(report.validation.byCategory).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
    expect(report.validation.unresolved).toBe(0);
    const rows = await getEntries(db);
    expect(rows.every(r => r.category_id === null && r.categorization_status === 'pending')).toBe(true);
  });

  test('backfills all uncategorized rows, including ones not in pending status', async () => {
    const ids = await insertEntries(db, ['Daily standup', '', 'Wrote README']);
    await db.run("UPDATE work_entries SET categorization_status = 'failed' WHERE id = ?", [ids[2]]);

    const report = await runBackfill({ db, categorizer: new MockCategorizer() });

    expect(report.summary).toMatchObject({ processed: 3, categorized: 2, skipped: 1 });
    expect(report.validation).toEqual({
      byCategory: { documentation: 1, meetings: 1, uncategorized: 1 },
      unresolved: 0,
      unresolvedIds: []
    });
    const rows = await getEntries(db);
    expect(rows.map(r => r.categorization_source)).toEqual(['llm', 'seed', 'llm']);

    const rerun = await runBackfill({ db, categorizer: new MockCategorizer() });
    expect(rerun.summary.processed).toBe(0);
  });

  test('validation reports unresolved entries', async () => {
    const ids = await insertEntries(db, ['Daily standup', 'Fixed bug']);
    const failing = {
      provider: 'fake', model: 'fake', promptVersion: 'v1',
      categorizeBatch: jest.fn().mockRejectedValue(new LLMHttpError('bad', { status: 400 }))
    };

    const report = await runBackfill({ db, categorizer: failing });

    expect(report.validation.unresolved).toBe(2);
    expect(report.validation.unresolvedIds).toEqual(ids);
  });

  test('validateBackfill scopes by user', async () => {
    await insertEntries(db, ['Daily standup'], { userEmail: 'a@example.com' });
    await insertEntries(db, ['Daily standup'], { userEmail: 'b@example.com' });
    await runBackfill({ db, categorizer: new MockCategorizer(), userEmail: 'a@example.com' });

    expect(await validateBackfill(db, { userEmail: 'a@example.com' })).toMatchObject({ unresolved: 0, byCategory: { meetings: 1 } });
    expect(await validateBackfill(db, { userEmail: 'b@example.com' })).toMatchObject({ unresolved: 1, byCategory: {} });
  });

  test('parseArgs', () => {
    expect(parseArgs(['--dry-run', '--user-email=a@example.com', '--batch-size=10', '--limit=5']))
      .toEqual({ dryRun: true, userEmail: 'a@example.com', batchSize: 10, limit: 5 });
    expect(() => parseArgs(['--bogus'])).toThrow('Unknown argument');
  });
});
