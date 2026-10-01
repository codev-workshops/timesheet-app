// Helpers for tests that run against a real in-memory SQLite database.
// Test files using these must call `jest.unmock('sqlite3')` (setup.js mocks it globally).
const { getDatabase, initializeDatabase } = require('../../database/init');
const { dbAll, dbRun } = require('../../services/categorization/categorizationService');

async function setupDatabase() {
  await initializeDatabase();
  return getDatabase();
}

async function resetData(db) {
  await dbRun(db, 'DELETE FROM work_entries', []);
  await dbRun(db, 'DELETE FROM clients', []);
  await dbRun(db, 'DELETE FROM users', []);
}

async function insertEntries(db, descriptions, { userEmail = 'user@example.com', date = '2024-01-15' } = {}) {
  await dbRun(db, 'INSERT OR IGNORE INTO users (email) VALUES (?)', [userEmail]);
  await dbRun(db, 'INSERT INTO clients (name, user_email) VALUES (?, ?)', ['Client', userEmail]);
  const [client] = await dbAll(db, 'SELECT MAX(id) AS id FROM clients', []);
  const ids = [];
  for (const description of descriptions) {
    await dbRun(db,
      'INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (?, ?, ?, ?, ?)',
      [client.id, userEmail, 1, description, date]);
    const [row] = await dbAll(db, 'SELECT MAX(id) AS id FROM work_entries', []);
    ids.push(row.id);
  }
  return ids;
}

async function getEntries(db) {
  return dbAll(db, `
    SELECT we.*, cat.name AS category
    FROM work_entries we LEFT JOIN categories cat ON we.category_id = cat.id
    ORDER BY we.id`, []);
}

function silenceConsole() {
  const spies = ['log', 'warn', 'error'].map(method => jest.spyOn(console, method).mockImplementation(() => {}));
  return () => spies.forEach(spy => spy.mockRestore());
}

module.exports = {
  setupDatabase,
  resetData,
  insertEntries,
  getEntries,
  silenceConsole
};
