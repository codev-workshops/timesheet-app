const VALIDATION_OPTIONS = { abortEarly: false };

/**
 * Builds middleware that validates one part of the request against a Joi
 * schema and replaces it with the validated (converted) value.
 * @param {'body'|'params'|'query'} part
 * @param {import('joi').Schema} schema
 * @param {string=} message If set, respond 400 { error: message } instead of
 *     passing the Joi error to the error handler.
 * @return {import('express').RequestHandler}
 */
function validate(part, schema, message) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[part], VALIDATION_OPTIONS);
    if (error) {
      if (message) {
        return res.status(400).json({ error: message });
      }
      return next(error);
    }
    req[part] = value;
    next();
  };
}

module.exports = {
  validate
};
