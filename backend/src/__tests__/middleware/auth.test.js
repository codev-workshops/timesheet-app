const jwt = require('jsonwebtoken');
const { authenticateUser, signToken, JWT_SECRET } = require('../../middleware/auth');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');

describe('Authentication Middleware', () => {
  let req, res, next, mockDb;

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
      run: jest.fn((query, params, callback) => callback && callback(null))
    };

    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Authorization Header Validation', () => {
    test('should return 401 if Authorization header is missing', () => {
      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authorization Bearer token required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 if header is not Bearer scheme', () => {
      req.headers['authorization'] = 'Basic abc123';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authorization Bearer token required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for a forged/invalid token', () => {
      req.headers['authorization'] = 'Bearer not-a-real-token';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid or expired token'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for a token signed with the wrong secret', () => {
      const bad = jwt.sign({ email: 'test@example.com' }, 'wrong-secret');
      req.headers['authorization'] = `Bearer ${bad}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid or expired token'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for an expired token', () => {
      const expired = jwt.sign({ email: 'test@example.com' }, JWT_SECRET, { expiresIn: -1 });
      req.headers['authorization'] = `Bearer ${expired}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid or expired token'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for a token with an invalid email payload', () => {
      const bad = jwt.sign({ email: 'not-an-email' }, JWT_SECRET);
      req.headers['authorization'] = `Bearer ${bad}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid token payload'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should not trust the x-user-email header', () => {
      req.headers['x-user-email'] = 'test@example.com';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Valid Token Authentication', () => {
    test('should authenticate valid token and call next()', (done) => {
      req.headers['authorization'] = `Bearer ${signToken('existing@example.com')}`;

      authenticateUser(req, res, next);

      setImmediate(() => {
        expect(mockDb.run).toHaveBeenCalledWith(
          'INSERT OR IGNORE INTO users (email) VALUES (?)',
          ['existing@example.com'],
          expect.any(Function)
        );
        expect(req.userEmail).toBe('existing@example.com');
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        done();
      });
    });

    test('should create user via INSERT OR IGNORE (no SELECT-then-INSERT race)', (done) => {
      req.headers['authorization'] = `Bearer ${signToken('newuser@example.com')}`;

      authenticateUser(req, res, next);

      setImmediate(() => {
        expect(mockDb.run).toHaveBeenCalledWith(
          'INSERT OR IGNORE INTO users (email) VALUES (?)',
          ['newuser@example.com'],
          expect.any(Function)
        );
        expect(req.userEmail).toBe('newuser@example.com');
        expect(next).toHaveBeenCalled();
        done();
      });
    });

    test('should handle database error during user upsert', (done) => {
      req.headers['authorization'] = `Bearer ${signToken('test@example.com')}`;
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'));
      });

      authenticateUser(req, res, next);

      setImmediate(() => {
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({
          error: 'Internal server error'
        });
        expect(next).not.toHaveBeenCalled();
        done();
      });
    });

    test('should accept Bearer with mixed case', (done) => {
      req.headers['authorization'] = `bearer ${signToken('case@example.com')}`;

      authenticateUser(req, res, next);

      setImmediate(() => {
        expect(next).toHaveBeenCalled();
        done();
      });
    });
  });

  describe('signToken', () => {
    test('should produce a verifiable token containing the email', () => {
      const token = signToken('user@example.com');
      const payload = jwt.verify(token, JWT_SECRET);
      expect(payload.email).toBe('user@example.com');
    });
  });
});
