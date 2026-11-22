const { authenticateUser } = require('../../middleware/auth');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');

describe('Authentication Middleware - edge cases', () => {
  let req, res, next, mockDb;

  const authenticate = (email) => {
    req.headers['x-user-email'] = email;
    authenticateUser(req, res, next);
  };

  beforeEach(() => {
    req = { headers: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
    mockDb = {
      get: jest.fn((query, params, callback) => callback(null, { email: params[0] })),
      run: jest.fn((query, params, callback) => callback(null))
    };
    getDatabase.mockReturnValue(mockDb);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('missing header', () => {
    test('treats an empty header as missing', () => {
      authenticate('');

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
      expect(getDatabase).not.toHaveBeenCalled();
    });

    test('ignores an email supplied under a different header name', () => {
      req.headers['x-user'] = 'test@example.com';
      req.headers.authorization = 'test@example.com';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('invalid email formats', () => {
    test.each([
      ['leading whitespace', ' test@example.com'],
      ['trailing whitespace', 'test@example.com '],
      ['inner whitespace', 'te st@example.com'],
      ['tab character', 'test@example.com\t'],
      ['newline injection', 'test@example.com\nX-Admin: true'],
      ['two @ signs', 'a@b@example.com'],
      ['missing local part', '@example.com'],
      ['empty TLD', 'test@example.'],
      ['only whitespace', '   '],
      ['comma separated list from duplicate headers', 'a@example.com, b@example.com']
    ])('rejects %s with 400 without querying the database', (label, email) => {
      authenticate(email);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid email format' });
      expect(next).not.toHaveBeenCalled();
      expect(req.userEmail).toBeUndefined();
      expect(getDatabase).not.toHaveBeenCalled();
    });

    test('rejects an array of header values', () => {
      authenticate(['a@example.com', 'b@example.com']);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('accepted email formats', () => {
    test.each([
      ['plus addressing', 'user+tag@example.com'],
      ['dots and hyphens', 'first.last@my-company.co.uk'],
      ['single-character parts', 'a@b.c'],
      ['apostrophe', "o'brien@example.com"],
      ['unicode', 'üser@exämple.com'],
      ['very long address', `${'a'.repeat(200)}@example.com`]
    ])('accepts %s', (label, email) => {
      authenticate(email);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.userEmail).toBe(email);
      expect(res.status).not.toHaveBeenCalled();
    });

    test('does not normalize case', () => {
      authenticate('Test.User@Example.COM');

      expect(mockDb.get.mock.calls[0][1]).toEqual(['Test.User@Example.COM']);
      expect(req.userEmail).toBe('Test.User@Example.COM');
    });

    test('passes SQL-like characters as a bound parameter', () => {
      const email = "x'or'1'='1@example.com";

      authenticate(email);

      expect(mockDb.get).toHaveBeenCalledWith('SELECT email FROM users WHERE email = ?', [email], expect.any(Function));
      expect(req.userEmail).toBe(email);
    });
  });

  describe('user lookup and creation', () => {
    test('does not insert when the user already exists', () => {
      authenticate('existing@example.com');

      expect(mockDb.run).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    test.each([
      ['undefined', undefined],
      ['null', null]
    ])('creates the user when the lookup returns %s', (label, row) => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, row));

      authenticate('new@example.com');

      expect(mockDb.run).toHaveBeenCalledWith('INSERT INTO users (email) VALUES (?)', ['new@example.com'], expect.any(Function));
      expect(next).toHaveBeenCalledTimes(1);
    });

    test('does not set userEmail when the lookup fails', () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(new Error('SQLITE_BUSY')));

      authenticate('test@example.com');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(req.userEmail).toBeUndefined();
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('does not set userEmail when creating the user fails', () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));
      mockDb.run.mockImplementation((query, params, callback) => callback(new Error('SQLITE_FULL')));

      authenticate('new@example.com');

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Failed to create user' });
      expect(req.userEmail).toBeUndefined();
      expect(next).not.toHaveBeenCalled();
    });

    test('calls next exactly once and sends no response on success', () => {
      authenticate('test@example.com');

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith();
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});

describe('Authentication Middleware - edge cases with real SQLite', () => {
  let realInit;

  const authenticateAsync = (email) => new Promise((resolve) => {
    const req = { headers: { 'x-user-email': email } };
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ status: this.statusCode, body });
      }
    };
    realAuth(req, res, () => resolve({ status: 'next', userEmail: req.userEmail }));
  });
  const countUsers = (email) => new Promise((resolve, reject) => {
    realInit.getDatabase().get('SELECT COUNT(*) AS count FROM users WHERE email = ?', [email], (err, row) => (
      err ? reject(err) : resolve(row.count)
    ));
  });
  let realAuth;

  beforeEach(async () => {
    jest.resetModules();
    jest.unmock('sqlite3');
    jest.unmock('../../database/init');
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    realInit = require('../../database/init');
    realAuth = require('../../middleware/auth').authenticateUser;
    await realInit.initializeDatabase();
  });

  afterEach(async () => {
    await realInit.closeDatabase();
    jest.restoreAllMocks();
  });

  test('creates the user once across sequential first requests', async () => {
    expect(await authenticateAsync('new@example.com')).toEqual({ status: 'next', userEmail: 'new@example.com' });
    expect(await authenticateAsync('new@example.com')).toEqual({ status: 'next', userEmail: 'new@example.com' });
    expect(await countUsers('new@example.com')).toBe(1);
  });

  test('treats emails differing only by case as separate users', async () => {
    await authenticateAsync('Case@example.com');
    await authenticateAsync('case@example.com');

    expect(await countUsers('Case@example.com')).toBe(1);
    expect(await countUsers('case@example.com')).toBe(1);
  });

  // Known bug: both requests see no user, then the second INSERT hits the
  // users.email primary key and the request fails with 500.
  test.failing('authenticates concurrent first requests for the same new email', async () => {
    const results = await Promise.all([
      authenticateAsync('race@example.com'),
      authenticateAsync('race@example.com')
    ]);

    expect(results).toEqual([
      { status: 'next', userEmail: 'race@example.com' },
      { status: 'next', userEmail: 'race@example.com' }
    ]);
  });
});
