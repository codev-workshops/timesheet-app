// Use the real sqlite3 driver (the global setup mocks it) to verify schema-level behavior
jest.unmock('sqlite3');
const { getDatabase, initializeDatabase, closeDatabase } = require('../../database/init');

const run = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });

const all = (db, sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

describe('projects schema', () => {
  let db;

  beforeAll(async () => {
    await initializeDatabase();
    db = getDatabase();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  test('deleting a client cascades to its projects', async () => {
    await run(db, 'INSERT INTO users (email) VALUES (?)', ['cascade@example.com']);
    const client = await run(db, 'INSERT INTO clients (name, user_email) VALUES (?, ?)', ['Acme', 'cascade@example.com']);
    await run(
      db,
      'INSERT INTO projects (name, client_id, user_email) VALUES (?, ?, ?)',
      ['Redesign', client.lastID, 'cascade@example.com']
    );

    expect(await all(db, 'SELECT id FROM projects WHERE client_id = ?', [client.lastID])).toHaveLength(1);

    await run(db, 'DELETE FROM clients WHERE id = ?', [client.lastID]);

    expect(await all(db, 'SELECT id FROM projects WHERE client_id = ?', [client.lastID])).toHaveLength(0);
  });

  test('rejects a project whose client does not exist', async () => {
    await expect(
      run(db, 'INSERT INTO projects (name, client_id, user_email) VALUES (?, ?, ?)', ['Orphan', 9999, 'cascade@example.com'])
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });
});
