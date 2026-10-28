exports.up = async function up(knex) {
  await knex.schema.createTable('projects', (table) => {
    table.increments('id');
    table.text('name').notNullable();
    table.text('description');
    table.integer('client_id').notNullable()
      .references('id').inTable('clients').onDelete('CASCADE');
    table.date('start_date');
    table.date('end_date');
    table.text('status').defaultTo('active');
    table.datetime('created_at').defaultTo(knex.fn.now());
    table.datetime('updated_at').defaultTo(knex.fn.now());
    table.index(['client_id'], 'idx_projects_client_id');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTable('projects');
};
