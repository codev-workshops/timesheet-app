const express = require('express');
const { db } = require('../database/db');
const { authenticateUser, requireAdmin, isAdminEmail } = require('../middleware/auth');
const { categorySchema, updateCategorySchema } = require('../validation/schemas');

// Categories are global, admin-managed reference data shared by all users, so these queries
// are deliberately NOT scoped by user_email (documented exception to the user isolation rule).
// Writes are restricted to admins via requireAdmin; all queries remain parameterized.

const router = express.Router();

const CATEGORY_COLUMNS = ['id', 'name', 'description', 'active', 'created_at', 'updated_at'];

function serialize(row) {
  return row && { ...row, active: Boolean(row.active) };
}

function findCategory(id) {
  return db('categories').select(CATEGORY_COLUMNS).where({ id }).first();
}

function findByName(name, excludeId) {
  const query = db('categories').select('id').whereRaw('LOWER(name) = LOWER(?)', [name]);
  if (excludeId !== undefined) {
    query.andWhereNot('id', excludeId);
  }
  return query.first();
}

function isUniqueViolation(err) {
  return err && err.code === 'SQLITE_CONSTRAINT' && /UNIQUE/i.test(err.message);
}

function parseId(req, res) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid category ID' });
    return null;
  }
  return id;
}

router.use(authenticateUser);

// List categories: active only, or all for admins with ?includeInactive=true
router.get('/', async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true' && isAdminEmail(req.userEmail);

  try {
    const query = db('categories').select(CATEGORY_COLUMNS).orderBy('name');
    if (!includeInactive) {
      query.where({ active: 1 });
    }
    const rows = await query;
    res.json({ categories: rows.map(serialize) });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create category (admin)
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { error, value } = categorySchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { name, description, active } = value;

    let categoryId;
    try {
      if (await findByName(name)) {
        return res.status(409).json({ error: 'Category name already exists' });
      }
      [categoryId] = await db('categories').insert({
        name,
        description: description || null,
        active: active === false ? 0 : 1
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: 'Category name already exists' });
      }
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    let row;
    try {
      row = await findCategory(categoryId);
    } catch (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    res.status(201).json({
      message: 'Category created successfully',
      category: serialize(row)
    });
  } catch (error) {
    next(error);
  }
});

// Update category (admin); setting active=true reactivates a soft-deleted category
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const categoryId = parseId(req, res);
    if (categoryId === null) return;

    const { error, value } = updateCategorySchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const updates = {};
    if (value.name !== undefined) updates.name = value.name;
    if (value.description !== undefined) updates.description = value.description || null;
    if (value.active !== undefined) updates.active = value.active ? 1 : 0;
    updates.updated_at = db.fn.now();

    let row;
    try {
      const existing = await findCategory(categoryId);
      if (!existing) {
        return res.status(404).json({ error: 'Category not found' });
      }
      if (value.name !== undefined && await findByName(value.name, categoryId)) {
        return res.status(409).json({ error: 'Category name already exists' });
      }
      await db('categories').where({ id: categoryId }).update(updates);
      row = await findCategory(categoryId);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return res.status(409).json({ error: 'Category name already exists' });
      }
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    res.json({
      message: 'Category updated successfully',
      category: serialize(row)
    });
  } catch (error) {
    next(error);
  }
});

// Soft-delete category (admin). FK enforcement is off, so rows are deactivated, not removed,
// and existing work entries keep their category_id.
router.delete('/:id', requireAdmin, async (req, res) => {
  const categoryId = parseId(req, res);
  if (categoryId === null) return;

  try {
    const existing = await findCategory(categoryId);
    if (!existing) {
      return res.status(404).json({ error: 'Category not found' });
    }
    await db('categories')
      .where({ id: categoryId })
      .update({ active: 0, updated_at: db.fn.now() });
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  res.json({ message: 'Category deleted successfully' });
});

module.exports = router;
