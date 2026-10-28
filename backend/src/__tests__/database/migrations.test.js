jest.unmock('sqlite3');

const Knex = require('knex');
const knexConfig = require('../../../knexfile');

async function tableNames(knex) {
  const rows = await knex.raw("SELECT name FROM sqlite_master WHERE type = 'table'");
  return rows.map((r) => r.name);
}

async function indexNames(knex, table) {
  const rows = await knex.raw(`PRAGMA index_list(${table})`);
  return rows.map((r) => r.name);
}

async function columnNames(knex, table) {
  const rows = await knex.raw(`PRAGMA table_info(${table})`);
  return rows.map((r) => r.name);
}

describe('Database migrations', () => {
  let knex;

  beforeEach(() => {
    knex = Knex({ ...knexConfig.test, connection: { filename: ':memory:' } });
  });

  afterEach(async () => {
    await knex.destroy();
  });

  test('migrate.latest builds projects and work_entries.project_id on a fresh DB', async () => {
    await knex.migrate.latest();

    expect(await tableNames(knex)).toEqual(expect.arrayContaining([
      'users', 'clients', 'work_entries', 'projects'
    ]));

    const projectColumns = await knex.raw('PRAGMA table_info(projects)');
    const byName = Object.fromEntries(projectColumns.map((c) => [c.name, c]));
    expect(Object.keys(byName)).toEqual([
      'id', 'name', 'description', 'client_id', 'start_date', 'end_date', 'status', 'created_at', 'updated_at'
    ]);
    expect(byName.name.notnull).toBe(1);
    expect(byName.client_id.notnull).toBe(1);
    expect(byName.status.dflt_value).toBe("'active'");
    expect(byName.created_at.dflt_value).toBe('CURRENT_TIMESTAMP');

    const projectFks = await knex.raw('PRAGMA foreign_key_list(projects)');
    expect(projectFks).toEqual([
      expect.objectContaining({ table: 'clients', from: 'client_id', to: 'id', on_delete: 'CASCADE' })
    ]);
    expect(await indexNames(knex, 'projects')).toContain('idx_projects_client_id');

    const workEntryColumns = await knex.raw('PRAGMA table_info(work_entries)');
    const projectId = workEntryColumns.find((c) => c.name === 'project_id');
    expect(projectId).toBeDefined();
    expect(projectId.notnull).toBe(0);
    expect(await indexNames(knex, 'work_entries')).toContain('idx_work_entries_project_id');
  });

  test('foreign keys are enforced and project deletion nulls work_entries.project_id', async () => {
    await knex.migrate.latest();

    await knex('users').insert({ email: 'a@example.com' });
    const [clientId] = await knex('clients').insert({ name: 'Acme', user_email: 'a@example.com' });
    const [projectId] = await knex('projects').insert({ name: 'Website', client_id: clientId });
    const [entryId] = await knex('work_entries').insert({
      client_id: clientId, user_email: 'a@example.com', hours: 2, date: '2026-01-01', project_id: projectId
    });

    await expect(knex('projects').insert({ name: 'Orphan', client_id: 9999 }))
      .rejects.toThrow(/FOREIGN KEY constraint failed/);

    await knex('projects').where({ id: projectId }).del();
    const entry = await knex('work_entries').where({ id: entryId }).first();
    expect(entry.project_id).toBeNull();

    await knex('clients').where({ id: clientId }).del();
    expect(await knex('work_entries').count({ n: '*' })).toEqual([{ n: 0 }]);
  });

  test('migrate.rollback removes projects and project_id but keeps baseline tables and data', async () => {
    await knex.migrate.latest();

    await knex('users').insert({ email: 'a@example.com' });
    const [clientId] = await knex('clients').insert({ name: 'Acme', user_email: 'a@example.com' });
    await knex('work_entries').insert({
      client_id: clientId, user_email: 'a@example.com', hours: 1.5, description: 'Work', date: '2026-01-02'
    });

    await knex.migrate.rollback();

    const tables = await tableNames(knex);
    expect(tables).not.toContain('projects');
    expect(tables).not.toContain('work_entries_old');
    expect(tables).toEqual(expect.arrayContaining(['users', 'clients', 'work_entries']));

    expect(await columnNames(knex, 'work_entries')).toEqual([
      'id', 'client_id', 'user_email', 'hours', 'description', 'date', 'created_at', 'updated_at'
    ]);
    expect(await indexNames(knex, 'work_entries')).toEqual(expect.arrayContaining([
      'idx_work_entries_client_id', 'idx_work_entries_user_email', 'idx_work_entries_date'
    ]));
    expect(await indexNames(knex, 'work_entries')).not.toContain('idx_work_entries_project_id');

    const fks = await knex.raw('PRAGMA foreign_key_list(work_entries)');
    expect(fks).toHaveLength(2);
    expect(fks).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'clients', from: 'client_id', on_delete: 'CASCADE' }),
      expect.objectContaining({ table: 'users', from: 'user_email', on_delete: 'CASCADE' })
    ]));

    const rows = await knex('work_entries').select('client_id', 'hours', 'description', 'date');
    expect(rows).toEqual([{ client_id: clientId, hours: 1.5, description: 'Work', date: '2026-01-02' }]);

    await knex.migrate.latest();
    expect(await columnNames(knex, 'work_entries')).toContain('project_id');
    expect(await tableNames(knex)).toContain('projects');
  });

  test('migrations can be stepped down one at a time', async () => {
    await knex.migrate.latest();

    await knex.migrate.down();
    expect(await columnNames(knex, 'work_entries')).not.toContain('project_id');
    expect(await tableNames(knex)).toContain('projects');

    await knex.migrate.down();
    expect(await tableNames(knex)).not.toContain('projects');
  });
});
