const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const workEntryRoutes = require('./routes/workEntries');
const reportRoutes = require('./routes/reports');

const { initializeDatabase, getDatabase } = require('./database/init');
const { errorHandler } = require('./middleware/errorHandler');
const { metricsMiddleware, metricsHandler } = require('./metrics');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Health check - deep check so the Docker HEALTHCHECK catches DB failures
// Registered before the rate limiter: monitoring must not be rate-limited
app.get('/health', (req, res) => {
  getDatabase().get('SELECT 1 AS ok', (err) => {
    if (err) {
      console.error('Health check database probe failed:', err);
      return res.status(503).json({ status: 'FAIL', db: 'down', timestamp: new Date().toISOString() });
    }
    res.status(200).json({ status: 'OK', db: 'up', timestamp: new Date().toISOString() });
  });
});

// Prometheus metrics - no auth, no rate limit (same treatment as /health)
app.get('/metrics', metricsHandler);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Request duration metrics
app.use(metricsMiddleware);

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/work-entries', workEntryRoutes);
app.use('/api/reports', reportRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Metrics: http://localhost:${PORT}/metrics`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
