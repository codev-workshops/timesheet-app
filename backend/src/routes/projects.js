const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateUser } = require('../middleware/auth');
const { projectSchema, updateProjectSchema } = require('../validation/schemas');

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

const PROJECT_SELECT = `
  SELECT p.id, p.name, p.description, p.client_id, p.user_email,
         p.created_at, p.updated_at, c.name as client_name
  FROM projects p
  JOIN clients c ON p.client_id = c.id
`;

// Get all projects for authenticated user (with optional client filter)
router.get('/', (req, res) => {
  const { clientId } = req.query;
  const db = getDatabase();

  let query = `${PROJECT_SELECT} WHERE p.user_email = ?`;
  const params = [req.userEmail];

  if (clientId) {
    const clientIdNum = parseInt(clientId);
    if (isNaN(clientIdNum)) {
      return res.status(400).json({ error: 'Invalid client ID' });
    }
    query += ' AND p.client_id = ?';
    params.push(clientIdNum);
  }

  query += ' ORDER BY p.name';

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
  const projectId = parseInt(req.params.id);

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

    const { name, description, clientId } = value;
    const db = getDatabase();

    // Verify client exists (clients are shared among authenticated users)
    db.get(
      'SELECT id FROM clients WHERE id = ?',
      [clientId],
      (err, clientRow) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }

        if (!clientRow) {
          return res.status(400).json({ error: 'Client not found' });
        }

        db.run(
          'INSERT INTO projects (name, description, client_id, user_email) VALUES (?, ?, ?, ?)',
          [name, description || null, clientId, req.userEmail],
          function(err) {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ error: 'Failed to create project' });
            }

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
    const projectId = parseInt(req.params.id);

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

        if (value.clientId) {
          db.get(
            'SELECT id FROM clients WHERE id = ?',
            [value.clientId],
            (err, clientRow) => {
              if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Internal server error' });
              }

              if (!clientRow) {
                return res.status(400).json({ error: 'Client not found' });
              }

              performUpdate();
            }
          );
        } else {
          performUpdate();
        }

        function performUpdate() {
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

          updates.push('updated_at = CURRENT_TIMESTAMP');
          values.push(projectId, req.userEmail);

          const query = `UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND user_email = ?`;

          db.run(query, values, function(err) {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ error: 'Failed to update project' });
            }

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

// Delete project (blocked if any work entries reference it)
router.delete('/:id', (req, res) => {
  const projectId = parseInt(req.params.id);

  if (isNaN(projectId)) {
    return res.status(400).json({ error: 'Invalid project ID' });
  }

  const db = getDatabase();

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

      // Application-level RESTRICT: FK enforcement may be off for the in-memory DB
      db.get(
        'SELECT COUNT(*) as count FROM work_entries WHERE project_id = ?',
        [projectId],
        (err, countRow) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          if (countRow && countRow.count > 0) {
            return res.status(409).json({ error: 'Project has work entries and cannot be deleted' });
          }

          db.run(
            'DELETE FROM projects WHERE id = ? AND user_email = ?',
            [projectId, req.userEmail],
            function(err) {
              if (err) {
                console.error('Database error:', err);
                if (err.code === 'SQLITE_CONSTRAINT' || (err.message && /FOREIGN KEY/i.test(err.message))) {
                  return res.status(409).json({ error: 'Project has work entries and cannot be deleted' });
                }
                return res.status(500).json({ error: 'Failed to delete project' });
              }

              res.json({ message: 'Project deleted successfully' });
            }
          );
        }
      );
    }
  );
});

module.exports = router;
