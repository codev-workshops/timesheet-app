const { authenticateUser } = require('../../middleware/auth');
const { getDatabase } = require('../../database/init');
const { signToken } = require('../../config/jwt');
const jwt = require('jsonwebtoken');

jest.mock('../../database/init');

describe('Authentication Middleware', () => {
  let req, res, next, mockDb;

  const bearer = (email) => `Bearer ${signToken(email)}`;

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

  describe('Token Validation', () => {
    test('should return 401 if Authorization header is missing', () => {
      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 if scheme is not Bearer', () => {
      req.headers.authorization = `Basic ${signToken('test@example.com')}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should ignore legacy x-user-email header', () => {
      req.headers['x-user-email'] = 'victim@example.com';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockDb.get).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for a malformed token', () => {
      req.headers.authorization = 'Bearer not-a-jwt';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for a token signed with a different secret', () => {
      const forged = jwt.sign({ sub: 'victim@example.com' }, 'attacker-secret');
      req.headers.authorization = `Bearer ${forged}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for an expired token', () => {
      const expired = jwt.sign(
        { sub: 'test@example.com' },
        'insecure-development-secret-do-not-use-in-production',
        { expiresIn: -10 }
      );
      req.headers.authorization = `Bearer ${expired}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    });

    test('should return 401 for a token without a subject', () => {
      const noSub = jwt.sign(
        { role: 'admin' },
        'insecure-development-secret-do-not-use-in-production'
      );
      req.headers.authorization = `Bearer ${noSub}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(mockDb.get).not.toHaveBeenCalled();
    });
  });

  describe('Existing User Authentication', () => {
    test('should authenticate existing user and call next()', (done) => {
      req.headers.authorization = bearer('existing@example.com');

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: 'existing@example.com' });
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

    test('should handle database error when checking user', (done) => {
      req.headers.authorization = bearer('test@example.com');

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

  describe('Unknown User', () => {
    test('should reject a valid token for a user that no longer exists', (done) => {
      req.headers.authorization = bearer('deleted@example.com');

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      authenticateUser(req, res, next);

      setImmediate(() => {
        expect(mockDb.run).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
        expect(next).not.toHaveBeenCalled();
        done();
      });
    });
  });
});
