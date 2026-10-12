const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateUser } = require('../middleware/auth');
const { categorySchema, updateCategorySchema } = require('../validation/schemas');

const router = express.Router();

router.use(authenticateUser);

router.get('/', (req, res) => {
  const db = getDatabase();

  db.all(
    'SELECT id, name, created_at, updated_at FROM categories WHERE user_email = ? ORDER BY name',
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

router.get('/:id', (req, res) => {
  const categoryId = parseInt(req.params.id);

  if (isNaN(categoryId)) {
    return res.status(400).json({ error: 'Invalid category ID' });
  }

  const db = getDatabase();

  db.get(
    'SELECT id, name, created_at, updated_at FROM categories WHERE id = ? AND user_email = ?',
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

router.post('/', (req, res, next) => {
  try {
    const { error, value } = categorySchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const db = getDatabase();

    db.run(
      'INSERT INTO categories (name, user_email) VALUES (?, ?)',
      [value.name, req.userEmail],
      function(err) {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Failed to create category' });
        }

        db.get(
          'SELECT id, name, created_at, updated_at FROM categories WHERE id = ? AND user_email = ?',
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

        db.run(
          'UPDATE categories SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?',
          [value.name, categoryId, req.userEmail],
          (err) => {
            if (err) {
              console.error('Database error:', err);
              return res.status(500).json({ error: 'Failed to update category' });
            }

            db.get(
              'SELECT id, name, created_at, updated_at FROM categories WHERE id = ? AND user_email = ?',
              [categoryId, req.userEmail],
              (err, updatedCategory) => {
                if (err) {
                  console.error('Database error:', err);
                  return res.status(500).json({ error: 'Category updated but failed to retrieve' });
                }

                res.json({
                  message: 'Category updated successfully',
                  category: updatedCategory
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

router.delete('/', (req, res) => {
  const db = getDatabase();

  db.run(
    'DELETE FROM work_entry_categories WHERE category_id IN (SELECT id FROM categories WHERE user_email = ?)',
    [req.userEmail],
    (err) => {
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

router.delete('/:id', (req, res) => {
  const categoryId = parseInt(req.params.id);

  if (isNaN(categoryId)) {
    return res.status(400).json({ error: 'Invalid category ID' });
  }

  const db = getDatabase();

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

      db.run(
        'DELETE FROM work_entry_categories WHERE category_id IN (SELECT id FROM categories WHERE id = ? AND user_email = ?)',
        [categoryId, req.userEmail],
        (err) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to delete category' });
          }

          db.run(
            'DELETE FROM categories WHERE id = ? AND user_email = ?',
            [categoryId, req.userEmail],
            (err) => {
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
