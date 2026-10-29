const request = require('supertest');
const { createApp, USER, OTHER_USER } = require('../helpers/app');
const {
  db, resetDatabase, insertUsers, insertClient, insertWorkEntry, insertCategory, breakTable, failOn
} = require('../helpers/db');

const app = createApp();
const ENTRY_KEYS = [
  'category_id', 'category_name', 'client_id', 'client_name', 'created_at', 'date', 'description', 'hours', 'id',
  'updated_at'
];

const asUser = (req, email = USER) => req.set('x-user-email', email);

describe('Work Entry Routes', () => {
  let clientA;
  let clientB;
  let otherClient;

  beforeEach(async () => {
    await resetDatabase();
    await insertUsers(USER, OTHER_USER);
    clientA = await insertClient(USER, { name: 'Client A' });
    clientB = await insertClient(USER, { name: 'Client B' });
    otherClient = await insertClient(OTHER_USER, { name: 'Other Co' });
  });

  describe('GET /api/work-entries', () => {
    test('returns the user\'s entries with client_name, newest date first', async () => {
      await insertWorkEntry(USER, clientA.id, { hours: 8, date: '2024-01-01', description: 'old' });
      await insertWorkEntry(USER, clientB.id, { hours: 4.5, date: '2024-01-03', description: 'new' });
      await insertWorkEntry(USER, clientA.id, { hours: 2, date: '2024-01-02' });
      await insertWorkEntry(OTHER_USER, otherClient.id, { hours: 9, date: '2024-01-05' });

      const res = await asUser(request(app).get('/api/work-entries'));

      expect(res.status).toBe(200);
      expect(res.body.workEntries).toHaveLength(3);
      expect(res.body.workEntries.map((e) => e.date)).toEqual(['2024-01-03', '2024-01-02', '2024-01-01']);
      expect(Object.keys(res.body.workEntries[0]).sort()).toEqual(ENTRY_KEYS);
      expect(res.body.workEntries[0]).toMatchObject({
        client_id: clientB.id, client_name: 'Client B', hours: 4.5, description: 'new'
      });
    });

    test('orders entries on the same date by created_at DESC', async () => {
      await insertWorkEntry(USER, clientA.id, { date: '2024-01-01', created_at: '2024-01-01 08:00:00', description: 'first' });
      await insertWorkEntry(USER, clientA.id, { date: '2024-01-01', created_at: '2024-01-01 09:00:00', description: 'second' });

      const res = await asUser(request(app).get('/api/work-entries'));

      expect(res.body.workEntries.map((e) => e.description)).toEqual(['second', 'first']);
    });

    test('filters by clientId when provided', async () => {
      await insertWorkEntry(USER, clientA.id);
      await insertWorkEntry(USER, clientB.id);

      const res = await asUser(request(app).get(`/api/work-entries?clientId=${clientA.id}`));

      expect(res.status).toBe(200);
      expect(res.body.workEntries).toHaveLength(1);
      expect(res.body.workEntries[0].client_id).toBe(clientA.id);
    });

    test('clientId filter does not leak another user\'s entries', async () => {
      await insertWorkEntry(OTHER_USER, otherClient.id);
      const res = await asUser(request(app).get(`/api/work-entries?clientId=${otherClient.id}`));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ workEntries: [] });
    });

    test('returns 400 for invalid client ID filter', async () => {
      const res = await asUser(request(app).get('/api/work-entries?clientId=invalid'));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid client ID' });
    });

    test('returns 500 on database error', async () => {
      await breakTable('work_entries');
      const res = await asUser(request(app).get('/api/work-entries'));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('GET /api/work-entries/:id', () => {
    test('returns specific work entry', async () => {
      const entry = await insertWorkEntry(USER, clientA.id, { hours: 3.25, description: 'Work' });

      const res = await asUser(request(app).get(`/api/work-entries/${entry.id}`));

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.workEntry).sort()).toEqual(ENTRY_KEYS);
      expect(res.body.workEntry).toMatchObject({
        id: entry.id, client_id: clientA.id, client_name: 'Client A', hours: 3.25, description: 'Work'
      });
    });

    test('returns 404 if work entry not found', async () => {
      const res = await asUser(request(app).get('/api/work-entries/999'));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Work entry not found' });
    });

    test('returns 404 for another user\'s work entry', async () => {
      const entry = await insertWorkEntry(OTHER_USER, otherClient.id);
      const res = await asUser(request(app).get(`/api/work-entries/${entry.id}`));
      expect(res.status).toBe(404);
    });

    test('returns 400 for invalid work entry ID', async () => {
      const res = await asUser(request(app).get('/api/work-entries/invalid'));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid work entry ID' });
    });

    test('returns 500 on database error', async () => {
      await breakTable('work_entries');
      const res = await asUser(request(app).get('/api/work-entries/1'));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('POST /api/work-entries', () => {
    const valid = () => ({ clientId: clientA.id, hours: 8, description: 'Development work', date: '2024-01-15' });

    test('creates work entry with valid data', async () => {
      const res = await asUser(request(app).post('/api/work-entries')).send(valid());

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Work entry created successfully');
      expect(Object.keys(res.body.workEntry).sort()).toEqual(ENTRY_KEYS);
      expect(res.body.workEntry).toMatchObject({
        client_id: clientA.id, client_name: 'Client A', hours: 8, description: 'Development work'
      });

      const row = await db('work_entries').where({ id: res.body.workEntry.id }).first();
      expect(row).toMatchObject({ client_id: clientA.id, user_email: USER, hours: 8, description: 'Development work' });
      expect(row.date).toEqual(res.body.workEntry.date);
    });

    test('stores empty description as null and keeps decimal hours', async () => {
      const res = await asUser(request(app).post('/api/work-entries')).send({ ...valid(), hours: 7.75, description: '' });
      expect(res.status).toBe(201);
      expect(res.body.workEntry).toMatchObject({ hours: 7.75, description: null });
    });

    test('returns 400 if client does not exist', async () => {
      const res = await asUser(request(app).post('/api/work-entries')).send({ ...valid(), clientId: 999 });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Client not found or does not belong to user' });
      expect(await db('work_entries')).toHaveLength(0);
    });

    test('returns 400 if client belongs to another user', async () => {
      const res = await asUser(request(app).post('/api/work-entries')).send({ ...valid(), clientId: otherClient.id });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Client not found or does not belong to user' });
    });

    test.each([
      ['missing required fields', () => ({ hours: 8 })],
      ['negative hours', () => ({ ...valid(), hours: -5 })],
      ['zero hours', () => ({ ...valid(), hours: 0 })],
      ['hours exceeding 24', () => ({ ...valid(), hours: 25 })],
      ['invalid date', () => ({ ...valid(), date: 'not-a-date' })],
      ['non-integer clientId', () => ({ ...valid(), clientId: 1.5 })]
    ])('returns 400 for %s', async (_label, buildBody) => {
      const body = buildBody();
      const res = await asUser(request(app).post('/api/work-entries')).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(await db('work_entries')).toHaveLength(0);
    });

    test('returns 500 when client verification fails', async () => {
      await breakTable('clients');
      const res = await asUser(request(app).post('/api/work-entries')).send(valid());
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    test('returns 500 Failed to create work entry on insert error', async () => {
      await failOn('work_entries', 'INSERT');
      const res = await asUser(request(app).post('/api/work-entries')).send(valid());
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to create work entry' });
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('PUT /api/work-entries/:id', () => {
    let entry;

    beforeEach(async () => {
      entry = await insertWorkEntry(USER, clientA.id, {
        hours: 5, description: 'Original', date: '2024-01-10', updated_at: '2000-01-01 00:00:00'
      });
    });

    test('updates hours and bumps updated_at', async () => {
      const res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({ hours: 6 });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Work entry updated successfully');
      expect(res.body.workEntry).toMatchObject({ id: entry.id, hours: 6, description: 'Original', client_name: 'Client A' });
      const row = await db('work_entries').where({ id: entry.id }).first();
      expect(row.hours).toBe(6);
      expect(row.updated_at).not.toBe('2000-01-01 00:00:00');
    });

    test('moves entry to another of the user\'s clients', async () => {
      const res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({ clientId: clientB.id });
      expect(res.status).toBe(200);
      expect(res.body.workEntry).toMatchObject({ client_id: clientB.id, client_name: 'Client B' });
    });

    test('updates date', async () => {
      const res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({ date: '2024-02-20' });
      expect(res.status).toBe(200);
      const row = await db('work_entries').where({ id: entry.id }).first();
      expect(row.date).not.toBe('2024-01-10');
      expect(res.body.workEntry.date).toEqual(row.date);
    });

    test('updates description, and empty string becomes null', async () => {
      let res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({ description: 'Changed' });
      expect(res.body.workEntry.description).toBe('Changed');
      res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({ description: '' });
      expect(res.status).toBe(200);
      expect(res.body.workEntry.description).toBeNull();
    });

    test('updates multiple fields at once', async () => {
      const res = await asUser(request(app).put(`/api/work-entries/${entry.id}`))
        .send({ clientId: clientB.id, hours: 2.5, description: 'Multi' });
      expect(res.status).toBe(200);
      expect(res.body.workEntry).toMatchObject({ client_id: clientB.id, hours: 2.5, description: 'Multi' });
    });

    test('returns 404 if work entry not found', async () => {
      const res = await asUser(request(app).put('/api/work-entries/999')).send({ hours: 6 });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Work entry not found' });
    });

    test('returns 404 and leaves another user\'s entry untouched', async () => {
      const res = await asUser(request(app).put(`/api/work-entries/${entry.id}`), OTHER_USER).send({ hours: 1 });
      expect(res.status).toBe(404);
      expect((await db('work_entries').where({ id: entry.id }).first()).hours).toBe(5);
    });

    test('returns 400 for invalid work entry ID', async () => {
      const res = await asUser(request(app).put('/api/work-entries/invalid')).send({ hours: 6 });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid work entry ID' });
    });

    test('returns 400 for empty update', async () => {
      const res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    test('returns 400 if new client is not the user\'s', async () => {
      const res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({ clientId: otherClient.id });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Client not found or does not belong to user' });
      expect((await db('work_entries').where({ id: entry.id }).first()).client_id).toBe(clientA.id);
    });

    test('returns 500 when existence check fails', async () => {
      await breakTable('work_entries');
      const res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({ hours: 6 });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    test('returns 500 when new-client verification fails', async () => {
      await breakTable('clients');
      const res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({ clientId: clientB.id });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    test('returns 500 Failed to update work entry on update error', async () => {
      await failOn('work_entries', 'UPDATE');
      const res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({ hours: 6 });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to update work entry' });
      expect((await db('work_entries').where({ id: entry.id }).first()).hours).toBe(5);
    });
  });

  describe('DELETE /api/work-entries/:id', () => {
    test('deletes existing work entry', async () => {
      const entry = await insertWorkEntry(USER, clientA.id);
      const res = await asUser(request(app).delete(`/api/work-entries/${entry.id}`));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Work entry deleted successfully' });
      expect(await db('work_entries').where({ id: entry.id }).first()).toBeUndefined();
    });

    test('returns 404 if work entry not found', async () => {
      const res = await asUser(request(app).delete('/api/work-entries/999'));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Work entry not found' });
    });

    test('returns 404 and keeps another user\'s entry', async () => {
      const entry = await insertWorkEntry(OTHER_USER, otherClient.id);
      const res = await asUser(request(app).delete(`/api/work-entries/${entry.id}`));
      expect(res.status).toBe(404);
      expect(await db('work_entries').where({ id: entry.id }).first()).toBeDefined();
    });

    test('returns 400 for invalid work entry ID', async () => {
      const res = await asUser(request(app).delete('/api/work-entries/invalid'));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid work entry ID' });
    });

    test('returns 500 when existence check fails', async () => {
      await breakTable('work_entries');
      const res = await asUser(request(app).delete('/api/work-entries/1'));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    test('returns 500 Failed to delete work entry on delete error', async () => {
      const entry = await insertWorkEntry(USER, clientA.id);
      await failOn('work_entries', 'DELETE');
      const res = await asUser(request(app).delete(`/api/work-entries/${entry.id}`));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to delete work entry' });
      expect(await db('work_entries').where({ id: entry.id }).first()).toBeDefined();
    });
  });

  describe('categories on work entries', () => {
    let dev;
    let meetings;
    let retired;

    beforeEach(async () => {
      dev = await insertCategory({ name: 'Development' });
      meetings = await insertCategory({ name: 'Meetings' });
      retired = await insertCategory({ name: 'Retired', active: 0 });
    });

    const valid = (extra = {}) => ({ clientId: clientA.id, hours: 2, date: '2024-01-15', ...extra });

    test('entries without a category return null category_id and category_name', async () => {
      const entry = await insertWorkEntry(USER, clientA.id);
      const res = await asUser(request(app).get(`/api/work-entries/${entry.id}`));
      expect(res.status).toBe(200);
      expect(res.body.workEntry).toMatchObject({ category_id: null, category_name: null });
    });

    test('creates an entry with an active category', async () => {
      const res = await asUser(request(app).post('/api/work-entries')).send(valid({ categoryId: dev.id }));
      expect(res.status).toBe(201);
      expect(res.body.workEntry).toMatchObject({ category_id: dev.id, category_name: 'Development' });
      expect((await db('work_entries').where({ id: res.body.workEntry.id }).first()).category_id).toBe(dev.id);
    });

    test('creates an entry with categoryId null', async () => {
      const res = await asUser(request(app).post('/api/work-entries')).send(valid({ categoryId: null }));
      expect(res.status).toBe(201);
      expect(res.body.workEntry).toMatchObject({ category_id: null, category_name: null });
    });

    test.each([
      ['missing', () => 999],
      ['inactive', () => retired.id]
    ])('create returns 400 for a %s category', async (_label, id) => {
      const res = await asUser(request(app).post('/api/work-entries')).send(valid({ categoryId: id() }));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Category not found or inactive' });
      expect(await db('work_entries')).toHaveLength(0);
    });

    test('create returns 400 Validation error for a non-positive categoryId', async () => {
      const res = await asUser(request(app).post('/api/work-entries')).send(valid({ categoryId: 0 }));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    test('create returns 500 when the category lookup fails', async () => {
      await breakTable('categories');
      const res = await asUser(request(app).post('/api/work-entries')).send(valid({ categoryId: dev.id }));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      expect(console.error).toHaveBeenCalled();
    });

    test('updates category, switches it, then clears it with null', async () => {
      const entry = await insertWorkEntry(USER, clientA.id, { hours: 5, description: 'keep' });

      let res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({ categoryId: dev.id });
      expect(res.status).toBe(200);
      expect(res.body.workEntry).toMatchObject({ category_id: dev.id, category_name: 'Development', hours: 5 });

      res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({ categoryId: meetings.id });
      expect(res.body.workEntry).toMatchObject({ category_id: meetings.id, category_name: 'Meetings' });

      res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({ categoryId: null });
      expect(res.status).toBe(200);
      expect(res.body.workEntry).toMatchObject({ category_id: null, category_name: null, description: 'keep' });
      expect((await db('work_entries').where({ id: entry.id }).first()).category_id).toBeNull();
    });

    test('update without categoryId leaves the category unchanged', async () => {
      const entry = await insertWorkEntry(USER, clientA.id, { category_id: dev.id });
      const res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({ hours: 3 });
      expect(res.status).toBe(200);
      expect(res.body.workEntry).toMatchObject({ hours: 3, category_id: dev.id, category_name: 'Development' });
    });

    test.each([
      ['missing', () => 999],
      ['inactive', () => retired.id]
    ])('update returns 400 for a %s category and leaves the entry untouched', async (_label, id) => {
      const entry = await insertWorkEntry(USER, clientA.id, { category_id: dev.id });
      const res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({ categoryId: id() });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Category not found or inactive' });
      expect((await db('work_entries').where({ id: entry.id }).first()).category_id).toBe(dev.id);
    });

    test('update returns 500 when the category lookup fails', async () => {
      const entry = await insertWorkEntry(USER, clientA.id);
      await breakTable('categories');
      const res = await asUser(request(app).put(`/api/work-entries/${entry.id}`)).send({ categoryId: dev.id });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    test('a deactivated category still shows on existing entries', async () => {
      await insertWorkEntry(USER, clientA.id, { category_id: retired.id });
      const res = await asUser(request(app).get('/api/work-entries'));
      expect(res.body.workEntries[0]).toMatchObject({ category_id: retired.id, category_name: 'Retired' });
    });

    test('filters the list by categoryId and stays user-scoped', async () => {
      await insertWorkEntry(USER, clientA.id, { category_id: dev.id, description: 'dev' });
      await insertWorkEntry(USER, clientA.id, { category_id: meetings.id, description: 'meet' });
      await insertWorkEntry(USER, clientA.id, { description: 'none' });
      await insertWorkEntry(OTHER_USER, otherClient.id, { category_id: dev.id, description: 'other' });

      const res = await asUser(request(app).get(`/api/work-entries?categoryId=${dev.id}`));
      expect(res.status).toBe(200);
      expect(res.body.workEntries.map((e) => e.description)).toEqual(['dev']);
    });

    test('combines clientId and categoryId filters', async () => {
      await insertWorkEntry(USER, clientA.id, { category_id: dev.id, description: 'a-dev' });
      await insertWorkEntry(USER, clientB.id, { category_id: dev.id, description: 'b-dev' });

      const res = await asUser(request(app).get(`/api/work-entries?clientId=${clientB.id}&categoryId=${dev.id}`));
      expect(res.body.workEntries.map((e) => e.description)).toEqual(['b-dev']);
    });

    test('returns 400 for an invalid categoryId filter', async () => {
      const res = await asUser(request(app).get('/api/work-entries?categoryId=abc'));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid category ID' });
    });
  });
});
