const { db } = require('../../database/db');

const renamedTables = [];

// Rolls back every migration and re-applies them, giving each test an empty schema.
async function resetDatabase() {
  await restoreTables();
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
}

async function insertUsers(...emails) {
  if (emails.length === 0) return;
  await db('users').insert(emails.map((email) => ({ email })));
}

async function insertClient(userEmail, attrs = {}) {
  const [id] = await db('clients').insert({ name: 'Client', user_email: userEmail, ...attrs });
  return db('clients').where({ id }).first();
}

async function insertWorkEntry(userEmail, clientId, attrs = {}) {
  const [id] = await db('work_entries').insert({
    client_id: clientId,
    user_email: userEmail,
    hours: 1,
    date: '2024-01-15',
    ...attrs
  });
  return db('work_entries').where({ id }).first();
}

// Simulates a DB failure for any query touching `table`. Restored by the next resetDatabase().
async function breakTable(table) {
  await db.schema.renameTable(table, `${table}__broken`);
  renamedTables.push(table);
}

async function restoreTables() {
  while (renamedTables.length) {
    const table = renamedTables.pop();
    await db.schema.renameTable(`${table}__broken`, table);
  }
}

// Makes every `event` (INSERT | UPDATE | DELETE) on `table` fail while reads keep working.
async function failOn(table, event) {
  await db.raw(
    `CREATE TRIGGER fail_${event.toLowerCase()}_${table} BEFORE ${event} ON ${table} ` +
    `BEGIN SELECT RAISE(ABORT, 'simulated ${event.toLowerCase()} failure'); END`
  );
}

// Makes every INSERT on `table` a silent no-op (the statement succeeds but no row is written).
async function ignoreInsertsOn(table) {
  await db.raw(
    `CREATE TRIGGER ignore_insert_${table} BEFORE INSERT ON ${table} BEGIN SELECT RAISE(IGNORE); END`
  );
}

async function tableNames() {
  const rows = await db('sqlite_master').select('name').where({ type: 'table' });
  return rows.map((r) => r.name);
}

async function indexNames() {
  const rows = await db('sqlite_master').select('name').where({ type: 'index' });
  return rows.map((r) => r.name);
}

module.exports = {
  db,
  resetDatabase,
  insertUsers,
  insertClient,
  insertWorkEntry,
  breakTable,
  restoreTables,
  failOn,
  ignoreInsertsOn,
  tableNames,
  indexNames
};
