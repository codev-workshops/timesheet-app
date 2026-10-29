const express = require('express');
const authRoutes = require('../../routes/auth');
const clientRoutes = require('../../routes/clients');
const workEntryRoutes = require('../../routes/workEntries');
const reportRoutes = require('../../routes/reports');
const { errorHandler } = require('../../middleware/errorHandler');

// Mirrors the routing/error handling of server.js without listening on a port.
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/clients', clientRoutes);
  app.use('/api/work-entries', workEntryRoutes);
  app.use('/api/reports', reportRoutes);
  app.use(errorHandler);
  app.use('*', (req, res) => res.status(404).json({ error: 'Route not found' }));
  return app;
}

const USER = 'test@example.com';
const OTHER_USER = 'other@example.com';

module.exports = { createApp, USER, OTHER_USER };
