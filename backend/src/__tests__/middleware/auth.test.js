const jwt = require('jsonwebtoken');
const { authenticateUser } = require('../../middleware/auth');
const { getJwtSecret, jwtAlgorithm } = require('../../config/auth');

describe('Authentication Middleware', () => {
  let req, res, next;

  const signToken = (payload, options = {}) =>
    jwt.sign(payload, getJwtSecret(), { algorithm: jwtAlgorithm, ...options });

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
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

    test('should return 401 for a non-Bearer scheme', () => {
      req.headers.authorization = 'Basic dXNlcjpwYXNz';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 when the Bearer token is absent', () => {
      req.headers.authorization = 'Bearer';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Identity cannot be self-asserted', () => {
    // Regression test: the previous implementation trusted this header outright, which let
    // any caller read and write any tenant's data.
    test('should reject a request that only sets x-user-email', () => {
      req.headers['x-user-email'] = 'victim@example.com';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
      expect(req.userEmail).toBeUndefined();
    });

    test('should ignore x-user-email when a valid token is present', () => {
      req.headers.authorization = `Bearer ${signToken({ sub: 'owner@example.com' })}`;
      req.headers['x-user-email'] = 'victim@example.com';

      authenticateUser(req, res, next);

      expect(req.userEmail).toBe('owner@example.com');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Token validation', () => {
    test('should accept a valid token and set req.userEmail from the subject', () => {
      req.headers.authorization = `Bearer ${signToken({ sub: 'user@example.com' })}`;

      authenticateUser(req, res, next);

      expect(req.userEmail).toBe('user@example.com');
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should reject a token signed with the wrong secret', () => {
      req.headers.authorization = `Bearer ${jwt.sign({ sub: 'user@example.com' }, 'an-entirely-different-secret-value')}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject an unsigned (alg: none) token', () => {
      const unsigned = jwt.sign({ sub: 'user@example.com' }, '', { algorithm: 'none' });
      req.headers.authorization = `Bearer ${unsigned}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject an expired token', () => {
      req.headers.authorization = `Bearer ${signToken({ sub: 'user@example.com' }, { expiresIn: '-1s' })}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject a garbage token', () => {
      req.headers.authorization = 'Bearer not-a-jwt';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    test('should reject a valid signature with no subject claim', () => {
      req.headers.authorization = `Bearer ${signToken({ role: 'admin' })}`;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
