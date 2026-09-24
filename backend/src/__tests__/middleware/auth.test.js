const { authenticateUser } = require('../../middleware/auth');
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
      run: jest.fn()
    };
    
    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Email Header Validation', () => {
    test('should return 401 if x-user-email header is missing', () => {
      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'User email required in x-user-email header'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should return 400 if email format is invalid', () => {
      req.headers['x-user-email'] = 'invalid-email';

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid email format'
      });
      expect(next).not.toHaveBeenCalled();
    });

    test('should accept valid email format', () => {
      req.headers['x-user-email'] = 'test@example.com';
      
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: 'test@example.com' });
      });

      authenticateUser(req, res, next);

      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT email FROM users WHERE email = ?',
        ['test@example.com'],
        expect.any(Function)
      );
      expect(req.userEmail).toBe('test@example.com');
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('Existing User Authentication', () => {
    test('should authenticate existing user and call next()', () => {
      req.headers['x-user-email'] = 'existing@example.com';
      
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: 'existing@example.com' });
      });

      authenticateUser(req, res, next);

      expect(req.userEmail).toBe('existing@example.com');
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should handle database error when checking user', () => {
      req.headers['x-user-email'] = 'test@example.com';
      
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal server error'
      });
      expect(next).not.toHaveBeenCalled();
      expect(req.userEmail).toBeUndefined();
    });
  });

  describe('New User Creation', () => {
    test('should create new user if not exists and call next()', () => {
      req.headers['x-user-email'] = 'newuser@example.com';
      
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null); // User doesn't exist
      });
      
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      authenticateUser(req, res, next);

      expect(mockDb.run).toHaveBeenCalledWith(
        'INSERT INTO users (email) VALUES (?)',
        ['newuser@example.com'],
        expect.any(Function)
      );
      expect(req.userEmail).toBe('newuser@example.com');
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    test('should handle error when creating new user', () => {
      req.headers['x-user-email'] = 'newuser@example.com';
      
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });
      
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Insert failed'));
      });

      authenticateUser(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to create user'
      });
      expect(next).not.toHaveBeenCalled();
      expect(req.userEmail).toBeUndefined();
    });
  });

  describe('Email Format Edge Cases', () => {
    test('should reject email without @', () => {
      req.headers['x-user-email'] = 'notanemail';
      authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('should reject email without domain', () => {
      req.headers['x-user-email'] = 'test@';
      authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('should reject email without TLD', () => {
      req.headers['x-user-email'] = 'test@domain';
      authenticateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('should accept email with subdomain', () => {
      req.headers['x-user-email'] = 'test@mail.example.com';
      
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { email: 'test@mail.example.com' });
      });

      authenticateUser(req, res, next);
      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT email FROM users WHERE email = ?',
        ['test@mail.example.com'],
        expect.any(Function)
      );
      expect(req.userEmail).toBe('test@mail.example.com');
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
