const { createLogger } = require('./logger');

const log = createLogger('health');

function registerHealthRoutes(app, { getDatabase }) {
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
  });

  app.get('/health/ready', (req, res) => {
    const unavailable = (err) => {
      if (err) log.error({ err, req_id: req.id }, 'Database readiness check failed');
      return res.status(503).json({
        status: 'unavailable',
        error: 'Database not reachable'
      });
    };

    try {
      getDatabase().get('SELECT 1', (err) => {
        if (err) return unavailable(err);
        return res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
      });
    } catch (err) {
      return unavailable(err);
    }
  });
}

module.exports = { registerHealthRoutes };
