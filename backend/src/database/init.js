const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db = null;
let isClosing = false;
let isClosed = false;

function getDatabase() {
  if (!db) {
    // Reset state when creating a new database connection
    isClosing = false;
    isClosed = false;
    // Use in-memory database as specified in requirements
    db = new sqlite3.Database(':memory:', (err) => {
      if (err) {
        console.error('Error opening database:', err);
        throw err;
      }
      console.log('Connected to SQLite in-memory database');
    });
  }
  return db;
}

// Versioned schema migrations, applied in ascending order and recorded in
// schema_migrations. Never edit a migration once it has shipped (including
// migration 1): add every schema change as a new entry with the next version.
const migrations = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
        CREATE TABLE IF NOT EXISTS users (
          email TEXT PRIMARY KEY,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS clients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          department TEXT,
          email TEXT,
          user_email TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS work_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          client_id INTEGER NOT NULL,
          user_email TEXT NOT NULL,
          hours DECIMAL(5,2) NOT NULL,
          description TEXT,
          date DATE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE,
          FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_clients_user_email ON clients (user_email);
        CREATE INDEX IF NOT EXISTS idx_work_entries_client_id ON work_entries (client_id);
        CREATE INDEX IF NOT EXISTS idx_work_entries_user_email ON work_entries (user_email);
        CREATE INDEX IF NOT EXISTS idx_work_entries_date ON work_entries (date);
    `
  },
  {
    version: 2,
    name: 'create_projects',
    sql: `
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          client_id INTEGER NOT NULL,
          start_date DATE NOT NULL,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on-hold')),
          user_email TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE,
          FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_projects_user_email ON projects (user_email);
        CREATE INDEX IF NOT EXISTS idx_projects_client_id ON projects (client_id);
    `
  }
];

function run(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function get(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function exec(database, sql) {
  return new Promise((resolve, reject) => {
    database.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

async function initializeDatabase() {
  const database = getDatabase();

  await run(database, `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const row = await get(database, 'SELECT MAX(version) AS version FROM schema_migrations');
  const currentVersion = (row && row.version) || 0;

  const pending = migrations
    .filter((migration) => migration.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await run(database, 'BEGIN');
    try {
      await exec(database, migration.sql);
      await run(database, 'INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [
        migration.version,
        migration.name
      ]);
      await run(database, 'COMMIT');
    } catch (err) {
      try {
        await run(database, 'ROLLBACK');
      } catch (rollbackErr) {
        console.error('Error rolling back migration:', rollbackErr);
      }
      console.error(`Migration ${migration.version} (${migration.name}) failed:`, err);
      throw err;
    }
    console.log(`Applied migration ${migration.version}: ${migration.name}`);
  }

  console.log('Database tables created successfully');
}

function closeDatabase() {
  return new Promise((resolve, reject) => {
    if (isClosed) {
      // Already closed, resolve immediately
      resolve();
      return;
    }
    
    if (isClosing) {
      // Currently closing, wait for it to complete
      const checkClosed = setInterval(() => {
        if (isClosed) {
          clearInterval(checkClosed);
          resolve();
        }
      }, 10);
      return;
    }
    
    if (!db) {
      // No database connection, resolve immediately
      resolve();
      return;
    }
    
    isClosing = true;
    db.close((err) => {
      isClosed = true;
      isClosing = false;
      db = null;
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
      resolve();
    });
  });
}

module.exports = {
  getDatabase,
  initializeDatabase,
  closeDatabase
};
