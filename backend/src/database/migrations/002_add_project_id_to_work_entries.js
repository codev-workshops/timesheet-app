// project_id is nullable for now (phased rollout); a follow-up migration will
// backfill and enforce NOT NULL.

exports.up = async function up(knex) {
  await knex.schema.alterTable('work_entries', (table) => {
    table.integer('project_id').nullable()
      .references('id').inTable('projects').onDelete('SET NULL');
    table.index(['project_id'], 'idx_work_entries_project_id');
  });
};

// SQLite cannot reliably drop a column that carries an FK and index, so the
// table is rebuilt without project_id.
exports.down = async function down(knex) {
  await knex.transaction(async (trx) => {
    await trx.raw('DROP INDEX IF EXISTS idx_work_entries_project_id');
    await trx.raw('ALTER TABLE work_entries RENAME TO work_entries_old');
    await trx.raw(`
      CREATE TABLE work_entries (
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
    await trx.raw(`
      INSERT INTO work_entries (id, client_id, user_email, hours, description, date, created_at, updated_at)
      SELECT id, client_id, user_email, hours, description, date, created_at, updated_at
      FROM work_entries_old
    `);
    await trx.raw('DROP TABLE work_entries_old');
    await trx.raw('CREATE INDEX IF NOT EXISTS idx_work_entries_client_id ON work_entries (client_id)');
    await trx.raw('CREATE INDEX IF NOT EXISTS idx_work_entries_user_email ON work_entries (user_email)');
    await trx.raw('CREATE INDEX IF NOT EXISTS idx_work_entries_date ON work_entries (date)');
  });
};
