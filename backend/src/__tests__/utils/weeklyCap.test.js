const { getWeekBounds, checkWeeklyCap, capExceededMessage, toDateMs } = require('../../utils/weeklyCap');

describe('weeklyCap utils', () => {
  describe('getWeekBounds', () => {
    const monday = Date.UTC(2024, 0, 15);
    const nextMonday = Date.UTC(2024, 0, 22);

    test('returns Monday..next Monday for a midweek date', () => {
      expect(getWeekBounds(new Date('2024-01-17'))).toEqual({ start: monday, end: nextMonday });
    });

    test('Monday belongs to its own week', () => {
      expect(getWeekBounds(new Date('2024-01-15'))).toEqual({ start: monday, end: nextMonday });
    });

    test('Sunday is the last day of the week', () => {
      expect(getWeekBounds(new Date('2024-01-21'))).toEqual({ start: monday, end: nextMonday });
    });

    test('the following Monday starts a new week', () => {
      expect(getWeekBounds(new Date('2024-01-22'))).toEqual({ start: nextMonday, end: Date.UTC(2024, 0, 29) });
    });

    test('accepts epoch milliseconds as stored in the database', () => {
      expect(getWeekBounds(Date.UTC(2024, 0, 17))).toEqual({ start: monday, end: nextMonday });
    });

    test('handles weeks spanning a year boundary', () => {
      // Mon 2024-12-30 .. Sun 2025-01-05
      expect(getWeekBounds(new Date('2025-01-02'))).toEqual({
        start: Date.UTC(2024, 11, 30),
        end: Date.UTC(2025, 0, 6)
      });
    });

    test('handles weeks spanning a month boundary', () => {
      expect(getWeekBounds(new Date('2024-02-01'))).toEqual({
        start: Date.UTC(2024, 0, 29),
        end: Date.UTC(2024, 1, 5)
      });
    });
  });

  describe('toDateMs', () => {
    test('converts Date objects, ISO strings and numbers to epoch ms', () => {
      expect(toDateMs(new Date('2024-01-17'))).toBe(Date.UTC(2024, 0, 17));
      expect(toDateMs('2024-01-17')).toBe(Date.UTC(2024, 0, 17));
      expect(toDateMs(Date.UTC(2024, 0, 17))).toBe(Date.UTC(2024, 0, 17));
    });
  });

  describe('checkWeeklyCap', () => {
    const base = { userEmail: 'u@example.com', clientId: 3, date: new Date('2024-01-17'), hours: 5 };
    let db;

    beforeEach(() => {
      db = { get: jest.fn() };
    });

    test('skips the query and passes when cap is null', (done) => {
      checkWeeklyCap(db, { ...base, cap: null }, (err, result) => {
        expect(err).toBeNull();
        expect(result.ok).toBe(true);
        expect(db.get).not.toHaveBeenCalled();
        done();
      });
    });

    test('treats undefined cap like null (no cap)', (done) => {
      checkWeeklyCap(db, { ...base, cap: undefined }, (err, result) => {
        expect(result.ok).toBe(true);
        expect(db.get).not.toHaveBeenCalled();
        done();
      });
    });

    test('queries the week scoped by user and client', (done) => {
      db.get.mockImplementation((q, params, cb) => cb(null, { total: 10 }));

      checkWeeklyCap(db, { ...base, cap: 40 }, (err, result) => {
        expect(db.get).toHaveBeenCalledWith(
          expect.stringContaining('user_email = ? AND client_id = ? AND date >= ? AND date < ?'),
          ['u@example.com', 3, Date.UTC(2024, 0, 15), Date.UTC(2024, 0, 22)],
          expect.any(Function)
        );
        expect(result).toEqual({ ok: true, total: 15, cap: 40 });
        done();
      });
    });

    test('appends an exclusion clause when excludeEntryId is provided', (done) => {
      db.get.mockImplementation((q, params, cb) => cb(null, { total: 0 }));

      checkWeeklyCap(db, { ...base, cap: 40, excludeEntryId: 9 }, () => {
        const [query, params] = db.get.mock.calls[0];
        expect(query).toContain('AND id != ?');
        expect(params[4]).toBe(9);
        done();
      });
    });

    test('fails when the projected total exceeds the cap', (done) => {
      db.get.mockImplementation((q, params, cb) => cb(null, { total: 36 }));

      checkWeeklyCap(db, { ...base, cap: 40 }, (err, result) => {
        expect(result).toEqual({ ok: false, total: 41, cap: 40 });
        done();
      });
    });

    test('passes when the projected total equals the cap', (done) => {
      db.get.mockImplementation((q, params, cb) => cb(null, { total: 35 }));

      checkWeeklyCap(db, { ...base, cap: 40 }, (err, result) => {
        expect(result.ok).toBe(true);
        done();
      });
    });

    test('rounds floating point sums to two decimals', (done) => {
      db.get.mockImplementation((q, params, cb) => cb(null, { total: 39.9 }));

      checkWeeklyCap(db, { ...base, hours: 0.1, cap: 40 }, (err, result) => {
        expect(result.ok).toBe(true);
        expect(result.total).toBe(40);
        done();
      });
    });

    test('allows an update that does not increase the entry\'s contribution even when the week is over cap', (done) => {
      checkWeeklyCap(db, { ...base, hours: 4, cap: 40, excludeEntryId: 1, previousHours: 8 }, (err, result) => {
        expect(result.ok).toBe(true);
        expect(db.get).not.toHaveBeenCalled();
        done();
      });
    });

    test('still checks the cap when an update increases the entry\'s contribution', (done) => {
      db.get.mockImplementation((q, params, cb) => cb(null, { total: 36 }));

      checkWeeklyCap(db, { ...base, hours: 9, cap: 40, excludeEntryId: 1, previousHours: 8 }, (err, result) => {
        expect(result).toEqual({ ok: false, total: 45, cap: 40 });
        done();
      });
    });

    test('propagates database errors', (done) => {
      db.get.mockImplementation((q, params, cb) => cb(new Error('boom')));

      checkWeeklyCap(db, { ...base, cap: 40 }, (err) => {
        expect(err).toEqual(new Error('boom'));
        done();
      });
    });
  });

  describe('capExceededMessage', () => {
    test('formats whole and fractional hours', () => {
      expect(capExceededMessage(43, 40)).toBe(
        'Weekly hours cap exceeded: this entry would bring the week to 43h for this client (cap 40h)'
      );
      expect(capExceededMessage(40.5, 37.25)).toContain('40.5h');
      expect(capExceededMessage(40.5, 37.25)).toContain('cap 37.25h');
    });

    test('does not leave a dangling decimal point for near-integer values', () => {
      expect(capExceededMessage(40.004, 40.001)).toBe(
        'Weekly hours cap exceeded: this entry would bring the week to 40h for this client (cap 40h)'
      );
    });
  });
});
