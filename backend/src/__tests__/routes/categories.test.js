const request = require('supertest');
const { createApp, USER, OTHER_USER } = require('../helpers/app');
const { db, resetDatabase, insertUsers, insertCategory, breakTable, failOn } = require('../helpers/db');

const app = createApp();
const ADMIN = 'admin@example.com';
const CATEGORY_KEYS = ['active', 'created_at', 'description', 'id', 'name', 'updated_at'];
const ORIGINAL_ADMIN_EMAILS = process.env.ADMIN_EMAILS;

const as = (req, email) => req.set('x-user-email', email);

describe('Category Routes', () => {
  beforeEach(async () => {
    process.env.ADMIN_EMAILS = `${ADMIN}, lead@example.com`;
    await resetDatabase();
    await insertUsers(USER, OTHER_USER, ADMIN);
  });

  afterAll(() => {
    if (ORIGINAL_ADMIN_EMAILS === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = ORIGINAL_ADMIN_EMAILS;
  });

  describe('authentication and authorization', () => {
    test.each([
      ['get', '/api/categories'],
      ['post', '/api/categories'],
      ['put', '/api/categories/1'],
      ['delete', '/api/categories/1']
    ])('%s %s returns 401 without x-user-email', async (method, url) => {
      const res = await request(app)[method](url).send({ name: 'X' });
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'User email required in x-user-email header' });
    });

    test('POST returns 403 for a non-admin and creates nothing', async () => {
      const res = await as(request(app).post('/api/categories'), USER).send({ name: 'Dev' });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Admin access required' });
      expect(await db('categories')).toHaveLength(0);
    });

    test('PUT returns 403 for a non-admin and leaves the row untouched', async () => {
      const cat = await insertCategory({ name: 'Dev' });
      const res = await as(request(app).put(`/api/categories/${cat.id}`), USER).send({ name: 'Hacked' });
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'Admin access required' });
      expect((await db('categories').where({ id: cat.id }).first()).name).toBe('Dev');
    });

    test('DELETE returns 403 for a non-admin and keeps the category active', async () => {
      const cat = await insertCategory({ name: 'Dev' });
      const res = await as(request(app).delete(`/api/categories/${cat.id}`), USER);
      expect(res.status).toBe(403);
      expect((await db('categories').where({ id: cat.id }).first()).active).toBe(1);
    });

    test('admin check is case-insensitive', async () => {
      const res = await as(request(app).post('/api/categories'), 'ADMIN@example.com').send({ name: 'Dev' });
      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/categories', () => {
    beforeEach(async () => {
      await insertCategory({ name: 'Meetings' });
      await insertCategory({ name: 'Archived', active: 0 });
      await insertCategory({ name: 'development', description: 'Code' });
    });

    test('any user gets active categories ordered by name (global, not user-scoped)', async () => {
      for (const email of [USER, OTHER_USER]) {
        const res = await as(request(app).get('/api/categories'), email);
        expect(res.status).toBe(200);
        expect(res.body.categories.map((c) => c.name)).toEqual(['development', 'Meetings']);
        expect(Object.keys(res.body.categories[0]).sort()).toEqual(CATEGORY_KEYS);
        expect(res.body.categories[0]).toMatchObject({ description: 'Code', active: true });
      }
    });

    test('admins can include inactive categories', async () => {
      const res = await as(request(app).get('/api/categories?includeInactive=true'), ADMIN);
      expect(res.status).toBe(200);
      expect(res.body.categories.map((c) => [c.name, c.active])).toEqual([
        ['Archived', false], ['development', true], ['Meetings', true]
      ]);
    });

    test('includeInactive is ignored for non-admins', async () => {
      const res = await as(request(app).get('/api/categories?includeInactive=true'), USER);
      expect(res.body.categories.map((c) => c.name)).toEqual(['development', 'Meetings']);
    });

    test('includeInactive must be exactly "true"', async () => {
      const res = await as(request(app).get('/api/categories?includeInactive=1'), ADMIN);
      expect(res.body.categories).toHaveLength(2);
    });

    test('returns 500 on database error', async () => {
      await breakTable('categories');
      const res = await as(request(app).get('/api/categories'), USER);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('POST /api/categories', () => {
    test('creates a category (201)', async () => {
      const res = await as(request(app).post('/api/categories'), ADMIN)
        .send({ name: '  Development ', description: 'Writing code' });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Category created successfully');
      expect(Object.keys(res.body.category).sort()).toEqual(CATEGORY_KEYS);
      expect(res.body.category).toMatchObject({ name: 'Development', description: 'Writing code', active: true });
      const row = await db('categories').where({ id: res.body.category.id }).first();
      expect(row).toMatchObject({ name: 'Development', description: 'Writing code', active: 1 });
    });

    test('stores empty description as null and honours active=false', async () => {
      const res = await as(request(app).post('/api/categories'), ADMIN)
        .send({ name: 'Draft', description: '', active: false });
      expect(res.status).toBe(201);
      expect(res.body.category).toMatchObject({ description: null, active: false });
    });

    test('returns 409 for a duplicate name (case-insensitive)', async () => {
      await insertCategory({ name: 'Development' });
      const res = await as(request(app).post('/api/categories'), ADMIN).send({ name: 'DEVELOPMENT' });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'Category name already exists' });
      expect(await db('categories')).toHaveLength(1);
    });

    test('returns 409 even when the existing category is inactive', async () => {
      await insertCategory({ name: 'Old', active: 0 });
      const res = await as(request(app).post('/api/categories'), ADMIN).send({ name: 'old' });
      expect(res.status).toBe(409);
    });

    test.each([
      ['missing name', {}],
      ['empty name', { name: '' }],
      ['name too long', { name: 'a'.repeat(256) }],
      ['unknown field', { name: 'X', color: 'red' }],
      ['non-boolean active', { name: 'X', active: 'maybe' }]
    ])('returns 400 Validation error for %s', async (_label, body) => {
      const res = await as(request(app).post('/api/categories'), ADMIN).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(Array.isArray(res.body.details)).toBe(true);
      expect(await db('categories')).toHaveLength(0);
    });

    test('returns 500 when the insert fails', async () => {
      await failOn('categories', 'INSERT');
      const res = await as(request(app).post('/api/categories'), ADMIN).send({ name: 'Dev' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      expect(console.error).toHaveBeenCalled();
    });

    test('returns 500 when the table is unavailable', async () => {
      await breakTable('categories');
      const res = await as(request(app).post('/api/categories'), ADMIN).send({ name: 'Dev' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    test('maps a UNIQUE constraint race to 409', async () => {
      // A second row that only differs by case is rejected by the NOCASE unique index even if
      // the pre-check is bypassed; simulate the race with a trigger that inserts the twin first.
      await db.raw(
        "CREATE TRIGGER race BEFORE INSERT ON categories WHEN NEW.name = 'Race' " +
        "BEGIN INSERT INTO categories (name) VALUES ('race'); END"
      );
      const res = await as(request(app).post('/api/categories'), ADMIN).send({ name: 'Race' });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'Category name already exists' });
    });
  });

  describe('PUT /api/categories/:id', () => {
    let cat;

    beforeEach(async () => {
      cat = await insertCategory({ name: 'Dev', description: 'Code', updated_at: '2000-01-01 00:00:00' });
    });

    test('updates name/description and bumps updated_at', async () => {
      const res = await as(request(app).put(`/api/categories/${cat.id}`), ADMIN)
        .send({ name: 'Engineering', description: '' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Category updated successfully');
      expect(res.body.category).toMatchObject({ id: cat.id, name: 'Engineering', description: null, active: true });
      const row = await db('categories').where({ id: cat.id }).first();
      expect(row.updated_at).not.toBe('2000-01-01 00:00:00');
    });

    test('deactivates and reactivates via active', async () => {
      let res = await as(request(app).put(`/api/categories/${cat.id}`), ADMIN).send({ active: false });
      expect(res.body.category.active).toBe(false);
      expect((await db('categories').where({ id: cat.id }).first()).active).toBe(0);

      res = await as(request(app).put(`/api/categories/${cat.id}`), ADMIN).send({ active: true });
      expect(res.status).toBe(200);
      expect(res.body.category.active).toBe(true);
    });

    test('allows renaming to a different case of its own name', async () => {
      const res = await as(request(app).put(`/api/categories/${cat.id}`), ADMIN).send({ name: 'DEV' });
      expect(res.status).toBe(200);
      expect(res.body.category.name).toBe('DEV');
    });

    test('returns 409 when the new name belongs to another category', async () => {
      await insertCategory({ name: 'Meetings' });
      const res = await as(request(app).put(`/api/categories/${cat.id}`), ADMIN).send({ name: 'meetings' });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'Category name already exists' });
      expect((await db('categories').where({ id: cat.id }).first()).name).toBe('Dev');
    });

    test('returns 404 when the category does not exist', async () => {
      const res = await as(request(app).put('/api/categories/999'), ADMIN).send({ name: 'X' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Category not found' });
    });

    test('returns 400 for an invalid id', async () => {
      const res = await as(request(app).put('/api/categories/abc'), ADMIN).send({ name: 'X' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid category ID' });
    });

    test.each([
      ['empty body', {}],
      ['empty name', { name: '' }],
      ['unknown field', { color: 'red' }]
    ])('returns 400 Validation error for %s', async (_label, body) => {
      const res = await as(request(app).put(`/api/categories/${cat.id}`), ADMIN).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(res.body.details).toBeDefined();
    });

    test('returns 500 when the update fails', async () => {
      await failOn('categories', 'UPDATE');
      const res = await as(request(app).put(`/api/categories/${cat.id}`), ADMIN).send({ name: 'X' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      expect((await db('categories').where({ id: cat.id }).first()).name).toBe('Dev');
    });

    test('returns 500 when the table is unavailable', async () => {
      await breakTable('categories');
      const res = await as(request(app).put(`/api/categories/${cat.id}`), ADMIN).send({ name: 'X' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    test('maps a UNIQUE constraint race to 409', async () => {
      await db.raw(
        "CREATE TRIGGER race BEFORE UPDATE ON categories WHEN NEW.name = 'Race' " +
        "BEGIN INSERT INTO categories (name) VALUES ('race'); END"
      );
      const res = await as(request(app).put(`/api/categories/${cat.id}`), ADMIN).send({ name: 'Race' });
      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /api/categories/:id', () => {
    test('soft-deletes (active=0) and hides it from the default list', async () => {
      const cat = await insertCategory({ name: 'Dev' });

      const res = await as(request(app).delete(`/api/categories/${cat.id}`), ADMIN);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Category deleted successfully' });
      const row = await db('categories').where({ id: cat.id }).first();
      expect(row).toBeDefined();
      expect(row.active).toBe(0);
      const list = await as(request(app).get('/api/categories'), USER);
      expect(list.body.categories).toEqual([]);
    });

    test('returns 404 when the category does not exist', async () => {
      const res = await as(request(app).delete('/api/categories/999'), ADMIN);
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Category not found' });
    });

    test('returns 400 for an invalid id', async () => {
      const res = await as(request(app).delete('/api/categories/abc'), ADMIN);
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid category ID' });
    });

    test('returns 500 when the update fails', async () => {
      const cat = await insertCategory({ name: 'Dev' });
      await failOn('categories', 'UPDATE');
      const res = await as(request(app).delete(`/api/categories/${cat.id}`), ADMIN);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      expect((await db('categories').where({ id: cat.id }).first()).active).toBe(1);
    });

    test('returns 500 when the table is unavailable', async () => {
      await breakTable('categories');
      const res = await as(request(app).delete('/api/categories/1'), ADMIN);
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });
  });
});
