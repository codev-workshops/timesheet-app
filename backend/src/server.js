require('./tracing');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const logger = require('./config/logger');
const { metricsMiddleware, metricsAuth, metricsHandler } = require('./config/metrics');
const { requestContext } = require('./middleware/requestContext');
const { requestLogger } = require('./middleware/requestLogger');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const workEntryRoutes = require('./routes/workEntries');
const reportRoutes = require('./routes/reports');

const { initializeDatabase } = require('./database/init');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// Observability: correlation context, metrics and structured HTTP request
// logging run before anything that can short-circuit a request
app.use(requestContext);
app.use(metricsMiddleware);
app.use(requestLogger);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  skip: (req) => req.path === '/health' || req.path === '/metrics'
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Prometheus metrics (optionally protected by METRICS_TOKEN)
app.get('/metrics', metricsAuth, metricsHandler);

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
      logger.info('server started', { port: PORT, healthCheck: `http://localhost:${PORT}/health` });
    });
  } catch (error) {
    logger.error('failed to start server', { err: logger.serializeError(error) });
    process.exit(1);
  }
}

startServer();

module.exports = app;
