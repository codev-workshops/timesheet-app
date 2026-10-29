// Replace the production Knex instance with a fresh in-memory one per test file.
// The factory is resolved from this file so the mock applies to every suite.
jest.mock(require.resolve('../database/db'), () => {
  const knex = require('knex');
  const config = require('../../knexfile');
  const db = knex({ ...config, connection: { filename: ':memory:' } });
  return {
    db,
    initializeDatabase: async () => { await db.migrate.latest(); },
    closeDatabase: async () => { await db.destroy(); }
  };
});

const { db } = require('../database/db');

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await db.destroy();
});
