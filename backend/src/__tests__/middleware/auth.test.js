const jwt = require('jsonwebtoken');
const { authenticateUser } = require('../../middleware/auth');
const { getDatabase } = require('../../database/init');
const { issueToken, resetJwtSecretForTests } = require('../../security/token');

jest.mock('../../database/init');

const TEST_SECRET = 'test-secret-that-is-at-least-32-characters-long';

describe('Authentication Middleware', () => {
  let req, res, next, mockDb;

  beforeAll(() => {
    process.env.JWT_SECRET = TEST_SECRET;
    resetJwtSecretForTests();
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
    resetJwtSecretForTests();
  });

  beforeEach(() => {
    req = {
      headers: {}
    };
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

  describe('Missing or malformed credentials', () => {
    test('should return 401 if Authorization header is missing', () => {
      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should ignore a forged x-user-email header', () => {
      req.headers['x-user-email'] = 'victim@example.com';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(req.userEmail).toBeUndefined();
      expect(mockDb.get).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for a non-Bearer scheme', () => {
      req.headers.authorization = `Basic ${issueToken('user@example.com')}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for a garbage token', () => {
      req.headers.authorization = 'Bearer not-a-jwt';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Token verification', () => {
    test('should reject a token signed with another secret', () => {
      const forged = jwt.sign({}, 'attacker-secret-attacker-secret-attacker', {
        subject: 'victim@example.com',
        issuer: 'timesheet-app',
        audience: 'timesheet-app'
      });
      req.headers.authorization = `Bearer ${forged}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('should reject an unsigned (alg none) token', () => {
      const unsigned = jwt.sign({ sub: 'victim@example.com', iss: 'timesheet-app', aud: 'timesheet-app' }, '', {
        algorithm: 'none'
      });
      req.headers.authorization = `Bearer ${unsigned}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject an expired token', () => {
      const expired = jwt.sign({}, TEST_SECRET, {
        subject: 'user@example.com',
        issuer: 'timesheet-app',
        audience: 'timesheet-app',
        expiresIn: -10
      });
      req.headers.authorization = `Bearer ${expired}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject a token without a subject', () => {
      const noSubject = jwt.sign({}, TEST_SECRET, {
        issuer: 'timesheet-app',
        audience: 'timesheet-app'
      });
      req.headers.authorization = `Bearer ${noSubject}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should authenticate a valid token and set userEmail from its subject', (done) => {
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

    test('should return 401 if the token user no longer exists', (done) => {
      req.headers.authorization = `Bearer ${issueToken('deleted@example.com')}`;

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, undefined);
      });

      authenticateUser(req, res, next);

      setImmediate(() => {
        expect(res.status).toHaveBeenCalledWith(401);
        expect(mockDb.run).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
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
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
        expect(next).not.toHaveBeenCalled();
        done();
      });
    });
  });
});
