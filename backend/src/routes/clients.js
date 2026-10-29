const express = require('express');
const { db } = require('../database/db');
const { authenticateUser } = require('../middleware/auth');
const { clientSchema, updateClientSchema } = require('../validation/schemas');

const router = express.Router();

const CLIENT_COLUMNS = ['id', 'name', 'description', 'department', 'email', 'created_at', 'updated_at'];

// All routes require authentication
router.use(authenticateUser);

// Get all clients for authenticated user
router.get('/', async (req, res) => {
  try {
    const rows = await db('clients')
      .select(CLIENT_COLUMNS)
      .where({ user_email: req.userEmail })
      .orderBy('name');

    res.json({ clients: rows });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific client
router.get('/:id', async (req, res) => {
  const clientId = parseInt(req.params.id);

  if (isNaN(clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }

  try {
    const row = await db('clients')
      .select(CLIENT_COLUMNS)
      .where({ id: clientId, user_email: req.userEmail })
      .first();

    if (!row) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json({ client: row });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new client
router.post('/', async (req, res, next) => {
  try {
    const { error, value } = clientSchema.validate(req.body);
    if (error) {
      return next(error);
    }

    const { name, description, department, email } = value;

    let clientId;
    try {
      [clientId] = await db('clients').insert({
        name,
        description: description || null,
        department: department || null,
        email: email || null,
        user_email: req.userEmail
      });
    } catch (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to create client' });
    }

    // Return the created client
    let row;
    try {
      row = await db('clients')
        .select(CLIENT_COLUMNS)
        .where({ id: clientId, user_email: req.userEmail })
        .first();
    } catch (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Client created but failed to retrieve' });
    }

    res.status(201).json({
      message: 'Client created successfully',
      client: row
    });
  } catch (error) {
    next(error);
  }
});

// Update client
router.put('/:id', async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id);

    if (isNaN(clientId)) {
      return res.status(400).json({ error: 'Invalid client ID' });
    }

    const { error, value } = updateClientSchema.validate(req.body);
    if (error) {
      return next(error);
    }

    // Check if client exists and belongs to user
    let existing;
    try {
      existing = await db('clients')
        .select('id')
        .where({ id: clientId, user_email: req.userEmail })
        .first();
    } catch (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const updates = {};

    if (value.name !== undefined) {
      updates.name = value.name;
    }

    if (value.description !== undefined) {
      updates.description = value.description || null;
    }

    if (value.department !== undefined) {
      updates.department = value.department || null;
    }

    if (value.email !== undefined) {
      updates.email = value.email || null;
    }

    updates.updated_at = db.fn.now();

    try {
      await db('clients')
        .where({ id: clientId, user_email: req.userEmail })
        .update(updates);
    } catch (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Failed to update client' });
    }

    // Return updated client
    let row;
    try {
      row = await db('clients')
        .select(CLIENT_COLUMNS)
        .where({ id: clientId, user_email: req.userEmail })
        .first();
    } catch (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Client updated but failed to retrieve' });
    }

    res.json({
      message: 'Client updated successfully',
      client: row
    });
  } catch (error) {
    next(error);
  }
});

// Delete all clients for authenticated user
router.delete('/', async (req, res) => {
  try {
    const deletedCount = await db('clients').where({ user_email: req.userEmail }).del();

    res.json({
      message: 'All clients deleted successfully',
      deletedCount
    });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Failed to delete clients' });
  }
});

// Delete client
router.delete('/:id', async (req, res) => {
  const clientId = parseInt(req.params.id);

  if (isNaN(clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }

  // Check if client exists and belongs to user
  let existing;
  try {
    existing = await db('clients')
      .select('id')
      .where({ id: clientId, user_email: req.userEmail })
      .first();
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  if (!existing) {
    return res.status(404).json({ error: 'Client not found' });
  }

  // Delete client (work entries will be deleted due to CASCADE)
  try {
    await db('clients').where({ id: clientId, user_email: req.userEmail }).del();
  } catch (err) {
    console.error('Database error:', err);
    return res.status(500).json({ error: 'Failed to delete client' });
  }

  res.json({ message: 'Client deleted successfully' });
});

module.exports = router;
