const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { CATEGORIES } = require('../services/categorization/categories');

const IN_MEMORY = ':memory:';

// DB_FILE selects persistence: ':memory:' (default; tests/dev) or a file path (staging/prod).
function resolveDatabaseFile() {
  return process.env.DB_FILE || IN_MEMORY;
}

const WORK_ENTRY_CATEGORIZATION_COLUMNS = [
  'category_id INTEGER REFERENCES categories(id)',
  "categorization_status TEXT DEFAULT 'pending'",
  'categorization_source TEXT',
  'categorized_at DATETIME',
  'categorization_model TEXT',
  'prompt_version TEXT'
];

let db = null;
let isClosing = false;
let isClosed = false;

function getDatabase() {
  if (!db) {
    // Reset state when creating a new database connection
    isClosing = false;
    isClosed = false;
    const dbFile = resolveDatabaseFile();
    if (dbFile === IN_MEMORY) {
      if (['production', 'staging'].includes(process.env.NODE_ENV)) {
        console.warn('DB_FILE is not set: using an in-memory database, data will be lost on restart');
      }
    } else {
      fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });
    }
    db = new sqlite3.Database(dbFile, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        throw err;
      }
      console.log(dbFile === IN_MEMORY
        ? 'Connected to SQLite in-memory database'
        : `Connected to SQLite database at ${dbFile}`);
    });
  }
  return db;
}

async function initializeDatabase() {
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

      database.run(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          description TEXT
        )
      `);

      for (const category of CATEGORIES) {
        database.run(
          'INSERT OR IGNORE INTO categories (name, description) VALUES (?, ?)',
          [category.name, category.description]
        );
      }

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
          ${WORK_ENTRY_CATEGORIZATION_COLUMNS.join(',\n          ')},
          FOREIGN KEY (client_id) REFERENCES clients (id) ON DELETE CASCADE,
          FOREIGN KEY (user_email) REFERENCES users (email) ON DELETE CASCADE
        )
      `);

      // Create indexes for better performance
      database.run(`CREATE INDEX IF NOT EXISTS idx_clients_user_email ON clients (user_email)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_work_entries_client_id ON work_entries (client_id)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_work_entries_user_email ON work_entries (user_email)`);
      database.run(`CREATE INDEX IF NOT EXISTS idx_work_entries_date ON work_entries (date)`);

      // Databases created before categorization existed: add the columns in place.
      // "duplicate column name" means the column is already there.
      for (const column of WORK_ENTRY_CATEGORIZATION_COLUMNS) {
        database.run(`ALTER TABLE work_entries ADD COLUMN ${column}`, (err) => {
          if (err && !/duplicate column name/i.test(err.message)) {
            console.error('Error migrating work_entries:', err);
          }
        });
      }

      database.run(
        'CREATE INDEX IF NOT EXISTS idx_work_entries_categorization_status ON work_entries (categorization_status)',
        (err) => {
          if (err) {
            console.error('Error creating database schema:', err);
            return reject(err);
          }
          console.log('Database tables created successfully');
          resolve();
        }
      );
    });
  });
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
  resolveDatabaseFile
};
