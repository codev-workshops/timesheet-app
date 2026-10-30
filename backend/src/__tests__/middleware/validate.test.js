const Joi = require('joi');
const { validate } = require('../../middleware/validate');
const { idParamSchema, workEntryQuerySchema } = require('../../validation/schemas');

describe('Validation Middleware', () => {
  let res, next;

  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  test('should replace the request part with the converted value', () => {
    const req = { params: { id: '42' } };

    validate('params', idParamSchema, 'Invalid ID')(req, res, next);

    expect(req.params.id).toBe(42);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  test.each(['abc', '12abc', '0', '-1', '1.5'])('should reject id %p with the given message', (id) => {
    const req = { params: { id } };

    validate('params', idParamSchema, 'Invalid ID')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid ID' });
    expect(next).not.toHaveBeenCalled();
  });

  test('should pass Joi errors to the error handler when no message is given', () => {
    const schema = Joi.object({ name: Joi.string().required(), hours: Joi.number().required() });
    const req = { body: { extra: true } };

    validate('body', schema)(req, res, next);

    const [error] = next.mock.calls[0];
    expect(error.isJoi).toBe(true);
    expect(error.details.length).toBe(3);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should treat an empty clientId query as absent', () => {
    const req = { query: { clientId: '' } };

    validate('query', workEntryQuerySchema, 'Invalid client ID')(req, res, next);

    expect(req.query.clientId).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });
});
