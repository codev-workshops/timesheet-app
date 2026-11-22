const request = require('supertest');
const express = require('express');
const { initializeDatabase, getDatabase, closeDatabase } = require('../../database/init');
const { errorHandler } = require('../../middleware/errorHandler');

jest.unmock('sqlite3');

const app = express();
app.use(express.json());
app.use('/api/clients', require('../../routes/clients'));
app.use('/api/work-entries', require('../../routes/workEntries'));
app.use(errorHandler);

const user = 'clients-edge@example.com';
const query = (sql, params = []) => new Promise((resolve, reject) => {
  getDatabase().all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});
const createClient = async (body) => {
  const response = await request(app).post('/api/clients').set('x-user-email', user).send(body).expect(201);
  return response.body.client;
};
const createEntry = async (clientId) => {
  const response = await request(app).post('/api/work-entries').set('x-user-email', user)
    .send({ clientId, hours: 2, description: 'Work', date: '2026-09-10' }).expect(201);
  return response.body.workEntry;
};

describe('Client Routes - edge cases with real SQLite', () => {
  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    await initializeDatabase();
  });

  afterEach(async () => {
    await closeDatabase();
    jest.restoreAllMocks();
  });

  test('persists trimmed values and stores empty optional fields as null', async () => {
    const client = await createClient({ name: '  Acme  ', description: '', department: ' Ops ', email: '' });

    expect(client).toMatchObject({ name: 'Acme', description: null, department: 'Ops', email: null });
  });

  test('stores SQL-like names literally and leaves the table intact', async () => {
    const name = "Robert'); DROP TABLE clients;--";
    const client = await createClient({ name });

    const list = await request(app).get('/api/clients').set('x-user-email', user).expect(200);
    expect(list.body.clients).toEqual([client]);
    expect(client.name).toBe(name);
  });

  test('lists clients ordered by name', async () => {
    await createClient({ name: 'Charlie' });
    await createClient({ name: 'Alpha' });
    await createClient({ name: 'Bravo' });

    const list = await request(app).get('/api/clients').set('x-user-email', user).expect(200);
    expect(list.body.clients.map(c => c.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  test('allows clients with duplicate names', async () => {
    const first = await createClient({ name: 'Same' });
    const second = await createClient({ name: 'Same' });

    expect(second.id).not.toBe(first.id);
  });

  test('clearing optional fields with empty strings sets them to null', async () => {
    const client = await createClient({ name: 'Acme', description: 'D', department: 'Ops', email: 'a@b.com' });

    const response = await request(app).put(`/api/clients/${client.id}`).set('x-user-email', user)
      .send({ description: '', department: '', email: '' }).expect(200);

    expect(response.body.client).toMatchObject({ name: 'Acme', description: null, department: null, email: null });
  });

  test('partial update leaves other fields unchanged', async () => {
    const client = await createClient({ name: 'Acme', description: 'Keep', department: 'Ops', email: 'a@b.com' });

    const response = await request(app).put(`/api/clients/${client.id}`).set('x-user-email', user)
      .send({ name: 'Renamed' }).expect(200);

    expect(response.body.client).toMatchObject({ name: 'Renamed', description: 'Keep', department: 'Ops', email: 'a@b.com' });
  });

  test('GET, PUT and DELETE return 404 for a client that was already deleted', async () => {
    const client = await createClient({ name: 'Gone' });
    await request(app).delete(`/api/clients/${client.id}`).set('x-user-email', user).expect(200);

    await request(app).get(`/api/clients/${client.id}`).set('x-user-email', user).expect(404);
    await request(app).put(`/api/clients/${client.id}`).set('x-user-email', user).send({ name: 'Back' }).expect(404);
    await request(app).delete(`/api/clients/${client.id}`).set('x-user-email', user).expect(404);
  });

  test('a client with work entries cannot be deleted until its entries are removed', async () => {
    const client = await createClient({ name: 'Busy' });
    const entry = await createEntry(client.id);

    await request(app).delete(`/api/clients/${client.id}`).set('x-user-email', user).expect(409);
    await request(app).get(`/api/clients/${client.id}`).set('x-user-email', user).expect(200);

    await request(app).delete(`/api/work-entries/${entry.id}`).set('x-user-email', user).expect(200);
    await request(app).delete(`/api/clients/${client.id}`).set('x-user-email', user).expect(200);
  });

  test('bulk delete is atomic: no clients are removed if any has work entries', async () => {
    const busy = await createClient({ name: 'Busy' });
    await createClient({ name: 'Idle' });
    await createEntry(busy.id);

    const response = await request(app).delete('/api/clients').set('x-user-email', user).expect(409);

    expect(response.body).toEqual({ error: 'Clients have work entries and cannot be bulk deleted' });
    const rows = await query('SELECT name FROM clients ORDER BY name');
    expect(rows.map(r => r.name)).toEqual(['Busy', 'Idle']);
  });

  test('bulk delete removes every client and reports the count', async () => {
    await createClient({ name: 'One' });
    await createClient({ name: 'Two' });

    const response = await request(app).delete('/api/clients').set('x-user-email', user).expect(200);

    expect(response.body.deletedCount).toBe(2);
    const list = await request(app).get('/api/clients').set('x-user-email', user).expect(200);
    expect(list.body.clients).toEqual([]);
  });

  test('requests without the x-user-email header are rejected', async () => {
    await request(app).get('/api/clients').expect(401);
    await request(app).post('/api/clients').send({ name: 'Acme' }).expect(401);
    const rows = await query('SELECT id FROM clients');
    expect(rows).toEqual([]);
  });
});
