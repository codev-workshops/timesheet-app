const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateUser } = require('../middleware/auth');
const { projectSchema, updateProjectSchema } = require('../validation/schemas');

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

const PROJECT_SELECT = `
  SELECT p.id, p.name, p.description, p.client_id, p.start_date, p.status,
         p.user_email, p.created_at, p.updated_at, c.name as client_name
  FROM projects p
  JOIN clients c ON p.client_id = c.id
`;

// Strictly parse a positive base-10 integer ID; returns NaN for anything else (e.g. '1abc', '0', '-1')
function parseId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return NaN;
  }
  const id = Number(value);
  return id > 0 ? id : NaN;
}

// Normalize a Joi-parsed date (Date | '' | null | undefined) to 'YYYY-MM-DD' or null
function toDateString(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return new Date(value).toISOString().slice(0, 10);
}

// Get all projects for authenticated user (with optional client filter)
router.get('/', (req, res) => {
  const { clientId } = req.query;
  const db = getDatabase();

  let query = `${PROJECT_SELECT} WHERE p.user_email = ?`;
  const params = [req.userEmail];

  if (clientId !== undefined) {
    const clientIdNum = parseId(clientId);
    if (isNaN(clientIdNum)) {
      return res.status(400).json({ error: 'Invalid client ID' });
    }
    query += ' AND p.client_id = ?';
    params.push(clientIdNum);
  }

  query += ' ORDER BY p.created_at DESC';

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    res.json({ projects: rows });
  });
});

// Get specific project
router.get('/:id', (req, res) => {
  const projectId = parseId(req.params.id);

  if (isNaN(projectId)) {
    return res.status(400).json({ error: 'Invalid project ID' });
  }

  const db = getDatabase();

  db.get(
    `${PROJECT_SELECT} WHERE p.id = ? AND p.user_email = ?`,
    [projectId, req.userEmail],
    (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!row) {
        return res.status(404).json({ error: 'Project not found' });
      }

      res.json({ project: row });
    }
  );
});

// Create new project
router.post('/', (req, res, next) => {
  try {
    const { error, value } = projectSchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { name, description, clientId, startDate, status } = value;
    const db = getDatabase();

    // Verify client exists and belongs to user
    db.get(
      'SELECT id FROM clients WHERE id = ? AND user_email = ?',
      [clientId, req.userEmail],
      (err, row) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }

        if (!row) {
          return res.status(400).json({ error: 'Client not found or does not belong to user' });
        }

        db.run(
          'INSERT INTO projects (name, description, client_id, start_date, status, user_email) VALUES (?, ?, ?, ?, ?, ?)',
          [name, description || null, clientId, toDateString(startDate), status, req.userEmail],
          function(err) {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ error: 'Failed to create project' });
            }

            // Return the created project with client name
            db.get(
              `${PROJECT_SELECT} WHERE p.id = ? AND p.user_email = ?`,
              [this.lastID, req.userEmail],
              (err, row) => {
                if (err) {
                  console.error('Database error:', err);
                  return res.status(500).json({ error: 'Project created but failed to retrieve' });
                }

                res.status(201).json({
                  message: 'Project created successfully',
                  project: row
                });
              }
            );
          }
        );
      }
    );
  } catch (error) {
    next(error);
  }
});

// Update project
router.put('/:id', (req, res, next) => {
  try {
    const projectId = parseId(req.params.id);

    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const { error, value } = updateProjectSchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const db = getDatabase();

    // Check if project exists and belongs to user
    db.get(
      'SELECT id FROM projects WHERE id = ? AND user_email = ?',
      [projectId, req.userEmail],
      (err, row) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }

        if (!row) {
          return res.status(404).json({ error: 'Project not found' });
        }

        // If clientId is being updated, verify it belongs to user
        if (value.clientId !== undefined) {
          db.get(
            'SELECT id FROM clients WHERE id = ? AND user_email = ?',
            [value.clientId, req.userEmail],
            (err, clientRow) => {
              if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Internal server error' });
              }

              if (!clientRow) {
                return res.status(400).json({ error: 'Client not found or does not belong to user' });
              }

              performUpdate();
            }
          );
        } else {
          performUpdate();
        }

        function performUpdate() {
          // Build update query dynamically
          const updates = [];
          const values = [];

          if (value.name !== undefined) {
            updates.push('name = ?');
            values.push(value.name);
          }

          if (value.description !== undefined) {
            updates.push('description = ?');
            values.push(value.description || null);
          }

          if (value.clientId !== undefined) {
            updates.push('client_id = ?');
            values.push(value.clientId);
          }

          if (value.startDate !== undefined) {
            updates.push('start_date = ?');
            values.push(toDateString(value.startDate));
          }

          if (value.status !== undefined) {
            updates.push('status = ?');
            values.push(value.status);
          }

          updates.push('updated_at = CURRENT_TIMESTAMP');
          values.push(projectId, req.userEmail);

          const query = `UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND user_email = ?`;

          db.run(query, values, function(err) {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ error: 'Failed to update project' });
            }

            // Return updated project with client name
            db.get(
              `${PROJECT_SELECT} WHERE p.id = ? AND p.user_email = ?`,
              [projectId, req.userEmail],
              (err, row) => {
                if (err) {
                  console.error('Database error:', err);
                  return res.status(500).json({ error: 'Project updated but failed to retrieve' });
                }

                res.json({
                  message: 'Project updated successfully',
                  project: row
                });
              }
            );
          });
        }
      }
    );
  } catch (error) {
    next(error);
  }
});

// Delete project
router.delete('/:id', (req, res) => {
  const projectId = parseId(req.params.id);

  if (isNaN(projectId)) {
    return res.status(400).json({ error: 'Invalid project ID' });
  }

  const db = getDatabase();

  // Check if project exists and belongs to user
  db.get(
    'SELECT id FROM projects WHERE id = ? AND user_email = ?',
    [projectId, req.userEmail],
    (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!row) {
        return res.status(404).json({ error: 'Project not found' });
      }

      db.run(
        'DELETE FROM projects WHERE id = ? AND user_email = ?',
        [projectId, req.userEmail],
        function(err) {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to delete project' });
          }

          res.json({ message: 'Project deleted successfully' });
        }
      );
    }
  );
});

module.exports = router;
