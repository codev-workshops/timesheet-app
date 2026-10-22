const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const workEntryRoutes = require('./routes/workEntries');
const reportRoutes = require('./routes/reports');

const { initializeDatabase, getDatabase } = require('./database/init');
const { errorHandler } = require('./middleware/errorHandler');
const {
  applyObservability,
  createLogger,
  registerHealthRoutes
} = require('./observability');

const app = express();
const PORT = process.env.PORT || 3001;
const log = createLogger('server');

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

applyObservability(app);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

registerHealthRoutes(app, { getDatabase });

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
      log.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'Server running');
      log.info({ url: `http://localhost:${PORT}/health` }, 'Health check available');
    });
  } catch (error) {
    log.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();

module.exports = app;
