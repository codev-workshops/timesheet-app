const { EventEmitter } = require('events');
const { acquire, lockUntilResponse } = require('../../utils/keyedLock');

const flush = () => new Promise((resolve) => setImmediate(resolve));

const mockRes = () => {
  const res = new EventEmitter();
  res.writableEnded = false;
  res.headersSent = false;
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => {
    res.headersSent = true;
    res.writableEnded = true;
    res.emit('finish');
    return res;
  });
  return res;
};

describe('keyedLock', () => {
  test('acquire runs holders of the same key one at a time, in order', async () => {
    const order = [];
    const first = acquire('k');
    const second = acquire('k');

    const releaseFirst = await first;
    order.push('first');
    second.then(() => order.push('second'));
    await flush();
    expect(order).toEqual(['first']);

    releaseFirst();
    (await second)();
    expect(order).toEqual(['first', 'second']);
  });

  test('different keys do not block each other', async () => {
    const releaseA = await acquire('a');
    const releaseB = await acquire('b');
    releaseA();
    releaseB();
  });

  test('releasing twice is a no-op', async () => {
    const release = await acquire('twice');
    release();
    release();
    (await acquire('twice'))();
  });

  test('lockUntilResponse holds the lock until the response finishes', async () => {
    const res1 = mockRes();
    const res2 = mockRes();
    const fn1 = jest.fn();
    const fn2 = jest.fn();

    lockUntilResponse('user', res1, fn1);
    lockUntilResponse('user', res2, fn2);
    await flush();
    expect(fn1).toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();

    res1.emit('finish');
    await flush();
    expect(fn2).toHaveBeenCalled();
    res2.emit('finish');
  });

  test('an aborted response (close without finish) releases the lock', async () => {
    const res1 = mockRes();
    const fn2 = jest.fn();

    lockUntilResponse('aborted', res1, jest.fn());
    lockUntilResponse('aborted', mockRes(), fn2);
    await flush();

    res1.emit('close');
    await flush();
    expect(fn2).toHaveBeenCalled();
  });

  test('skips the work if the response already ended while waiting', async () => {
    const res = mockRes();
    res.writableEnded = true;
    const fn = jest.fn();

    lockUntilResponse('ended', res, fn);
    await flush();
    expect(fn).not.toHaveBeenCalled();

    const next = jest.fn();
    lockUntilResponse('ended', mockRes(), next);
    await flush();
    expect(next).toHaveBeenCalled();
  });

  test('a synchronous throw responds 500 and releases the lock', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    const next = jest.fn();

    lockUntilResponse('throws', res, () => { throw new Error('boom'); });
    lockUntilResponse('throws', mockRes(), next);
    await flush();
    await flush();

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    expect(next).toHaveBeenCalled();
    console.error.mockRestore();
  });
});
