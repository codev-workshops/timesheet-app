const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateUser } = require('../middleware/auth');
const { workEntrySchema, updateWorkEntrySchema } = require('../validation/schemas');

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

function verifyCategories(db, userEmail, categoryIds, callback) {
  if (categoryIds === undefined || categoryIds.length === 0) {
    return callback(null, true);
  }

  const placeholders = categoryIds.map(() => '?').join(', ');
  db.all(
    `SELECT id FROM categories WHERE user_email = ? AND id IN (${placeholders})`,
    [userEmail, ...categoryIds],
    (err, rows) => {
      if (err) {
        return callback(err);
      }
      callback(null, rows.length === categoryIds.length);
    }
  );
}

function replaceEntryCategories(db, userEmail, workEntryId, categoryIds, callback) {
  db.run(
    'DELETE FROM work_entry_categories WHERE work_entry_id IN (SELECT id FROM work_entries WHERE id = ? AND user_email = ?)',
    [workEntryId, userEmail],
    (err) => {
      if (err) {
        return callback(err);
      }

      if (!categoryIds || categoryIds.length === 0) {
        return callback(null);
      }

      const placeholders = categoryIds.map(() => '?').join(', ');
      db.run(
        `INSERT INTO work_entry_categories (work_entry_id, category_id) SELECT ?, id FROM categories WHERE user_email = ? AND id IN (${placeholders})`,
        [workEntryId, userEmail, ...categoryIds],
        (err) => callback(err)
      );
    }
  );
}

function attachCategories(db, userEmail, entries, clientIdFilter, callback) {
  if (entries.length === 0) {
    return callback(null, entries);
  }

  entries.forEach((entry) => {
    entry.categories = [];
  });

  const isSingleEntry = entries.length === 1 && clientIdFilter === undefined;
  let query = `
    SELECT wec.work_entry_id, c.id, c.name
    FROM work_entry_categories wec
    JOIN categories c ON c.id = wec.category_id
    JOIN work_entries we ON we.id = wec.work_entry_id
    WHERE `;
  const params = [];

  if (isSingleEntry) {
    query += 'wec.work_entry_id = ? AND we.user_email = ? AND c.user_email = ?';
    params.push(entries[0].id, userEmail, userEmail);
  } else {
    query += 'we.user_email = ? AND c.user_email = ?';
    params.push(userEmail, userEmail);
    if (clientIdFilter !== undefined) {
      query += ' AND we.client_id = ?';
      params.push(clientIdFilter);
    }
  }

  query += ' ORDER BY c.name';

  db.all(query, params, (err, rows) => {
    if (err) {
      return callback(err);
    }

    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
    rows.forEach((row) => {
      const entry = entriesById.get(row.work_entry_id);
      if (entry) {
        entry.categories.push({ id: row.id, name: row.name });
      }
    });

    callback(null, entries);
  });
}

