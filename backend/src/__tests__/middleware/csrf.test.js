const { csrfProtection } = require('../../middleware/csrf');

describe('CSRF Middleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      method: 'POST',
      path: '/api/resource',
      originalUrl: '/api/resource',
      cookies: {},
      get: jest.fn(),
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  test('allows GET requests without a token', () => {
    req.method = 'GET';
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects a POST without a header', () => {
    req.cookies.csrfToken = 'token';
    csrfProtection(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid CSRF token' });
  });

  test('rejects mismatched tokens', () => {
    req.cookies.csrfToken = 'cookie-token';
    req.get.mockReturnValue('header-token');
    csrfProtection(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('allows matching tokens', () => {
    req.cookies.csrfToken = 'matching-token';
    req.get.mockReturnValue('matching-token');
    csrfProtection(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test.each(['/api/auth/login', '/api/auth/logout'])(
    'exempts %s',
    (originalUrl) => {
      req.originalUrl = originalUrl;
      req.path = originalUrl.replace('/api', '');
      csrfProtection(req, res, next);
      expect(next).toHaveBeenCalled();
    }
  );
});
