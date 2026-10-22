// Guards the global sqlite3 mock from setup.js; Stryker's Jest workers must load it too.
describe('global sqlite3 mock', () => {
  test('sqlite3 is replaced by the jest mock from setup.js', () => {
    const sqlite3 = require('sqlite3');

    expect(jest.isMockFunction(sqlite3.verbose)).toBe(true);
    const { Database } = sqlite3.verbose();
    expect(jest.isMockFunction(Database)).toBe(true);
  });
});