// Get all work entries for authenticated user (with optional client filter)
router.get('/', (req, res) => {
  const { clientId } = req.query;
  const db = getDatabase();
  
  let query = `
    SELECT we.id, we.client_id, we.hours, we.description, we.date, 
           we.created_at, we.updated_at, c.name as client_name
    FROM work_entries we
    JOIN clients c ON we.client_id = c.id
    WHERE we.user_email = ?
  `;
  
  const params = [req.userEmail];
  
  if (clientId) {
    const clientIdNum = parseInt(clientId);
    if (isNaN(clientIdNum)) {
      return res.status(400).json({ error: 'Invalid client ID' });
    }
    query += ' AND we.client_id = ?';
    params.push(clientIdNum);
  }
  
  query += ' ORDER BY we.date DESC, we.created_at DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    
    attachCategories(db, req.userEmail, rows, clientId ? parseInt(clientId) : undefined, (err, workEntries) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      res.json({ workEntries });
    });
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
    `SELECT we.id, we.client_id, we.hours, we.description, we.date, 
            we.created_at, we.updated_at, c.name as client_name
     FROM work_entries we
     JOIN clients c ON we.client_id = c.id
     WHERE we.id = ? AND we.user_email = ?`,
    [workEntryId, req.userEmail],
    (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      
      if (!row) {
        return res.status(404).json({ error: 'Work entry not found' });
      }
      
      attachCategories(db, req.userEmail, [row], undefined, (err, workEntries) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }

        res.json({ workEntry: workEntries[0] });
      });
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

    const { clientId, hours, description, date, categoryIds } = value;
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

        verifyCategories(db, req.userEmail, categoryIds, (categoryErr, categoriesValid) => {
          if (categoryErr) {
            console.error('Database error:', categoryErr);
            return res.status(500).json({ error: 'Internal server error' });
          }

          if (!categoriesValid) {
            return res.status(400).json({ error: 'One or more categories not found or do not belong to user' });
          }

          db.run(
            'INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (?, ?, ?, ?, ?)',
            [clientId, req.userEmail, hours, description || null, date],
            function(err) {
              if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Failed to create work entry' });
              }

              const workEntryId = this.lastID;
              replaceEntryCategories(db, req.userEmail, workEntryId, categoryIds, (replaceErr) => {
                if (replaceErr) {
                  console.error('Database error:', replaceErr);
                  return res.status(500).json({ error: 'Failed to assign categories' });
                }

                db.get(
                  `SELECT we.id, we.client_id, we.hours, we.description, we.date,
                          we.created_at, we.updated_at, c.name as client_name
                   FROM work_entries we
                   JOIN clients c ON we.client_id = c.id
                   WHERE we.id = ? AND we.user_email = ?`,
                  [workEntryId, req.userEmail],
                  (err, createdEntry) => {
                    if (err) {
                      console.error('Database error:', err);
                      return res.status(500).json({ error: 'Work entry created but failed to retrieve' });
                    }

                    attachCategories(db, req.userEmail, [createdEntry], undefined, (attachErr, workEntries) => {
                      if (attachErr) {
                        console.error('Database error:', attachErr);
                        return res.status(500).json({ error: 'Internal server error' });
                      }

                      res.status(201).json({
                        message: 'Work entry created successfully',
                        workEntry: workEntries[0]
                      });
                    });
                  }
                );
              });
            }
          );
        });
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

        // If clientId is being updated, verify it belongs to user
        if (value.clientId) {
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

              verifyUpdateCategories();
            }
          );
        } else {
          verifyUpdateCategories();
        }

        function verifyUpdateCategories() {
          if (value.categoryIds === undefined) {
            return performUpdate();
          }

          verifyCategories(db, req.userEmail, value.categoryIds, (categoryErr, categoriesValid) => {
            if (categoryErr) {
              console.error('Database error:', categoryErr);
              return res.status(500).json({ error: 'Internal server error' });
            }

            if (!categoriesValid) {
              return res.status(400).json({ error: 'One or more categories not found or do not belong to user' });
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

          if (value.hours !== undefined) {
            updates.push('hours = ?');
            values.push(value.hours);
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

            const returnUpdatedEntry = () => {
              db.get(
                `SELECT we.id, we.client_id, we.hours, we.description, we.date,
                        we.created_at, we.updated_at, c.name as client_name
                 FROM work_entries we
                 JOIN clients c ON we.client_id = c.id
                 WHERE we.id = ? AND we.user_email = ?`,
                [workEntryId, req.userEmail],
                (err, updatedEntry) => {
                  if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Work entry updated but failed to retrieve' });
                  }

                  attachCategories(db, req.userEmail, [updatedEntry], undefined, (attachErr, workEntries) => {
                    if (attachErr) {
                      console.error('Database error:', attachErr);
                      return res.status(500).json({ error: 'Internal server error' });
                    }

                    res.json({
                      message: 'Work entry updated successfully',
                      workEntry: workEntries[0]
                    });
                  });
                }
              );
            };

            if (value.categoryIds !== undefined) {
              replaceEntryCategories(db, req.userEmail, workEntryId, value.categoryIds, (replaceErr) => {
                if (replaceErr) {
                  console.error('Database error:', replaceErr);
                  return res.status(500).json({ error: 'Failed to assign categories' });
                }
                returnUpdatedEntry();
              });
            } else {
              returnUpdatedEntry();
            }
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
