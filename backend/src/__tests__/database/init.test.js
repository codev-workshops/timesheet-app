const { db, initializeDatabase, closeDatabase } = require('../../database/db');
const { tableNames, indexNames } = require('../helpers/db');

const TABLES = ['users', 'clients', 'work_entries', 'categories'];
const INDEXES_001 = [
  'idx_clients_user_email',
  'idx_work_entries_client_id',
  'idx_work_entries_user_email',
  'idx_work_entries_date'
];
const INDEXES = [...INDEXES_001, 'idx_work_entries_category_id'];

async function columns(table) {
  return db.raw(`PRAGMA table_info(${table})`);
}

async function foreignKeys(table) {
  return db.raw(`PRAGMA foreign_key_list(${table})`);
}

describe('Database initialization (Knex migrations)', () => {
  beforeAll(async () => {
    await db.migrate.rollback(undefined, true);
  });

  test('exposes exactly db, initializeDatabase and closeDatabase', () => {
    const mod = require('../../database/db');
    expect(Object.keys(mod).sort()).toEqual(['closeDatabase', 'db', 'initializeDatabase']);
    expect(typeof db).toBe('function');
  });

  test('starts with no application tables', async () => {
    const names = await tableNames();
    TABLES.forEach((t) => expect(names).not.toContain(t));
  });

  test('initializeDatabase() creates users, clients, work_entries and categories', async () => {
    await initializeDatabase();
    const names = await tableNames();
    expect(names).toEqual(expect.arrayContaining(TABLES));
  });

  test('initializeDatabase() creates the named indexes (001 + 002)', async () => {
    expect(await indexNames()).toEqual(expect.arrayContaining(INDEXES));
  });

  test('initializeDatabase() is idempotent and keeps existing data', async () => {
    await db('users').insert({ email: 'keep@example.com' });
    await expect(initializeDatabase()).resolves.toBeUndefined();
    await expect(initializeDatabase()).resolves.toBeUndefined();

    const users = await db('users').select('email');
    expect(users).toEqual([{ email: 'keep@example.com' }]);
    const indexes = (await indexNames()).filter((n) => INDEXES.includes(n));
    expect(indexes).toHaveLength(INDEXES.length);
    await db('users').del();
  });

  describe('schema', () => {
    test('users has email primary key and created_at default', async () => {
      const cols = await columns('users');
      const email = cols.find((c) => c.name === 'email');
      expect(email.pk).toBe(1);
      expect(cols.find((c) => c.name === 'created_at').dflt_value).toMatch(/CURRENT_TIMESTAMP/i);
    });

    test('clients has expected columns, NOT NULL constraints and FK to users', async () => {
      const cols = await columns('clients');
      expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining([
        'id', 'name', 'description', 'department', 'email', 'user_email', 'created_at', 'updated_at'
      ]));
      expect(cols.find((c) => c.name === 'id').pk).toBe(1);
      expect(cols.find((c) => c.name === 'name').notnull).toBe(1);
      expect(cols.find((c) => c.name === 'user_email').notnull).toBe(1);

      const fks = await foreignKeys('clients');
      expect(fks).toEqual(expect.arrayContaining([
        expect.objectContaining({ table: 'users', from: 'user_email', to: 'email', on_delete: 'CASCADE' })
      ]));
    });

    test('work_entries has expected columns and FKs to clients and users', async () => {
      const cols = await columns('work_entries');
      expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining([
        'id', 'client_id', 'user_email', 'hours', 'description', 'date', 'created_at', 'updated_at'
      ]));
      ['client_id', 'user_email', 'hours', 'date'].forEach((name) => {
        expect(cols.find((c) => c.name === name).notnull).toBe(1);
      });

      const fks = await foreignKeys('work_entries');
      expect(fks).toEqual(expect.arrayContaining([
        expect.objectContaining({ table: 'clients', from: 'client_id', to: 'id', on_delete: 'CASCADE' }),
        expect.objectContaining({ table: 'users', from: 'user_email', to: 'email', on_delete: 'CASCADE' })
      ]));
    });

    test('ids autoincrement and timestamps default on insert', async () => {
      await db('users').insert({ email: 'schema@example.com' });
      const [id] = await db('clients').insert({ name: 'A', user_email: 'schema@example.com' });
      const client = await db('clients').where({ id }).first();
      expect(id).toBeGreaterThan(0);
      expect(client.created_at).toBeTruthy();
      expect(client.updated_at).toBeTruthy();
      await db('clients').del();
      await db('users').del();
    });

    test('categories has expected columns, defaults and case-insensitive unique name', async () => {
      const cols = await columns('categories');
      expect(cols.map((c) => c.name)).toEqual([
        'id', 'name', 'description', 'active', 'created_at', 'updated_at'
      ]);
      expect(cols.find((c) => c.name === 'id').pk).toBe(1);
      expect(cols.find((c) => c.name === 'name').notnull).toBe(1);
      const active = cols.find((c) => c.name === 'active');
      expect(active.notnull).toBe(1);
      expect(active.dflt_value).toBe('1');
      expect(cols.find((c) => c.name === 'created_at').dflt_value).toMatch(/CURRENT_TIMESTAMP/i);
      expect(cols.find((c) => c.name === 'updated_at').dflt_value).toMatch(/CURRENT_TIMESTAMP/i);

      const [id] = await db('categories').insert({ name: 'Dev' });
      const row = await db('categories').where({ id }).first();
      expect(row).toMatchObject({ name: 'Dev', description: null, active: 1 });
      expect(row.created_at).toBeTruthy();
      await expect(db('categories').insert({ name: 'dev' })).rejects.toThrow(/UNIQUE/);
      await db('categories').del();
    });

    test('work_entries.category_id is nullable, indexed, FK to categories ON DELETE SET NULL', async () => {
      const col = (await columns('work_entries')).find((c) => c.name === 'category_id');
      expect(col).toMatchObject({ type: 'INTEGER', notnull: 0, dflt_value: null });

      const fks = await foreignKeys('work_entries');
      expect(fks).toEqual(expect.arrayContaining([
        expect.objectContaining({ table: 'categories', from: 'category_id', to: 'id', on_delete: 'SET NULL' })
      ]));

      const indexed = await db.raw('PRAGMA index_info(idx_work_entries_category_id)');
      expect(indexed.map((i) => i.name)).toEqual(['category_id']);
    });

    test('foreign key enforcement stays disabled (matches main)', async () => {
      const [{ foreign_keys: enabled }] = await db.raw('PRAGMA foreign_keys');
      expect(enabled).toBe(0);
    });
  });

  describe('002_add_categories down()', () => {
    afterAll(async () => {
      await db.migrate.latest();
    });

    test('reverts only 002, keeps 001 schema, indexes and data', async () => {
      await db('users').insert({ email: 'down@example.com' });
      const [clientId] = await db('clients').insert({ name: 'C', user_email: 'down@example.com' });
      const [categoryId] = await db('categories').insert({ name: 'Dev' });
      const [entryId] = await db('work_entries').insert({
        client_id: clientId, user_email: 'down@example.com', hours: 2.5, date: '2024-01-15',
        description: 'kept', category_id: categoryId
      });

      const [, reverted] = await db.migrate.down();
      expect(reverted).toEqual(['002_add_categories.js']);

      const names = await tableNames();
      expect(names).not.toContain('categories');
      expect(names).not.toContain('work_entries_002_down');
      expect(names).toEqual(expect.arrayContaining(['users', 'clients', 'work_entries']));

      const indexes = await indexNames();
      expect(indexes).toEqual(expect.arrayContaining(INDEXES_001));
      expect(indexes).not.toContain('idx_work_entries_category_id');

      const cols = (await columns('work_entries')).map((c) => c.name);
      expect(cols).toEqual([
        'id', 'client_id', 'user_email', 'hours', 'description', 'date', 'created_at', 'updated_at'
      ]);
      const fks = await foreignKeys('work_entries');
      expect(fks.map((f) => f.table).sort()).toEqual(['clients', 'users']);

      const entry = await db('work_entries').where({ id: entryId }).first();
      expect(entry).toMatchObject({ client_id: clientId, hours: 2.5, description: 'kept', date: '2024-01-15' });
      expect(entry).not.toHaveProperty('category_id');

      await db('work_entries').del();
      await db('clients').del();
      await db('users').del();
    });

    test('002 can be re-applied after down()', async () => {
      await db.migrate.up();
      expect(await tableNames()).toContain('categories');
      expect(await indexNames()).toEqual(expect.arrayContaining(INDEXES));
    });
  });

  test('migrate.rollback drops all application tables', async () => {
    await db.migrate.rollback(undefined, true);
    const names = await tableNames();
    TABLES.forEach((t) => expect(names).not.toContain(t));
    INDEXES.forEach((i) => expect(names).not.toContain(i));
  });

  test('closeDatabase() destroys the Knex instance', async () => {
    await initializeDatabase();
    await expect(closeDatabase()).resolves.toBeUndefined();
    await expect(db.raw('SELECT 1')).rejects.toThrow();

    // Re-open so the global afterAll teardown has a live pool; :memory: data is gone.
    db.initialize();
    expect(await tableNames()).not.toContain('users');
  });
});
