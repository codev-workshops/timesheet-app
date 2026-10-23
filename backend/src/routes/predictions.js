const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateUser } = require('../middleware/auth');
const { predictionSchema } = require('../validation/schemas');
const { predictHours } = require('../ml/predict');

const router = express.Router();

router.use(authenticateUser);

router.post('/', (req, res, next) => {
  const { error, value } = predictionSchema.validate(req.body);
  if (error) {
    return next(error);
  }

  const { clientId, description, date } = value;
  const db = getDatabase();

  db.get(
    'SELECT id, department FROM clients WHERE id = ? AND user_email = ?',
    [clientId, req.userEmail],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!row) {
        return res.status(400).json({ error: 'Client not found or does not belong to user' });
      }

      try {
        const predictedHours = predictHours({
          clientId,
          department: row.department,
          description: description || '',
          date: date || new Date()
        });
        res.json({ predictedHours });
      } catch (predictionError) {
        next(predictionError);
      }
    }
  );
});

module.exports = router;
