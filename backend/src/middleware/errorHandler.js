function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  // Joi validation errors
  if (err.isJoi) {
    return res.status(400).json({
      error: 'Validation error',
      details: err.details.map(detail => detail.message)
    });
  }

  // SQLite errors
  if (err.code && err.code.startsWith('SQLITE_')) {
    return res.status(500).json({
      error: 'Database error',
      message: 'An error occurred while processing your request'
    });
  }

  const status = err.status || 500;

  // Deliberate client errors (4xx) carry a safe, intentional message. Anything 5xx is an
  // unexpected failure whose message may contain file paths or library internals, so it is
  // logged above and replaced with a generic response.
  if (status >= 400 && status < 500 && err.message) {
    return res.status(status).json({ error: err.message });
  }

  res.status(status).json({ error: 'Internal server error' });
}

module.exports = {
  errorHandler
};
