const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateUser } = require('../middleware/auth');
const { categorySchema, updateCategorySchema } = require('../validation/schemas');

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

const isUniqueViolation = (err) =>
  err && (err.code === 'SQLITE_CONSTRAINT' || /UNIQUE/i.test(err.message || ''));

// Get all categories for authenticated user
router.get('/', (req, res) => {
  const db = getDatabase();

  db.all(
    'SELECT id, name, description, color, created_at, updated_at FROM categories WHERE user_email = ? ORDER BY name',
    [req.userEmail],
    (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      res.json({ categories: rows });
    }
  );
});

// Get specific category
router.get('/:id', (req, res) => {
  const categoryId = parseInt(req.params.id);

  if (isNaN(categoryId)) {
    return res.status(400).json({ error: 'Invalid category ID' });
  }

  const db = getDatabase();

  db.get(
    'SELECT id, name, description, color, created_at, updated_at FROM categories WHERE id = ? AND user_email = ?',
    [categoryId, req.userEmail],
    (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!row) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.json({ category: row });
    }
  );
});

// Create new category
router.post('/', (req, res, next) => {
  try {
    const { error, value } = categorySchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { name, description, color } = value;
    const db = getDatabase();

    db.run(
      'INSERT INTO categories (name, description, color, user_email) VALUES (?, ?, ?, ?)',
      [name, description || null, color || null, req.userEmail],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          if (isUniqueViolation(err)) {
            return res.status(409).json({ error: 'Category name already exists' });
          }
          return res.status(500).json({ error: 'Failed to create category' });
        }

        // Return the created category
        db.get(
          'SELECT id, name, description, color, created_at, updated_at FROM categories WHERE id = ? AND user_email = ?',
          [this.lastID, req.userEmail],
          (err, row) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ error: 'Category created but failed to retrieve' });
            }

            res.status(201).json({
              message: 'Category created successfully',
              category: row
            });
          }
        );
      }
    );
  } catch (error) {
    next(error);
  }
});

// Update category
router.put('/:id', (req, res, next) => {
  try {
    const categoryId = parseInt(req.params.id);

    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'Invalid category ID' });
    }

    const { error, value } = updateCategorySchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const db = getDatabase();

    // Check if category exists and belongs to user
    db.get(
      'SELECT id FROM categories WHERE id = ? AND user_email = ?',
      [categoryId, req.userEmail],
      (err, row) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Internal server error' });
        }

        if (!row) {
          return res.status(404).json({ error: 'Category not found' });
        }

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

        if (value.color !== undefined) {
          updates.push('color = ?');
          values.push(value.color || null);
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(categoryId, req.userEmail);

        const query = `UPDATE categories SET ${updates.join(', ')} WHERE id = ? AND user_email = ?`;

        db.run(query, values, function(err) {
          if (err) {
            console.error('Database error:', err);
            if (isUniqueViolation(err)) {
              return res.status(409).json({ error: 'Category name already exists' });
            }
            return res.status(500).json({ error: 'Failed to update category' });
          }

          // Return updated category
          db.get(
            'SELECT id, name, description, color, created_at, updated_at FROM categories WHERE id = ? AND user_email = ?',
            [categoryId, req.userEmail],
            (err, row) => {
              if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Category updated but failed to retrieve' });
              }

              res.json({
                message: 'Category updated successfully',
                category: row
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

// Delete all categories for authenticated user
router.delete('/', (req, res) => {
  const db = getDatabase();

  // SQLite FK enforcement is off, so SET NULL on work_entries is done explicitly
  db.run(
    'UPDATE work_entries SET category_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_email = ? AND category_id IS NOT NULL',
    [req.userEmail],
    function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Failed to delete categories' });
      }

      db.run(
        'DELETE FROM categories WHERE user_email = ?',
        [req.userEmail],
        function(err) {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to delete categories' });
          }

          res.json({
            message: 'All categories deleted successfully',
            deletedCount: this.changes
          });
        }
      );
    }
  );
});

// Delete category
router.delete('/:id', (req, res) => {
  const categoryId = parseInt(req.params.id);

  if (isNaN(categoryId)) {
    return res.status(400).json({ error: 'Invalid category ID' });
  }

  const db = getDatabase();

  // Check if category exists and belongs to user
  db.get(
    'SELECT id FROM categories WHERE id = ? AND user_email = ?',
    [categoryId, req.userEmail],
    (err, row) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!row) {
        return res.status(404).json({ error: 'Category not found' });
      }

      // SQLite FK enforcement is off, so SET NULL on work_entries is done explicitly
      db.run(
        'UPDATE work_entries SET category_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE category_id = ? AND user_email = ?',
        [categoryId, req.userEmail],
        function(err) {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to delete category' });
          }

          db.run(
            'DELETE FROM categories WHERE id = ? AND user_email = ?',
            [categoryId, req.userEmail],
            function(err) {
              if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Failed to delete category' });
              }

              res.json({ message: 'Category deleted successfully' });
            }
          );
        }
      );
    }
  );
});

module.exports = router;
