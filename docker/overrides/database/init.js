const sqlite3 = require('sqlite3').verbose();
const Knex = require('knex');
const Client_SQLite3 = require('knex/lib/dialects/sqlite3');
const knexConfig = require('../../knexfile');
const path = require('path');
const fs = require('fs');

let db = null;
let isClosing = false;
let isClosed = false;

function getDatabase() {
  if (!db) {
    // Reset state when creating a new database connection
    isClosing = false;
    isClosed = false;
    // Use file-based database in production, in-memory for development/testing
    const dbPath = process.env.DATABASE_PATH || ':memory:';
    
    // Ensure the directory exists for file-based database
    if (dbPath !== ':memory:') {
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
      const dbType = dbPath === ':memory:' ? 'in-memory' : `file: ${dbPath}`;
      console.log(`Connected to SQLite database (${dbType})`);
    });
  }
  return db;
}

// Knex client that reuses the shared sqlite3 handle so migrations and routes
// see the same database (each new ':memory:' connection is a separate DB).
class SharedConnectionClient extends Client_SQLite3 {
  acquireRawConnection() {
    return Promise.resolve(getDatabase());
  }

  // The shared handle is owned by closeDatabase()
  async destroyRawConnection() {}
}

async function initializeDatabase() {
  const env = process.env.NODE_ENV || 'development';
  const config = knexConfig[env] || knexConfig.development;
  const knex = Knex({
    ...config,
    client: SharedConnectionClient,
    pool: { ...config.pool, min: 1, max: 1 }
  });

  try {
    await knex.migrate.latest();
    console.log('Database migrations applied successfully');
  } finally {
    await knex.destroy();
  }
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
