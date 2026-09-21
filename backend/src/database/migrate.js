const SCHEMA_VERSION = 2;

const FINAL_SCHEMA = {
  users: `CREATE TABLE IF NOT EXISTS users (
    email TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  clients: `CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    department TEXT,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  projects: `CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    client_id INTEGER NOT NULL,
    user_email TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE RESTRICT,
    FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE
  )`,
  workEntries: `CREATE TABLE IF NOT EXISTS work_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL,
    project_id INTEGER,
    user_email TEXT NOT NULL,
    hours DECIMAL(5,2) NOT NULL,
    rate DECIMAL(8,2),
    description TEXT,
    date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE RESTRICT,
    FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE RESTRICT,
    FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE
  )`
};

const STAGING_SCHEMA = {
  clients: `CREATE TABLE clients_new (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    department TEXT,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  workEntries: `CREATE TABLE work_entries_new (
    id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL,
    project_id INTEGER,
    user_email TEXT NOT NULL,
    hours DECIMAL(5,2) NOT NULL,
    rate DECIMAL(8,2),
    description TEXT,
    date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
};

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function readSequence(db, tableName) {
  const table = await get(db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'`);
  if (!table) return 0;
  const row = await get(db, `SELECT seq FROM sqlite_sequence WHERE name = ?`, [tableName]);
  return row ? row.seq : 0;
}

async function restoreSequence(db, tableName, seq) {
  const result = await run(db, `UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = ?`, [seq, tableName]);
  if (!result.changes) {
    await run(db, `INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)`, [tableName, seq]);
  }
}

async function createTables(db) {
  // Create users table
  await run(db, FINAL_SCHEMA.users);
  // Create clients table
  await run(db, FINAL_SCHEMA.clients);
  // Create projects table
  await run(db, FINAL_SCHEMA.projects);
  // Create work_entries table
  await run(db, FINAL_SCHEMA.workEntries);
}

async function createIndexes(db) {
  // Create indexes for better performance
  await run(db, `CREATE INDEX IF NOT EXISTS idx_work_entries_client_id ON work_entries (client_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_work_entries_user_email ON work_entries (user_email)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_work_entries_date ON work_entries (date)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_work_entries_project_id ON work_entries (project_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects (client_id)`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_projects_user_email ON projects (user_email)`);
}

async function hasColumn(db, tableName, columnName) {
  const columns = await all(db, `PRAGMA table_info(${tableName})`);
  return columns.some(c => c.name === columnName);
}

// Additive columns can be applied in place; FK changes require the rebuild below.
async function addMissingWorkEntryColumns(db) {
  if (!(await hasColumn(db, 'work_entries', 'project_id'))) {
    await run(db, `ALTER TABLE work_entries ADD COLUMN project_id INTEGER REFERENCES projects (id) ON DELETE RESTRICT`);
  }
  if (!(await hasColumn(db, 'work_entries', 'rate'))) {
    await run(db, `ALTER TABLE work_entries ADD COLUMN rate DECIMAL(8,2)`);
  }
}

async function needsClientsRebuild(db) {
  const columns = await all(db, `PRAGMA table_info(clients)`);
  return (
    columns.some(c => c.name === 'user_email') ||
    !columns.some(c => c.name === 'department') ||
    !columns.some(c => c.name === 'email')
  );
}

async function needsWorkEntriesRebuild(db) {
  const fks = await all(db, `PRAGMA foreign_key_list(work_entries)`);
  return !fks.some(fk => fk.from === 'client_id' && fk.table === 'clients' && fk.to === 'id' && fk.on_delete === 'RESTRICT') ||
    !fks.some(fk => fk.from === 'project_id' && fk.table === 'projects' && fk.to === 'id' && fk.on_delete === 'RESTRICT') ||
    !fks.some(fk => fk.from === 'user_email' && fk.table === 'users' && fk.to === 'email' && fk.on_delete === 'CASCADE');
}

async function migrateBoth(db) {
  await run(db, `PRAGMA foreign_keys = OFF`);
  let transactionStarted = false;

  try {
    await run(db, `BEGIN IMMEDIATE TRANSACTION`);
    transactionStarted = true;
    const clientsColumns = await all(db, `PRAGMA table_info(clients)`);
    const hasDepartment = clientsColumns.some(c => c.name === 'department');
    const hasEmail = clientsColumns.some(c => c.name === 'email');
    const workEntriesColumns = await all(db, `PRAGMA table_info(work_entries)`);
    const clientsSeq = await readSequence(db, 'clients');
    const workEntriesSeq = await readSequence(db, 'work_entries');

    await run(db, STAGING_SCHEMA.clients);
    await run(db, STAGING_SCHEMA.workEntries);

    const hasClientDescription = clientsColumns.some(c => c.name === 'description');
    const hasClientCreatedAt = clientsColumns.some(c => c.name === 'created_at');
    const hasClientUpdatedAt = clientsColumns.some(c => c.name === 'updated_at');
    const clientDescriptionSource = hasClientDescription ? 'description' : 'NULL';
    const departmentSource = hasDepartment ? 'department' : 'NULL';
    const emailSource = hasEmail ? 'email' : 'NULL';
    const clientCreatedAtSource = hasClientCreatedAt ? 'created_at' : 'NULL';
    const clientUpdatedAtSource = hasClientUpdatedAt ? 'updated_at' : 'NULL';
    await run(db, `INSERT INTO clients_new (id, name, description, department, email, created_at, updated_at) SELECT id, name, ${clientDescriptionSource}, ${departmentSource}, ${emailSource}, ${clientCreatedAtSource}, ${clientUpdatedAtSource} FROM clients`);

    const hasWorkDescription = workEntriesColumns.some(c => c.name === 'description');
    const hasWorkCreatedAt = workEntriesColumns.some(c => c.name === 'created_at');
    const hasWorkUpdatedAt = workEntriesColumns.some(c => c.name === 'updated_at');
    const hasWorkProjectId = workEntriesColumns.some(c => c.name === 'project_id');
    const hasWorkRate = workEntriesColumns.some(c => c.name === 'rate');
    const workDescriptionSource = hasWorkDescription ? 'description' : 'NULL';
    const workCreatedAtSource = hasWorkCreatedAt ? 'created_at' : 'NULL';
    const workUpdatedAtSource = hasWorkUpdatedAt ? 'updated_at' : 'NULL';
    const workProjectIdSource = hasWorkProjectId ? 'project_id' : 'NULL';
    const workRateSource = hasWorkRate ? 'rate' : 'NULL';
    await run(db, `INSERT INTO work_entries_new (id, client_id, project_id, user_email, hours, rate, description, date, created_at, updated_at) SELECT id, client_id, ${workProjectIdSource}, user_email, hours, ${workRateSource}, ${workDescriptionSource}, date, ${workCreatedAtSource}, ${workUpdatedAtSource} FROM work_entries`);

    await run(db, `DROP TABLE IF EXISTS work_entries`);
    await run(db, `DROP TABLE IF EXISTS clients`);

    await createTables(db);
    await createIndexes(db);

    await run(db, `INSERT INTO clients (id, name, description, department, email, created_at, updated_at) SELECT * FROM clients_new`);
    await run(db, `INSERT INTO work_entries (id, client_id, project_id, user_email, hours, rate, description, date, created_at, updated_at) SELECT * FROM work_entries_new`);

    await run(db, `DROP TABLE IF EXISTS clients_new`);
    await run(db, `DROP TABLE IF EXISTS work_entries_new`);

    await restoreSequence(db, 'clients', clientsSeq);
    await restoreSequence(db, 'work_entries', workEntriesSeq);

    const violations = await all(db, `PRAGMA foreign_key_check`);
    if (violations.length > 0) {
      throw new Error(
        `Foreign key violations detected during migration. Repair work entries referencing missing clients or users before retrying: ${JSON.stringify(violations)}`
      );
    }

    await run(db, `COMMIT`);
  } catch (err) {
    if (transactionStarted) await run(db, `ROLLBACK`);
    throw err;
  } finally {
    await run(db, `PRAGMA foreign_keys = ON`);
  }
}

async function migrateSchema(db) {
  if (!db) throw new Error('Database instance is required');

  // Enable foreign keys
  await run(db, `PRAGMA foreign_keys = ON`);

  await createTables(db);

  const versionRow = await get(db, `PRAGMA user_version`);
  const currentVersion = versionRow ? versionRow.user_version : 0;

  if (currentVersion < SCHEMA_VERSION) {
    await addMissingWorkEntryColumns(db);
  }

  // Structural repairs (FK definitions) are always re-checked; they are cheap PRAGMA reads.
  const clientsNeedsRebuild = await needsClientsRebuild(db);
  const workEntriesNeedsRebuild = await needsWorkEntriesRebuild(db);

  if (clientsNeedsRebuild || workEntriesNeedsRebuild) {
    await migrateBoth(db);
  } else {
    await createIndexes(db);
  }

  await run(db, `PRAGMA user_version = ${SCHEMA_VERSION}`);
}

module.exports = {
  SCHEMA_VERSION,
  migrateSchema,
  run,
  get,
  all
};
