jest.unmock('sqlite3');
jest.mock('../../services/categorization/categorizerFactory');

const request = require('supertest');
const express = require('express');
const categorizationRoutes = require('../../routes/categorization');
const { createCategorizer } = require('../../services/categorization/categorizerFactory');
const { MockCategorizer } = require('../../services/categorization/mockCategorizer');
const { errorHandler } = require('../../middleware/errorHandler');
const { closeDatabase } = require('../../database/init');
const { setupDatabase, resetData, insertEntries, getEntries, silenceConsole } = require('../helpers/realDatabase');
const { seedTestData } = require('../../scripts/seedTestData');

const KEY = 'test-scheduler-key';

const app = express();
app.use(express.json());
app.use('/api/admin', categorizationRoutes);
app.use(errorHandler);

describe('POST /api/admin/categorize', () => {
  let db;
  let restoreConsole;
  const originalKey = process.env.SCHEDULER_API_KEY;

  beforeAll(async () => {
    restoreConsole = silenceConsole();
    db = await setupDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
    restoreConsole();
    process.env.SCHEDULER_API_KEY = originalKey;
  });

  beforeEach(async () => {
    process.env.SCHEDULER_API_KEY = KEY;
    createCategorizer.mockImplementation(() => new MockCategorizer());
    await resetData(db);
  });

  describe('scheduler key auth', () => {
    test('returns 401 without X-Scheduler-Key', async () => {
      const res = await request(app).post('/api/admin/categorize');
      expect(res.status).toBe(401);
    });

    test('returns 403 with a wrong key', async () => {
      const res = await request(app).post('/api/admin/categorize').set('X-Scheduler-Key', 'nope');
      expect(res.status).toBe(403);
    });

    test('does not accept user auth headers instead of the key', async () => {
      const res = await request(app).post('/api/admin/categorize').set('x-user-email', 'user@example.com');
      expect(res.status).toBe(401);
    });

    test('returns 503 when no key is configured', async () => {
      delete process.env.SCHEDULER_API_KEY;
      const res = await request(app).post('/api/admin/categorize').set('X-Scheduler-Key', KEY);
      expect(res.status).toBe(503);
    });
  });

  test('categorizes seeded entries and returns counts', async () => {
    await seedTestData({ db });

    const res = await request(app).post('/api/admin/categorize').set('X-Scheduler-Key', KEY);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ processed: 100, categorized: 96, skipped: 4, failed: 0, dryRun: false });
    const again = await request(app).post('/api/admin/categorize').set('X-Scheduler-Key', KEY);
    expect(again.body.processed).toBe(0);
  });

  test('supports dryRun, userEmail and date scoping', async () => {
    await insertEntries(db, ['Daily standup'], { userEmail: 'a@example.com', date: '2024-03-01' });
    await insertEntries(db, ['Daily standup'], { userEmail: 'b@example.com', date: '2024-03-01' });

    const dry = await request(app)
      .post('/api/admin/categorize?dryRun=true&userEmail=a@example.com&date=2024-03-01')
      .set('X-Scheduler-Key', KEY);
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({ processed: 1, categorized: 1, dryRun: true, byCategory: { meetings: 1 } });
    expect((await getEntries(db)).every(r => r.category_id === null)).toBe(true);

    const scoped = await request(app).post('/api/admin/categorize?userEmail=b@example.com').set('X-Scheduler-Key', KEY);
    expect(scoped.body.processed).toBe(1);
    expect((await getEntries(db)).map(r => r.categorization_status)).toEqual(['pending', 'done']);
  });

  test('validates query params', async () => {
    const res = await request(app).post('/api/admin/categorize?date=01-03-2024').set('X-Scheduler-Key', KEY);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  test('rejects a concurrent run with 409 and accepts a new run afterwards', async () => {
    await insertEntries(db, ['Daily standup']);
    let release;
    let markStarted;
    const started = new Promise((resolve) => { markStarted = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    createCategorizer.mockImplementation(() => ({
      provider: 'fake',
      model: 'slow',
      promptVersion: 'v1',
      categorizeBatch: async (descriptions, allowed) => {
        markStarted();
        await gate;
        return new MockCategorizer().categorizeBatch(descriptions, allowed);
      }
    }));

    const first = request(app).post('/api/admin/categorize').set('X-Scheduler-Key', KEY).then(r => r);
    await started;

    const second = await request(app).post('/api/admin/categorize').set('X-Scheduler-Key', KEY);
    expect(second.status).toBe(409);

    release();
    const firstRes = await first;
    expect(firstRes.status).toBe(200);
    expect(firstRes.body.categorized).toBe(1);

    createCategorizer.mockImplementation(() => new MockCategorizer());
    const third = await request(app).post('/api/admin/categorize').set('X-Scheduler-Key', KEY);
    expect(third.status).toBe(200);
  });

  test('releases the lock when the job throws', async () => {
    createCategorizer.mockImplementation(() => { throw new Error('LLM_API_KEY is required for the openai provider'); });
    const failed = await request(app).post('/api/admin/categorize').set('X-Scheduler-Key', KEY);
    expect(failed.status).toBe(500);

    createCategorizer.mockImplementation(() => new MockCategorizer());
    const ok = await request(app).post('/api/admin/categorize').set('X-Scheduler-Key', KEY);
    expect(ok.status).toBe(200);
  });
});
