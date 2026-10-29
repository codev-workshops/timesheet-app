const path = require('path');

module.exports = {
  client: 'sqlite3',
  connection: { filename: ':memory:' },
  useNullAsDefault: true,
  pool: { min: 1, max: 1 },
  migrations: { directory: path.join(__dirname, 'src', 'database', 'migrations') }
};
