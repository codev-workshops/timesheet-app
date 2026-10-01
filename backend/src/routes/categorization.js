const express = require('express');
const { requireSchedulerKey } = require('../middleware/schedulerAuth');
const { categorizeQuerySchema } = require('../validation/schemas');
const { createCategorizer } = require('../services/categorization/categorizerFactory');
const {
  runCategorization,
  tryAcquireJobLock,
  releaseJobLock
} = require('../services/categorization/categorizationService');

const router = express.Router();

router.use(requireSchedulerKey);

// Categorize pending work entries across all users (optionally scoped by userEmail/date).
router.post('/categorize', async (req, res, next) => {
  const { error, value } = categorizeQuerySchema.validate(req.query);
  if (error) {
    return next(error);
  }

  if (!tryAcquireJobLock()) {
    return res.status(409).json({ error: 'A categorization job is already in progress' });
  }

  try {
    const summary = await runCategorization({
      categorizer: createCategorizer(),
      selection: 'pending',
      userEmail: value.userEmail,
      date: value.date,
      dryRun: value.dryRun,
      retryFailed: value.retryFailed,
      limit: value.limit
    });
    res.json(summary);
  } catch (err) {
    console.error('Categorization job failed:', err);
    next(err);
  } finally {
    releaseJobLock();
  }
});

module.exports = router;
