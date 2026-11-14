const TEST_SECRET = 'test-jwt-secret-with-at-least-32-characters';
process.env.JWT_SECRET = TEST_SECRET;

const jwt = require('jsonwebtoken');
const { authenticateUser, getJwtSecret, assertJwtConfig } = require('../../middleware/auth');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');

describe('Authentication Middleware', () => {
  let req;
  let res;
  let next;
  let mockDb;

  const signToken = (email, secret = TEST_SECRET, options = {}) => jwt.sign(
    { sub: email },
    secret,
    {
      algorithm: 'HS256',
      issuer: 'timesheet-app',
      audience: 'timesheet-app',
      ...options
    }
  );

  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
    process.env.NODE_ENV = 'test';
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    mockDb = {
      get: jest.fn(),
      run: jest.fn()
    };
    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('rejects requests without Authorization', () => {
    authenticateUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
    expect(mockDb.get).not.toHaveBeenCalled();
  });

  test('does not accept x-user-email as identity', () => {
    req.headers['x-user-email'] = 'victim@example.com';

    authenticateUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(mockDb.get).not.toHaveBeenCalled();
  });

  test.each(['Bearer', 'Basic token', 'bearer ', 'Bearer first second'])(
    'rejects malformed or non-Bearer Authorization value %s',
    (authorization) => {
      req.headers.authorization = authorization;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockDb.get).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    }
  );

  test('rejects a token signed with another secret', () => {
    req.headers.authorization = `Bearer ${signToken('user@example.com', 'another-secret-value-that-is-long-enough')}`;

    authenticateUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(mockDb.get).not.toHaveBeenCalled();
  });

  test('rejects an expired token', () => {
    req.headers.authorization = `Bearer ${signToken('user@example.com', TEST_SECRET, { expiresIn: -1 })}`;

    authenticateUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });

  test('rejects an unsigned alg none token', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'user@example.com' })).toString('base64url');
    req.headers.authorization = `Bearer ${header}.${payload}.`;

    authenticateUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockDb.get).not.toHaveBeenCalled();
  });

  test('rejects a token with the wrong audience', () => {
    req.headers.authorization = `Bearer ${signToken(
      'user@example.com',
      TEST_SECRET,
      { audience: 'another-app' }
    )}`;

    authenticateUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockDb.get).not.toHaveBeenCalled();
  });

  test('sets req.userEmail and calls next for a valid token and existing user', () => {
    req.headers.authorization = `Bearer ${signToken('user@example.com')}`;
    mockDb.get.mockImplementation((query, params, callback) => {
      callback(null, { email: 'user@example.com' });
    });

    authenticateUser(req, res, next);

    expect(mockDb.get).toHaveBeenCalledWith(
      'SELECT email FROM users WHERE email = ?',
      ['user@example.com'],
      expect.any(Function)
    );
    expect(req.userEmail).toBe('user@example.com');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('rejects a valid token when its user no longer exists without creating one', () => {
    req.headers.authorization = `Bearer ${signToken('missing@example.com')}`;
    mockDb.get.mockImplementation((query, params, callback) => callback(null, null));

    authenticateUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 500 when the user lookup fails', () => {
    req.headers.authorization = `Bearer ${signToken('user@example.com')}`;
    mockDb.get.mockImplementation((query, params, callback) => callback(new Error('database')));

    authenticateUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects missing and short JWT secrets in production', () => {
    const originalSecret = process.env.JWT_SECRET;
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      delete process.env.JWT_SECRET;
      jest.isolateModules(() => {
        const auth = require('../../middleware/auth');
        expect(() => auth.getJwtSecret()).toThrow(/JWT_SECRET/);
        expect(() => auth.assertJwtConfig()).toThrow(/JWT_SECRET/);
      });

      process.env.JWT_SECRET = 'too-short';
      jest.isolateModules(() => {
        const auth = require('../../middleware/auth');
        expect(() => auth.getJwtSecret()).toThrow(/JWT_SECRET/);
        expect(() => auth.assertJwtConfig()).toThrow(/JWT_SECRET/);
      });
    } finally {
      process.env.JWT_SECRET = originalSecret;
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
