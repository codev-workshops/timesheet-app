const jwt = require('jsonwebtoken');
const { authenticateUser, signToken } = require('../../middleware/auth');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');

describe('Authentication Middleware', () => {
  let req, res, next, mockDb;

  const bearer = (token) => `Bearer ${token}`;

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

  describe('signToken', () => {
    test('should sign an HS256 token with email payload and 24h expiry', () => {
      const token = signToken('user@example.com');
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

      expect(decoded.email).toBe('user@example.com');
      expect(decoded.exp - decoded.iat).toBe(24 * 60 * 60);
      expect(jwt.decode(token, { complete: true }).header.alg).toBe('HS256');
    });
  });

  describe('Authorization header validation', () => {
    test('should return 401 if Authorization header is missing', () => {
      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authorization header with Bearer token required'
      });
      expect(next).not.toHaveBeenCalled();
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('should ignore x-user-email header', () => {
      req.headers['x-user-email'] = 'spoofed@example.com';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(req.userEmail).toBeUndefined();
      expect(next).not.toHaveBeenCalled();
    });

    test.each([
      ['non-Bearer scheme', `Basic ${Buffer.from('a:b').toString('base64')}`],
      ['Bearer without token', 'Bearer '],
      ['token without scheme', 'abc.def.ghi'],
      ['token that is not a JWT', 'Bearer not-a-jwt'],
      ['extra segments', 'Bearer a.b.c d']
    ])('should return 401 for malformed header (%s)', (_label, header) => {
      req.headers.authorization = header;

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Malformed Authorization header' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 when Authorization header is not a string', () => {
      req.headers.authorization = ['Bearer a.b.c', 'Bearer d.e.f'];

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Malformed Authorization header' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for token signed with a different secret', () => {
      const token = jwt.sign({ email: 'test@example.com' }, 'wrong-secret', { algorithm: 'HS256' });
      req.headers.authorization = bearer(token);

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(next).not.toHaveBeenCalled();
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('should return 401 for tampered token payload', () => {
      const token = signToken('test@example.com');
      const [header, , signature] = token.split('.');
      const forgedPayload = Buffer.from(JSON.stringify({ email: 'victim@example.com' })).toString('base64url');
      req.headers.authorization = bearer(`${header}.${forgedPayload}.${signature}`);

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for unsigned (alg=none) token', () => {
      const token = jwt.sign({ email: 'test@example.com' }, null, { algorithm: 'none' });
      req.headers.authorization = bearer(`${token}sig`);

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for token signed with a non-pinned algorithm', () => {
      const token = jwt.sign({ email: 'test@example.com' }, process.env.JWT_SECRET, { algorithm: 'HS512' });
      req.headers.authorization = bearer(token);

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for expired token', () => {
      const token = jwt.sign(
        { email: 'test@example.com', exp: Math.floor(Date.now() / 1000) - 60 },
        process.env.JWT_SECRET,
        { algorithm: 'HS256' }
      );
      req.headers.authorization = bearer(token);

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Token expired' });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 for valid token without email claim', () => {
      const token = jwt.sign({ sub: 'someone' }, process.env.JWT_SECRET, { algorithm: 'HS256' });
      req.headers.authorization = bearer(token);

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('User lookup', () => {
    test('should authenticate existing user and call next()', () => {
      req.headers.authorization = bearer(signToken('existing@example.com'));

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: 'existing@example.com' });
      });

      authenticateUser(req, res, next);

      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT email FROM users WHERE email = ?',
        ['existing@example.com'],
        expect.any(Function)
      );
      expect(req.userEmail).toBe('existing@example.com');
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should accept case-insensitive scheme and surrounding whitespace', () => {
      req.headers.authorization = `  bearer ${signToken('existing@example.com')}  `;

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: 'existing@example.com' });
      });

      authenticateUser(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    test('should return 401 and not create user when token user does not exist', () => {
      req.headers.authorization = bearer(signToken('ghost@example.com'));

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, undefined);
      });

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
      expect(mockDb.run).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    test('should handle database error when checking user', () => {
      req.headers.authorization = bearer(signToken('test@example.com'));

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal server error'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
