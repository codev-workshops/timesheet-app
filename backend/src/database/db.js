const knex = require('knex');
const config = require('../../knexfile');

const db = knex(config);

async function initializeDatabase() {
  await db.migrate.latest();
}

async function closeDatabase() {
  await db.destroy();
}

module.exports = { db, initializeDatabase, closeDatabase };
