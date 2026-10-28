// Baseline of the schema that predates migrations. Guarded with hasTable /
// IF NOT EXISTS so it is a no-op on databases that were already initialized.

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', (table) => {
      table.text('email').primary();
      table.datetime('created_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable('clients'))) {
    await knex.schema.createTable('clients', (table) => {
      table.increments('id');
      table.text('name').notNullable();
      table.text('description');
      table.text('department');
      table.text('email');
      table.text('user_email').notNullable()
        .references('email').inTable('users').onDelete('CASCADE');
      table.datetime('created_at').defaultTo(knex.fn.now());
      table.datetime('updated_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable('work_entries'))) {
    await knex.schema.createTable('work_entries', (table) => {
      table.increments('id');
      table.integer('client_id').notNullable()
        .references('id').inTable('clients').onDelete('CASCADE');
      table.text('user_email').notNullable()
        .references('email').inTable('users').onDelete('CASCADE');
      table.decimal('hours', 5, 2).notNullable();
      table.text('description');
      table.date('date').notNullable();
      table.datetime('created_at').defaultTo(knex.fn.now());
      table.datetime('updated_at').defaultTo(knex.fn.now());
    });
  }

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_clients_user_email ON clients (user_email)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_work_entries_client_id ON work_entries (client_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_work_entries_user_email ON work_entries (user_email)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_work_entries_date ON work_entries (date)');
};

// Intentionally irreversible: rolling back the baseline must never drop
// tables that may hold pre-migration data.
exports.down = async function down() {};
