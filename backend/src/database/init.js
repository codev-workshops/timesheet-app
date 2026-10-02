const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let db = null;
let isClosing = false;
let isClosed = false;

const HANDLERS_FLAG = '__timesheet_process_handlers_registered__';

function getDatabasePath() {
  return process.env.DATABASE_PATH || ':memory:';
}

function registerProcessHandlers() {
  if (globalThis[HANDLERS_FLAG]) {
    return;
  }
  globalThis[HANDLERS_FLAG] = true;

  // Signal handlers make crash vs clean shutdown distinguishable in logs.
  // Skipped under Jest so tests don't inherit exit-on-error behavior.
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
    return;
  }

  const shutdown = (signal) => {
    console.log(`Received ${signal}, closing database and shutting down`);
    closeDatabase()
      .catch((err) => console.error('Error during shutdown:', err))
      .finally(() => process.exit(1));
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection:', reason);
    process.exit(1);
  });
}

function getDatabase() {
  if (!db) {
    // Reset state when creating a new database connection
    isClosing = false;
    isClosed = false;
    const dbPath = getDatabasePath();
    const dbType = dbPath === ':memory:' ? 'memory' : 'file';
    console.log(`Connecting to SQLite database: DATABASE_PATH=${dbPath} type=${dbType}`);
    if (dbType === 'file') {
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
    }
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        throw err;
      }
      console.log(`Connected to SQLite database: DATABASE_PATH=${dbPath} type=${dbType}`);
    });
  }
  return db;
}

async function initializeDatabase() {
  registerProcessHandlers();
  const database = getDatabase();
  
  return new Promise((resolve, reject) => {
    database.serialize(() => {
      // Create users table
      database.run(`
        CREATE TABLE IF NOT EXISTS users (
          email TEXT PRIMARY KEY,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create clients table
      database.run(`
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
        )
      `);

      // Create work_entries table
      database.run(`
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
        )
      `);

      // Create indexes for better performance
      database.run(`CREATE INDEX IF NOT EXISTS idx_clients_user_email ON clients (user_email)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_work_entries_client_id ON work_entries (client_id)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_work_entries_user_email ON work_entries (user_email)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_work_entries_date ON work_entries (date)`);

      console.log('Database tables created successfully');
      resolve();
    });
  });
}

// File-based databases only: checkpoints WAL then copies the DB file to a
// timestamped backup in BACKUP_DIR (default: <db dir>/backups). Returns the
// backup path, or null when the database is in-memory.
async function backupDatabase() {
  const dbPath = getDatabasePath();
  if (dbPath === ':memory:') {
    console.warn('Backup skipped: in-memory database cannot be backed up');
    return null;
  }

  const backupDir = process.env.BACKUP_DIR || path.join(path.dirname(dbPath), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupDir, `timesheet-${stamp}.db`);

  const database = getDatabase();
  await new Promise((resolve, reject) => {
    database.run('PRAGMA wal_checkpoint(TRUNCATE)', (err) => {
      // A failed checkpoint means journal mode is delete (not WAL); the file
      // copy is still consistent for a serialized single-connection app.
      resolve();
    });
  });

  fs.copyFileSync(dbPath, dest);
  console.log(`Database backup written: ${dest}`);
  return dest;
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
  closeDatabase,
  backupDatabase,
  registerProcessHandlers
};
