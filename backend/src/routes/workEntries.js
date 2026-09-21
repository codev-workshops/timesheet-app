const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateUser } = require('../middleware/auth');
const { workEntrySchema, updateWorkEntrySchema } = require('../validation/schemas');

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

const WORK_ENTRY_SELECT = `
  SELECT we.id, we.client_id, we.project_id, we.hours, we.rate, we.description, we.date,
         we.created_at, we.updated_at, c.name as client_name, p.name as project_name
  FROM work_entries we
  JOIN clients c ON we.client_id = c.id
  LEFT JOIN projects p ON we.project_id = p.id
`;

// Verifies the project belongs to the user and the given client; calls back with (err, status, message)
function verifyProject(db, projectId, clientId, userEmail, callback) {
  db.get(
    'SELECT id, client_id FROM projects WHERE id = ? AND user_email = ?',
    [projectId, userEmail],
    (err, projectRow) => {
      if (err) return callback(err);
      if (!projectRow) return callback(null, 400, 'Project not found');
      if (clientId !== undefined && projectRow.client_id !== clientId) {
        return callback(null, 400, 'Project does not belong to the selected client');
      }
      callback(null);
    }
  );
}

// Get all work entries for authenticated user (with optional client filter)
router.get('/', (req, res) => {
  const { clientId, projectId } = req.query;
  const db = getDatabase();
  
  let query = `${WORK_ENTRY_SELECT} WHERE we.user_email = ?`;
  
  const params = [req.userEmail];
  
  if (clientId) {
    const clientIdNum = parseInt(clientId);
    if (isNaN(clientIdNum)) {
      return res.status(400).json({ error: 'Invalid client ID' });
    }
    query += ' AND we.client_id = ?';
    params.push(clientIdNum);
  }

  if (projectId) {
    const projectIdNum = parseInt(projectId);
    if (isNaN(projectIdNum)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }
    query += ' AND we.project_id = ?';
    params.push(projectIdNum);
  }
  
  query += ' ORDER BY we.date DESC, we.created_at DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    
    res.json({ workEntries: rows });
  });
});

// Get specific work entry
router.get('/:id', (req, res) => {
  const workEntryId = parseInt(req.params.id);
  
  if (isNaN(workEntryId)) {
    return res.status(400).json({ error: 'Invalid work entry ID' });
  }
  
  const db = getDatabase();
  
  db.get(
    `${WORK_ENTRY_SELECT} WHERE we.id = ? AND we.user_email = ?`,
    [workEntryId, req.userEmail],
    (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      
      if (!row) {
        return res.status(404).json({ error: 'Work entry not found' });
      }
      
      res.json({ workEntry: row });
    }
  );
});

// Create new work entry
router.post('/', (req, res, next) => {
  try {
    const { error, value } = workEntrySchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { clientId, projectId, hours, rate, description, date } = value;
    const db = getDatabase();

    // Verify client exists (clients are shared among authenticated users)
    db.get(
      'SELECT id FROM clients WHERE id = ?',
      [clientId],
      (err, row) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }

        if (!row) {
          return res.status(400).json({ error: 'Client not found' });
        }

        if (projectId) {
          verifyProject(db, projectId, clientId, req.userEmail, (err, status, message) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ error: 'Internal server error' });
            }
            if (status) {
              return res.status(status).json({ error: message });
            }
            insertEntry();
          });
        } else {
          insertEntry();
        }

        function insertEntry() {
          db.run(
            'INSERT INTO work_entries (client_id, project_id, user_email, hours, rate, description, date) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [clientId, projectId || null, req.userEmail, hours, rate ?? null, description || null, date],
            function(err) {
              if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Failed to create work entry' });
              }

              // Return the created work entry with client and project names
              db.get(
                `${WORK_ENTRY_SELECT} WHERE we.id = ? AND we.user_email = ?`,
                [this.lastID, req.userEmail],
                (err, row) => {
                  if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Work entry created but failed to retrieve' });
                  }

                  res.status(201).json({
                    message: 'Work entry created successfully',
                    workEntry: row
                  });
                }
              );
            }
          );
        }
      }
    );
  } catch (error) {
    next(error);
  }
});

// Update work entry
router.put('/:id', (req, res, next) => {
  try {
    const workEntryId = parseInt(req.params.id);
    
    if (isNaN(workEntryId)) {
      return res.status(400).json({ error: 'Invalid work entry ID' });
    }

    const { error, value } = updateWorkEntrySchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const db = getDatabase();

    // Check if work entry exists and belongs to user
    db.get(
      'SELECT id FROM work_entries WHERE id = ? AND user_email = ?',
      [workEntryId, req.userEmail],
      (err, row) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }

        if (!row) {
          return res.status(404).json({ error: 'Work entry not found' });
        }

        // If clientId is being updated, verify it exists (clients are shared among authenticated users)
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

              verifyProjectThenUpdate();
            }
          );
        } else {
          verifyProjectThenUpdate();
        }

        function verifyProjectThenUpdate() {
          if (!value.projectId) {
            return performUpdate();
          }
          verifyProject(db, value.projectId, value.clientId, req.userEmail, (err, status, message) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ error: 'Internal server error' });
            }
            if (status) {
              return res.status(status).json({ error: message });
            }
            performUpdate();
          });
        }

        function performUpdate() {
          // Build update query dynamically
          const updates = [];
          const values = [];

          if (value.clientId !== undefined) {
            updates.push('client_id = ?');
            values.push(value.clientId);
          }

          if (value.projectId !== undefined) {
            updates.push('project_id = ?');
            values.push(value.projectId);
          }

          if (value.hours !== undefined) {
            updates.push('hours = ?');
            values.push(value.hours);
          }

          if (value.rate !== undefined) {
            updates.push('rate = ?');
            values.push(value.rate);
          }

          if (value.description !== undefined) {
            updates.push('description = ?');
            values.push(value.description || null);
          }

          if (value.date !== undefined) {
            updates.push('date = ?');
            values.push(value.date);
          }

          updates.push('updated_at = CURRENT_TIMESTAMP');
          values.push(workEntryId, req.userEmail);

          const query = `UPDATE work_entries SET ${updates.join(', ')} WHERE id = ? AND user_email = ?`;

          db.run(query, values, function(err) {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ error: 'Failed to update work entry' });
            }

            // Return updated work entry with client and project names
            db.get(
              `${WORK_ENTRY_SELECT} WHERE we.id = ? AND we.user_email = ?`,
              [workEntryId, req.userEmail],
              (err, row) => {
                if (err) {
                  console.error('Database error:', err);
                  return res.status(500).json({ error: 'Work entry updated but failed to retrieve' });
                }

                res.json({
                  message: 'Work entry updated successfully',
                  workEntry: row
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

// Delete work entry
router.delete('/:id', (req, res) => {
  const workEntryId = parseInt(req.params.id);
  
  if (isNaN(workEntryId)) {
    return res.status(400).json({ error: 'Invalid work entry ID' });
  }
  
  const db = getDatabase();
  
  // Check if work entry exists and belongs to user
  db.get(
    'SELECT id FROM work_entries WHERE id = ? AND user_email = ?',
    [workEntryId, req.userEmail],
    (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      
      if (!row) {
        return res.status(404).json({ error: 'Work entry not found' });
      }
      
      // Delete work entry
      db.run(
        'DELETE FROM work_entries WHERE id = ? AND user_email = ?',
        [workEntryId, req.userEmail],
        function(err) {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to delete work entry' });
          }
          
          res.json({ message: 'Work entry deleted successfully' });
        }
      );
    }
  );
});

module.exports = router;
