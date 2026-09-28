const rateLimit = require('express-rate-limit');

const categorizeRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userEmail,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many categorization requests. Limit is 10 per minute, please try again later.'
    });
  }
});

module.exports = {
  categorizeRateLimit
};
