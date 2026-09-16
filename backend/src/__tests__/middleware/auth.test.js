const jwt = require('jsonwebtoken');
const { authenticateUser } = require('../../middleware/auth');

describe('Authentication Middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    req = { cookies: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  test('returns 401 when the auth cookie is missing', () => {
    authenticateUser(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 for a malformed token', () => {
    req.cookies.token = 'not-a-jwt';
    authenticateUser(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid authentication token' });
  });

  test('returns 401 for a token signed with the wrong secret', () => {
    req.cookies.token = jwt.sign({ email: 'test@example.com' }, 'wrong-secret');
    authenticateUser(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid authentication token' });
  });

  test('returns 401 for an expired token', () => {
    req.cookies.token = jwt.sign(
      { email: 'test@example.com' },
      process.env.JWT_SECRET,
      { expiresIn: -10 }
    );
    authenticateUser(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication token expired' });
  });

  test('sets req.userEmail and calls next for a valid token', () => {
    req.cookies.token = jwt.sign(
      { email: 'test@example.com' },
      process.env.JWT_SECRET
    );
    authenticateUser(req, res, next);
    expect(req.userEmail).toBe('test@example.com');
    expect(next).toHaveBeenCalled();
  });

  test('returns 401 for a valid token with no email', () => {
    req.cookies.token = jwt.sign({ name: 'Test User' }, process.env.JWT_SECRET);
    authenticateUser(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid authentication token' });
  });
});
