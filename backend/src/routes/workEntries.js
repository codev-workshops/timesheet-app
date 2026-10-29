const express = require('express');
const { db } = require('../database/db');
const { authenticateUser } = require('../middleware/auth');
const { workEntrySchema, updateWorkEntrySchema } = require('../validation/schemas');

const router = express.Router();

const WORK_ENTRY_COLUMNS = [
  'we.id', 'we.client_id', 'we.hours', 'we.description', 'we.date',
  'we.created_at', 'we.updated_at', 'c.name as client_name',
  'we.category_id', 'cat.name as category_name'
];

function workEntriesWithClient() {
  return db('work_entries as we')
    .join('clients as c', 'we.client_id', 'c.id')
    .leftJoin('categories as cat', 'we.category_id', 'cat.id')
    .select(WORK_ENTRY_COLUMNS);
}

// Categories are global reference data (not user-scoped); only active ones may be assigned.
async function findActiveCategory(categoryId) {
  return db('categories').select('id').where({ id: categoryId, active: 1 }).first();
}

// Returns true if the response was already sent (error), false if categoryId is acceptable.
async function rejectInvalidCategory(categoryId, res) {
  if (categoryId === undefined || categoryId === null) {
    return false;
  }
  let category;
  try {
    category = await findActiveCategory(categoryId);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Internal server error' });
    return true;
  }
  if (!category) {
    res.status(400).json({ error: 'Category not found or inactive' });
    return true;
  }
  return false;
}

async function findUserClient(clientId, userEmail) {
  return db('clients').select('id').where({ id: clientId, user_email: userEmail }).first();
}

async function findUserWorkEntry(workEntryId, userEmail) {
  return db('work_entries').select('id').where({ id: workEntryId, user_email: userEmail }).first();
}

// All routes require authentication
router.use(authenticateUser);

// Get all work entries for authenticated user (with optional client/category filters)
router.get('/', async (req, res) => {
  const { clientId, categoryId } = req.query;

  const query = workEntriesWithClient().where('we.user_email', req.userEmail);

  if (clientId) {
    const clientIdNum = parseInt(clientId);
    if (isNaN(clientIdNum)) {
      return res.status(400).json({ error: 'Invalid client ID' });
    }
    query.andWhere('we.client_id', clientIdNum);
  }

  if (categoryId) {
    const categoryIdNum = parseInt(categoryId);
    if (isNaN(categoryIdNum)) {
      return res.status(400).json({ error: 'Invalid category ID' });
    }
    query.andWhere('we.category_id', categoryIdNum);
  }

  query.orderBy([
    { column: 'we.date', order: 'desc' },
    { column: 'we.created_at', order: 'desc' }
  ]);

  try {
    const rows = await query;
    res.json({ workEntries: rows });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific work entry
router.get('/:id', async (req, res) => {
  const workEntryId = parseInt(req.params.id);

  if (isNaN(workEntryId)) {
    return res.status(400).json({ error: 'Invalid work entry ID' });
  }

  try {
    const row = await workEntriesWithClient()
      .where({ 'we.id': workEntryId, 'we.user_email': req.userEmail })
      .first();

    if (!row) {
      return res.status(404).json({ error: 'Work entry not found' });
    }

    res.json({ workEntry: row });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new work entry
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = workEntrySchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { clientId, hours, description, date, categoryId } = value;

    // Verify client exists and belongs to user
    let client;
    try {
      client = await findUserClient(clientId, req.userEmail);
    } catch (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!client) {
      return res.status(400).json({ error: 'Client not found or does not belong to user' });
    }

    if (await rejectInvalidCategory(categoryId, res)) {
      return;
    }

    // Create work entry
    let workEntryId;
    try {
      [workEntryId] = await db('work_entries').insert({
        client_id: clientId,
        user_email: req.userEmail,
        hours,
        description: description || null,
        date,
        category_id: categoryId ?? null
      });
    } catch (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to create work entry' });
    }

    // Return the created work entry with client name
    let row;
    try {
      row = await workEntriesWithClient()
        .where({ 'we.id': workEntryId, 'we.user_email': req.userEmail })
        .first();
    } catch (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Work entry created but failed to retrieve' });
    }

    res.status(201).json({
      message: 'Work entry created successfully',
      workEntry: row
    });
  } catch (error) {
    next(error);
  }
});

// Update work entry
router.put('/:id', async (req, res, next) => {
  try {
    const workEntryId = parseInt(req.params.id);

    if (isNaN(workEntryId)) {
      return res.status(400).json({ error: 'Invalid work entry ID' });
    }

    const { error, value } = updateWorkEntrySchema.validate(req.body);
    if (error) {
      return next(error);
    }

    // Check if work entry exists and belongs to user
    let existing;
    try {
      existing = await findUserWorkEntry(workEntryId, req.userEmail);
    } catch (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Work entry not found' });
    }

    // If clientId is being updated, verify it belongs to user
    if (value.clientId) {
      let client;
      try {
        client = await findUserClient(value.clientId, req.userEmail);
      } catch (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!client) {
        return res.status(400).json({ error: 'Client not found or does not belong to user' });
      }
    }

    if (await rejectInvalidCategory(value.categoryId, res)) {
      return;
    }

    const updates = {};

    if (value.clientId !== undefined) {
      updates.client_id = value.clientId;
    }

    if (value.hours !== undefined) {
      updates.hours = value.hours;
    }

    if (value.description !== undefined) {
      updates.description = value.description || null;
    }

    if (value.date !== undefined) {
      updates.date = value.date;
    }

    if (value.categoryId !== undefined) {
      updates.category_id = value.categoryId;
    }

    updates.updated_at = db.fn.now();

    try {
      await db('work_entries')
        .where({ id: workEntryId, user_email: req.userEmail })
        .update(updates);
    } catch (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to update work entry' });
    }

    // Return updated work entry with client name
    let row;
    try {
      row = await workEntriesWithClient()
        .where({ 'we.id': workEntryId, 'we.user_email': req.userEmail })
        .first();
    } catch (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Work entry updated but failed to retrieve' });
    }

    res.json({
      message: 'Work entry updated successfully',
      workEntry: row
    });
  } catch (error) {
    next(error);
  }
});

// Delete work entry
router.delete('/:id', async (req, res) => {
  const workEntryId = parseInt(req.params.id);

  if (isNaN(workEntryId)) {
    return res.status(400).json({ error: 'Invalid work entry ID' });
  }

  // Check if work entry exists and belongs to user
  let existing;
  try {
    existing = await findUserWorkEntry(workEntryId, req.userEmail);
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  if (!existing) {
    return res.status(404).json({ error: 'Work entry not found' });
  }

  // Delete work entry
  try {
    await db('work_entries').where({ id: workEntryId, user_email: req.userEmail }).del();
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Failed to delete work entry' });
  }

  res.json({ message: 'Work entry deleted successfully' });
});

module.exports = router;
