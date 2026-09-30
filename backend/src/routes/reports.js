const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateUser } = require('../middleware/auth');
const { stringify } = require('csv-stringify/sync');
const PDFDocument = require('pdfkit');

const router = express.Router();
const ID_PATTERN = /^\d+$/;

// All routes require authentication
router.use(authenticateUser);

function sumHours(entries) {
  // Round to cents to avoid binary float artifacts (0.1 + 0.2 = 0.30000000000000004)
  const cents = entries.reduce((sum, entry) => sum + Math.round(Number(entry.hours) * 100), 0);
  return cents / 100;
}

function reportFilename(clientName, ext) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_report_${timestamp}.${ext}`;
}

// Get hourly report for specific client
router.get('/client/:clientId', (req, res) => {
  if (!ID_PATTERN.test(req.params.clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  const clientId = parseInt(req.params.clientId, 10);

  const db = getDatabase();

  // Verify client belongs to user
  db.get(
    'SELECT id, name FROM clients WHERE id = ? AND user_email = ?',
    [clientId, req.userEmail],
    (err, client) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      // Get work entries for this client
      db.all(
        `SELECT id, hours, description, date, created_at, updated_at
         FROM work_entries
         WHERE client_id = ? AND user_email = ?
         ORDER BY date DESC`,
        [clientId, req.userEmail],
        (err, workEntries) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          res.json({
            client: client,
            workEntries: workEntries,
            totalHours: sumHours(workEntries),
            entryCount: workEntries.length
          });
        }
      );
    }
  );
});

// Export client report as CSV (generated in memory, no temp files)
router.get('/export/csv/:clientId', (req, res) => {
  if (!ID_PATTERN.test(req.params.clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  const clientId = parseInt(req.params.clientId, 10);

  const db = getDatabase();

  // Verify client belongs to user and get data
  db.get(
    'SELECT id, name FROM clients WHERE id = ? AND user_email = ?',
    [clientId, req.userEmail],
    (err, client) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      // Get work entries
      db.all(
        `SELECT hours, description, date, created_at
         FROM work_entries
         WHERE client_id = ? AND user_email = ?
         ORDER BY date DESC`,
        [clientId, req.userEmail],
        (err, workEntries) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          try {
            const csv = stringify(workEntries, {
              header: true,
              columns: [
                { key: 'date', header: 'Date' },
                { key: 'hours', header: 'Hours' },
                { key: 'description', header: 'Description' },
                { key: 'created_at', header: 'Created At' }
              ]
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${reportFilename(client.name, 'csv')}"`);
            res.send(csv);
          } catch (error) {
            console.error('Error creating CSV:', error);
            res.status(500).json({ error: 'Failed to generate CSV report' });
          }
        }
      );
    }
  );
});

// Export client report as PDF
router.get('/export/pdf/:clientId', (req, res) => {
  if (!ID_PATTERN.test(req.params.clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  const clientId = parseInt(req.params.clientId, 10);

  const db = getDatabase();

  // Verify client belongs to user and get data
  db.get(
    'SELECT id, name FROM clients WHERE id = ? AND user_email = ?',
    [clientId, req.userEmail],
    (err, client) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!client) {
        return res.status(404).json({ error: 'Client not found' });
      }

      // Get work entries
      db.all(
        `SELECT hours, description, date, created_at
         FROM work_entries
         WHERE client_id = ? AND user_email = ?
         ORDER BY date DESC`,
        [clientId, req.userEmail],
        (err, workEntries) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          // Create PDF
          const doc = new PDFDocument();

          // Set response headers
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${reportFilename(client.name, 'pdf')}"`);

          // Pipe PDF to response
          doc.pipe(res);

          // Add content to PDF
          doc.fontSize(20).text(`Time Report for ${client.name}`, { align: 'center' });
          doc.moveDown();

          doc.fontSize(14).text(`Total Hours: ${sumHours(workEntries).toFixed(2)}`);
          doc.text(`Total Entries: ${workEntries.length}`);
          doc.text(`Generated: ${new Date().toLocaleString()}`);
          doc.moveDown();

          // Add table header
          const headerY = doc.y;
          doc.fontSize(12).text('Date', 50, headerY, { width: 100 });
          doc.text('Hours', 150, headerY, { width: 80 });
          doc.text('Description', 230, headerY, { width: 300 });
          doc.moveDown();

          // Add horizontal line
          doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
          doc.moveDown(0.5);

          // Add work entries
          workEntries.forEach((entry, index) => {
            // Check if we need a new page before capturing the row's y position
            if (doc.y > 700) {
              doc.addPage();
            }

            const y = doc.y;
            doc.text(String(entry.date), 50, y, { width: 100 });
            doc.text(Number(entry.hours).toFixed(2), 150, y, { width: 80 });
            doc.text(entry.description || 'No description', 230, y, { width: 300 });
            doc.moveDown();

            // Add separator line every 5 entries
            if ((index + 1) % 5 === 0) {
              doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
              doc.moveDown(0.5);
            }
          });

          // Finalize PDF
          doc.end();
        }
      );
    }
  );
});

module.exports = router;
