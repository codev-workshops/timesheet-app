const WORK_ENTRY_INDEXES = [
  'CREATE INDEX idx_work_entries_client_id ON work_entries (client_id)',
  'CREATE INDEX idx_work_entries_user_email ON work_entries (user_email)',
  'CREATE INDEX idx_work_entries_date ON work_entries (date)'
];

exports.up = async function up(knex) {
  await knex.schema.raw(`
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await knex.schema.raw(
    'ALTER TABLE work_entries ADD COLUMN category_id INTEGER NULL REFERENCES categories (id) ON DELETE SET NULL'
  );
  await knex.schema.raw('CREATE INDEX idx_work_entries_category_id ON work_entries (category_id)');
};

// SQLite cannot DROP a column that is part of a foreign key, so work_entries is rebuilt
// with the 001 schema and its 001 indexes are recreated.
exports.down = async function down(knex) {
  await knex.schema.raw('DROP INDEX IF EXISTS idx_work_entries_category_id');

  await knex.schema.raw(`
    CREATE TABLE work_entries_002_down (
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
  await knex.schema.raw(`
    INSERT INTO work_entries_002_down (id, client_id, user_email, hours, description, date, created_at, updated_at)
    SELECT id, client_id, user_email, hours, description, date, created_at, updated_at FROM work_entries
  `);
  await knex.schema.raw('DROP TABLE work_entries');
  await knex.schema.raw('ALTER TABLE work_entries_002_down RENAME TO work_entries');
  for (const sql of WORK_ENTRY_INDEXES) {
    await knex.schema.raw(sql);
  }

  await knex.schema.dropTableIfExists('categories');
};
