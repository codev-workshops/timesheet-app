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

const DEMO_USERS = ['pm@example.com', 'emp1@example.com', 'emp2@example.com', 'outsider@example.com'];

const DEMO_MANAGER_EMPLOYEES = [
  ['pm@example.com', 'emp1@example.com'],
  ['pm@example.com', 'emp2@example.com']
];

// [name, description, department, user_email]
const DEMO_CLIENTS = [
  ['Acme Corp', 'Website redesign', 'Engineering', 'emp1@example.com'],
  ['Globex', 'Data migration', 'Engineering', 'emp1@example.com'],
  ['Acme Corp', 'Website redesign', 'Engineering', 'emp2@example.com'],
  ['Initech', 'TPS report automation', 'Operations', 'emp2@example.com'],
  ['Acme Corp', 'Unmanaged user work', 'Sales', 'outsider@example.com']
];

// [user_email, client_name, hours, description, date]
const DEMO_WORK_ENTRIES = [
  ['emp1@example.com', 'Acme Corp', 6, 'Homepage wireframes', '2026-09-07'],
  ['emp1@example.com', 'Globex', 2, 'Schema review', '2026-09-08'],
  ['emp1@example.com', 'Acme Corp', 4, 'Design review', '2026-09-09'],
  ['emp1@example.com', 'Acme Corp', 5, 'Component build', '2026-09-15'],
  ['emp1@example.com', 'Acme Corp', 7, 'Checkout flow', '2026-10-05'],
  ['emp1@example.com', 'Globex', 4, 'Migration dry run', '2026-10-06'],
  ['emp1@example.com', 'Acme Corp', 3.5, 'Bug fixes', '2026-10-14'],
  ['emp2@example.com', 'Acme Corp', 3, 'Content audit', '2026-09-08'],
  ['emp2@example.com', 'Initech', 8, 'Report generator', '2026-09-10'],
  ['emp2@example.com', 'Acme Corp', 6, 'SEO pass', '2026-09-16'],
  ['emp2@example.com', 'Acme Corp', 5, 'Accessibility fixes', '2026-10-07'],
  ['emp2@example.com', 'Initech', 2.5, 'Stakeholder demo', '2026-10-13'],
  ['emp2@example.com', 'Initech', 4, 'Cover sheet export', '2026-10-20'],
  ['outsider@example.com', 'Acme Corp', 9, 'Not visible to pm@example.com', '2026-09-08'],
  ['outsider@example.com', 'Acme Corp', 9, 'Not visible to pm@example.com', '2026-10-07']
];

function placeholders(rowCount, columnCount) {
  const row = `(${new Array(columnCount).fill('?').join(', ')})`;
  return new Array(rowCount).fill(row).join(', ');
}

// Demo data for the manager team reports. Each table is only seeded when it is empty.
function seedDemoData(database) {
  database.run(
    `INSERT OR IGNORE INTO users (email) VALUES ${placeholders(DEMO_USERS.length, 1)}`,
    DEMO_USERS
  );

  database.run(
    `INSERT INTO clients (name, description, department, user_email)
     SELECT column1, column2, column3, column4
     FROM (VALUES ${placeholders(DEMO_CLIENTS.length, 4)})
     WHERE NOT EXISTS (SELECT 1 FROM clients)`,
    DEMO_CLIENTS.flat()
  );

  database.run(
    `INSERT INTO work_entries (client_id, user_email, hours, description, date)
     SELECT c.id, v.column1, v.column3, v.column4, v.column5
     FROM (VALUES ${placeholders(DEMO_WORK_ENTRIES.length, 5)}) v
     JOIN clients c ON c.user_email = v.column1 AND c.name = v.column2
     WHERE NOT EXISTS (SELECT 1 FROM work_entries)`,
    DEMO_WORK_ENTRIES.flat()
  );

  database.run(
    `INSERT INTO manager_employees (manager_email, employee_email)
     SELECT column1, column2
     FROM (VALUES ${placeholders(DEMO_MANAGER_EMPLOYEES.length, 2)})
     WHERE NOT EXISTS (SELECT 1 FROM manager_employees)`,
    DEMO_MANAGER_EMPLOYEES.flat()
  );
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

      // Create manager_employees table (manager -> employee reporting lines)
      database.run(`
        CREATE TABLE IF NOT EXISTS manager_employees (
          manager_email TEXT NOT NULL,
          employee_email TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (manager_email, employee_email),
          FOREIGN KEY (manager_email) REFERENCES users(email) ON DELETE CASCADE,
          FOREIGN KEY (employee_email) REFERENCES users(email) ON DELETE CASCADE
        )
      `);
      database.run(`CREATE INDEX IF NOT EXISTS idx_manager_employees_manager ON manager_employees (manager_email)`);

      if (process.env.NODE_ENV !== 'production') {
        seedDemoData(database);
      }

      console.log('Database tables created successfully');
      resolve();
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
  closeDatabase
};
