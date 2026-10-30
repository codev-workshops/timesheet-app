// In-process mutex keyed by string. All requests share one SQLite connection, so a DB
// transaction cannot isolate one request's read-check-write from another's; serializing
// the critical section per key does.
const tails = new Map();

function acquire(key) {
  const previous = tails.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  tails.set(key, tail);

  return previous.then(() => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      release();
      if (tails.get(key) === tail) tails.delete(key);
    };
  });
}

// Runs `fn` once `key` is free and holds the lock until the response is finished or aborted,
// so every response path (success, 4xx, 5xx, errorHandler) releases it.
function lockUntilResponse(key, res, fn) {
  acquire(key).then((release) => {
    res.once('finish', release);
    res.once('close', release);
    if (res.writableEnded) return release();
    try {
      fn();
    } catch (err) {
      console.error('Unhandled error while holding lock:', err);
      release();
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
  });
}

module.exports = { acquire, lockUntilResponse };
