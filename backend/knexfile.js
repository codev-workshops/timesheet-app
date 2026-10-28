const path = require('path');

const baseConfig = {
  client: 'sqlite3',
  connection: {
    filename: process.env.DATABASE_PATH || ':memory:'
  },
  useNullAsDefault: true,
  pool: {
    // Foreign key enforcement is per-connection in SQLite
    afterCreate: (conn, done) => conn.run('PRAGMA foreign_keys = ON', done)
  },
  migrations: {
    directory: path.join(__dirname, 'src', 'database', 'migrations'),
    tableName: 'knex_migrations'
  }
};

module.exports = {
  development: baseConfig,
  test: baseConfig,
  production: baseConfig
};
