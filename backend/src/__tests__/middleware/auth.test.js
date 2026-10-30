const jwt = require('jsonwebtoken');
const { authenticateUser, issueToken } = require('../../middleware/auth');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');

describe('Authentication Middleware', () => {
  let req, res, next, mockDb;

  beforeEach(() => {
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

  function expectRejected(status, error) {
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ error });
    expect(next).not.toHaveBeenCalled();
  }

  describe('Missing or untrusted credentials', () => {
    test('should return 401 if Authorization header is missing', () => {
      authenticateUser(req, res, next);
      expectRejected(401, 'Authentication required');
    });

    test('should ignore x-user-email header and return 401', () => {
      req.headers['x-user-email'] = 'victim@example.com';

      authenticateUser(req, res, next);

      expectRejected(401, 'Authentication required');
      expect(mockDb.get).not.toHaveBeenCalled();
      expect(req.userEmail).toBeUndefined();
    });

    test('should return 401 for a non-Bearer scheme', () => {
      req.headers.authorization = `Basic ${issueToken('test@example.com')}`;
      authenticateUser(req, res, next);
      expectRejected(401, 'Authentication required');
    });

    test('should return 401 for a malformed token', () => {
      req.headers.authorization = 'Bearer not-a-jwt';
      authenticateUser(req, res, next);
      expectRejected(401, 'Invalid or expired token');
    });

    test('should return 401 for a token signed with another secret', () => {
      const forged = jwt.sign({}, 'attacker-controlled-secret-attacker-controlled', {
        subject: 'victim@example.com'
      });
      req.headers.authorization = `Bearer ${forged}`;

      authenticateUser(req, res, next);

      expectRejected(401, 'Invalid or expired token');
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('should return 401 for an unsigned (alg none) token', () => {
      const unsigned = jwt.sign({ sub: 'victim@example.com' }, null, { algorithm: 'none' });
      req.headers.authorization = `Bearer ${unsigned}`;
      authenticateUser(req, res, next);
      expectRejected(401, 'Invalid or expired token');
    });

    test('should return 401 for an expired token', () => {
      jest.useFakeTimers();
      try {
        const token = issueToken('test@example.com');
        jest.setSystemTime(Date.now() + 25 * 60 * 60 * 1000);
        req.headers.authorization = `Bearer ${token}`;

        authenticateUser(req, res, next);

        expectRejected(401, 'Invalid or expired token');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('Valid token', () => {
    test('should derive req.userEmail from the token subject', (done) => {
      req.headers.authorization = `Bearer ${issueToken('existing@example.com')}`;
      req.headers['x-user-email'] = 'victim@example.com';
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: params[0] });
      });

      authenticateUser(req, res, next);

      setImmediate(() => {
        expect(mockDb.get).toHaveBeenCalledWith(
          'SELECT email FROM users WHERE email = ?',
          ['existing@example.com'],
          expect.any(Function)
        );
        expect(req.userEmail).toBe('existing@example.com');
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        done();
      });
    });

    test('should return 401 and not create a user when the account does not exist', (done) => {
      req.headers.authorization = `Bearer ${issueToken('deleted@example.com')}`;
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, undefined);
      });

      authenticateUser(req, res, next);

      setImmediate(() => {
        expectRejected(401, 'Invalid or expired token');
        expect(mockDb.run).not.toHaveBeenCalled();
        done();
      });
    });

    test('should handle database error when checking user', (done) => {
      req.headers.authorization = `Bearer ${issueToken('test@example.com')}`;
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      authenticateUser(req, res, next);

      setImmediate(() => {
        expectRejected(500, 'Internal server error');
        done();
      });
    });
  });
});
