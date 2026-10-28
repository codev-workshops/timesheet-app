const { getDatabase } = require('../database/init');

function getManagedEmployees(managerEmail) {
  return new Promise((resolve, reject) => {
    getDatabase().all(
      'SELECT employee_email FROM manager_employees WHERE manager_email = ? ORDER BY employee_email',
      [managerEmail],
      (err, rows) => {
        if (err) {
          return reject(err);
        }
        resolve(rows.map((row) => row.employee_email));
      }
    );
  });
}

// Must run after authenticateUser. Attaches req.managedEmployees (array of emails).
async function requireManager(req, res, next) {
  try {
    const employees = await getManagedEmployees(req.userEmail);
    if (employees.length === 0) {
      return res.status(403).json({ error: 'Manager access required' });
    }
    req.managedEmployees = employees;
    next();
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  getManagedEmployees,
  requireManager
};
