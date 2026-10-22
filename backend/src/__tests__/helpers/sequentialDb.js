/**
 * Mock DB whose callbacks succeed until the `failAt`-th call (1-based), which
 * receives `error`. Records every call in order as [method, query, params].
 */
function createSequentialDb({ failAt = null, error = new Error('Database error'), rows = {} } = {}) {
  const calls = [];
  const getRow = 'get' in rows ? rows.get : { id: 1 };
  const allRows = 'all' in rows ? rows.all : [];

  const respond = (method) => jest.fn((query, params, callback) => {
    calls.push([method, query, params]);
    const failing = calls.length === failAt;
    if (method === 'run') {
      callback.call({ lastID: 5, changes: 2 }, failing ? error : null);
    } else if (method === 'all') {
      callback(failing ? error : null, failing ? null : allRows);
    } else {
      callback(failing ? error : null, failing ? null : getRow);
    }
  });

  return { get: respond('get'), all: respond('all'), run: respond('run'), calls };
}

module.exports = { createSequentialDb };
