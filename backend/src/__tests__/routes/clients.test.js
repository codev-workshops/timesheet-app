const request = require('supertest');
const { createApp, USER, OTHER_USER } = require('../helpers/app');
const {
  db, resetDatabase, insertUsers, insertClient, insertWorkEntry, breakTable, failOn
} = require('../helpers/db');

const app = createApp();
const CLIENT_KEYS = ['created_at', 'department', 'description', 'email', 'id', 'name', 'updated_at'];

const asUser = (req, email = USER) => req.set('x-user-email', email);

describe('Client Routes', () => {
  beforeEach(async () => {
    await resetDatabase();
    await insertUsers(USER, OTHER_USER);
  });

  describe('GET /api/clients', () => {
    test('returns only the user\'s clients ordered by name', async () => {
      await insertClient(USER, { name: 'Zeta', description: 'Desc Z' });
      await insertClient(USER, { name: 'Alpha', department: 'Eng', email: 'a@client.com' });
      await insertClient(OTHER_USER, { name: 'Other Co' });

      const res = await asUser(request(app).get('/api/clients'));

      expect(res.status).toBe(200);
      expect(res.body.clients.map((c) => c.name)).toEqual(['Alpha', 'Zeta']);
      expect(Object.keys(res.body.clients[0]).sort()).toEqual(CLIENT_KEYS);
      expect(res.body.clients[0]).toMatchObject({
        name: 'Alpha', department: 'Eng', email: 'a@client.com', description: null
      });
    });

    test('returns empty array when no clients exist', async () => {
      const res = await asUser(request(app).get('/api/clients'));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ clients: [] });
    });

    test('returns 401 without x-user-email header', async () => {
      const res = await request(app).get('/api/clients');
      expect(res.status).toBe(401);
    });

    test('returns 500 on database error', async () => {
      await breakTable('clients');
      const res = await asUser(request(app).get('/api/clients'));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('GET /api/clients/:id', () => {
    test('returns specific client', async () => {
      const client = await insertClient(USER, { name: 'Client A', description: 'Desc A' });

      const res = await asUser(request(app).get(`/api/clients/${client.id}`));

      expect(res.status).toBe(200);
      expect(Object.keys(res.body.client).sort()).toEqual(CLIENT_KEYS);
      expect(res.body.client).toMatchObject({ id: client.id, name: 'Client A', description: 'Desc A' });
    });

    test('returns 404 if client not found', async () => {
      const res = await asUser(request(app).get('/api/clients/999'));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Client not found' });
    });

    test('returns 404 for another user\'s client', async () => {
      const other = await insertClient(OTHER_USER, { name: 'Other Co' });
      const res = await asUser(request(app).get(`/api/clients/${other.id}`));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Client not found' });
    });

    test('returns 400 for invalid client ID', async () => {
      const res = await asUser(request(app).get('/api/clients/invalid'));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid client ID' });
    });

    test('returns 500 on database error', async () => {
      await breakTable('clients');
      const res = await asUser(request(app).get('/api/clients/1'));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('POST /api/clients', () => {
    test('creates new client with valid data', async () => {
      const res = await asUser(request(app).post('/api/clients')).send({
        name: 'New Client', description: 'New Description', department: 'Sales', email: 'c@client.com'
      });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Client created successfully');
      expect(Object.keys(res.body.client).sort()).toEqual(CLIENT_KEYS);
      expect(res.body.client).toMatchObject({
        name: 'New Client', description: 'New Description', department: 'Sales', email: 'c@client.com'
      });

      const row = await db('clients').where({ id: res.body.client.id }).first();
      expect(row).toMatchObject({ name: 'New Client', user_email: USER });
    });

    test('stores empty optional fields as null', async () => {
      const res = await asUser(request(app).post('/api/clients'))
        .send({ name: 'Bare Client', description: '', department: '', email: '' });

      expect(res.status).toBe(201);
      expect(res.body.client).toMatchObject({ description: null, department: null, email: null });
      const row = await db('clients').where({ id: res.body.client.id }).first();
      expect(row).toMatchObject({ description: null, department: null, email: null });
    });

    test('creates client without description', async () => {
      const res = await asUser(request(app).post('/api/clients')).send({ name: 'No Desc' });
      expect(res.status).toBe(201);
      expect(res.body.client.description).toBeNull();
    });

    test.each([
      ['missing name', { description: 'x' }],
      ['empty name', { name: '' }],
      ['invalid email', { name: 'A', email: 'not-an-email' }],
      ['unknown field', { name: 'A', extra: true }]
    ])('returns 400 for %s', async (_label, body) => {
      const res = await asUser(request(app).post('/api/clients')).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
      expect(res.body.details.length).toBeGreaterThan(0);
      expect(await db('clients')).toHaveLength(0);
    });

    test('returns 500 Failed to create client on insert error', async () => {
      await failOn('clients', 'INSERT');
      const res = await asUser(request(app).post('/api/clients')).send({ name: 'New Client' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to create client' });
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('PUT /api/clients/:id', () => {
    let client;

    beforeEach(async () => {
      client = await insertClient(USER, {
        name: 'Old Name', description: 'Old Desc', department: 'Ops', email: 'old@client.com',
        updated_at: '2000-01-01 00:00:00'
      });
    });

    test('updates client name and bumps updated_at', async () => {
      const res = await asUser(request(app).put(`/api/clients/${client.id}`)).send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Client updated successfully');
      expect(res.body.client).toMatchObject({ id: client.id, name: 'Updated Name', description: 'Old Desc' });

      const row = await db('clients').where({ id: client.id }).first();
      expect(row.name).toBe('Updated Name');
      expect(row.updated_at).not.toBe('2000-01-01 00:00:00');
    });

    test('updates description only', async () => {
      const res = await asUser(request(app).put(`/api/clients/${client.id}`)).send({ description: 'New Desc' });
      expect(res.status).toBe(200);
      expect(res.body.client).toMatchObject({ name: 'Old Name', description: 'New Desc' });
    });

    test('updates several fields at once', async () => {
      const res = await asUser(request(app).put(`/api/clients/${client.id}`))
        .send({ name: 'N', description: 'D', department: 'Eng', email: 'new@client.com' });
      expect(res.status).toBe(200);
      expect(res.body.client).toMatchObject({ name: 'N', description: 'D', department: 'Eng', email: 'new@client.com' });
    });

    test('sets empty optional fields to null', async () => {
      const res = await asUser(request(app).put(`/api/clients/${client.id}`))
        .send({ description: '', department: '', email: '' });
      expect(res.status).toBe(200);
      expect(res.body.client).toMatchObject({ description: null, department: null, email: null });
      const row = await db('clients').where({ id: client.id }).first();
      expect(row).toMatchObject({ description: null, department: null, email: null });
    });

    test('returns 404 if client not found', async () => {
      const res = await asUser(request(app).put('/api/clients/999')).send({ name: 'X' });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Client not found' });
    });

    test('returns 404 and leaves another user\'s client untouched', async () => {
      const res = await asUser(request(app).put(`/api/clients/${client.id}`), OTHER_USER).send({ name: 'Hijack' });
      expect(res.status).toBe(404);
      expect((await db('clients').where({ id: client.id }).first()).name).toBe('Old Name');
    });

    test('returns 400 for invalid client ID', async () => {
      const res = await asUser(request(app).put('/api/clients/invalid')).send({ name: 'X' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid client ID' });
    });

    test('returns 400 for empty update', async () => {
      const res = await asUser(request(app).put(`/api/clients/${client.id}`)).send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation error');
    });

    test('returns 500 when existence check fails', async () => {
      await breakTable('clients');
      const res = await asUser(request(app).put(`/api/clients/${client.id}`)).send({ name: 'X' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    test('returns 500 Failed to update client on update error', async () => {
      await failOn('clients', 'UPDATE');
      const res = await asUser(request(app).put(`/api/clients/${client.id}`)).send({ name: 'X' });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to update client' });
      expect((await db('clients').where({ id: client.id }).first()).name).toBe('Old Name');
    });
  });

  describe('DELETE /api/clients/:id', () => {
    test('deletes existing client', async () => {
      const client = await insertClient(USER);

      const res = await asUser(request(app).delete(`/api/clients/${client.id}`));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Client deleted successfully' });
      expect(await db('clients').where({ id: client.id }).first()).toBeUndefined();
    });

    test('returns 404 if client not found', async () => {
      const res = await asUser(request(app).delete('/api/clients/999'));
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'Client not found' });
    });

    test('returns 404 and does not delete another user\'s client', async () => {
      const other = await insertClient(OTHER_USER);
      const res = await asUser(request(app).delete(`/api/clients/${other.id}`));
      expect(res.status).toBe(404);
      expect(await db('clients').where({ id: other.id }).first()).toBeDefined();
    });

    test('returns 400 for invalid client ID', async () => {
      const res = await asUser(request(app).delete('/api/clients/invalid'));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid client ID' });
    });

    test('returns 500 when existence check fails', async () => {
      await breakTable('clients');
      const res = await asUser(request(app).delete('/api/clients/1'));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    });

    test('returns 500 Failed to delete client on delete error', async () => {
      const client = await insertClient(USER);
      await failOn('clients', 'DELETE');
      const res = await asUser(request(app).delete(`/api/clients/${client.id}`));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to delete client' });
      expect(await db('clients').where({ id: client.id }).first()).toBeDefined();
    });
  });

  describe('DELETE /api/clients', () => {
    test('deletes all of the user\'s clients and reports deletedCount', async () => {
      await insertClient(USER, { name: 'A' });
      await insertClient(USER, { name: 'B' });
      const other = await insertClient(OTHER_USER, { name: 'C' });

      const res = await asUser(request(app).delete('/api/clients'));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'All clients deleted successfully', deletedCount: 2 });
      expect(await db('clients').where({ user_email: USER })).toHaveLength(0);
      expect(await db('clients').where({ id: other.id }).first()).toBeDefined();
    });

    test('returns deletedCount 0 when the user has no clients', async () => {
      const res = await asUser(request(app).delete('/api/clients'));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'All clients deleted successfully', deletedCount: 0 });
    });

    test('returns 500 Failed to delete clients on delete error', async () => {
      await insertClient(USER);
      await failOn('clients', 'DELETE');
      const res = await asUser(request(app).delete('/api/clients'));
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Failed to delete clients' });
    });
  });

  test('work entries are not cascaded when a client is deleted (FK enforcement off, matches main)', async () => {
    const client = await insertClient(USER);
    await insertWorkEntry(USER, client.id);
    await asUser(request(app).delete(`/api/clients/${client.id}`));
    expect(await db('work_entries').where({ client_id: client.id })).toHaveLength(1);
  });
});
