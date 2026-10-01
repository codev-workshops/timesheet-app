const crypto = require('crypto');

function digest(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

// Shared-secret auth for external schedulers (cron, Cloud Scheduler, etc.), independent of user auth.
function requireSchedulerKey(req, res, next) {
  const expected = process.env.SCHEDULER_API_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'Scheduler API key is not configured' });
  }

  const provided = req.get('x-scheduler-key');
  if (!provided) {
    return res.status(401).json({ error: 'X-Scheduler-Key header required' });
  }

  if (!crypto.timingSafeEqual(digest(provided), digest(expected))) {
    return res.status(403).json({ error: 'Invalid scheduler key' });
  }

  next();
}

module.exports = {
  requireSchedulerKey
};
