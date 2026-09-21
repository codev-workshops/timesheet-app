const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateUser } = require('../middleware/auth');
const PDFDocument = require('pdfkit');

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

const CLIENT_TOTALS_QUERY = `SELECT COALESCE(SUM(hours), 0) AS totalHours, COUNT(*) AS entryCount
   FROM work_entries
   WHERE client_id = ? AND user_email = ?`;

const CSV_CHUNK_SIZE = 64 * 1024;

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

function csvField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// Dashboard summary: SQL aggregates plus the 5 most recent entries
router.get('/summary', (req, res) => {
  const db = getDatabase();

  db.get(
    `SELECT
       (SELECT COUNT(*) FROM clients WHERE user_email = ?) AS totalClients,
       (SELECT COUNT(*) FROM work_entries WHERE user_email = ?) AS totalEntries,
       (SELECT COALESCE(SUM(hours), 0) FROM work_entries WHERE user_email = ?) AS totalHours`,
    [req.userEmail, req.userEmail, req.userEmail],
    (err, totals) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      db.all(
        `SELECT we.id, we.client_id, we.hours, we.description, we.date,
                we.created_at, we.updated_at, c.name as client_name
         FROM work_entries we
         JOIN clients c ON we.client_id = c.id
         WHERE we.user_email = ?
         ORDER BY we.date DESC, we.created_at DESC
         LIMIT 5`,
        [req.userEmail],
        (err, recentEntries) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Internal server error' });
          }

          res.json({
            totalClients: totals ? totals.totalClients : 0,
            totalEntries: totals ? totals.totalEntries : 0,
            totalHours: totals ? totals.totalHours : 0,
            recentEntries: recentEntries || []
          });
        }
      );
    }
  );
});

// Get hourly report for specific client
router.get('/client/:clientId', (req, res) => {
  const clientId = parseInt(req.params.clientId);
  
  if (isNaN(clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  
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
      
      // Aggregate over the full set in SQL
      db.get(CLIENT_TOTALS_QUERY, [clientId, req.userEmail], (err, totals) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Internal server error' });
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
              totalHours: totals ? totals.totalHours : 0,
              entryCount: totals ? totals.entryCount : 0
            });
          }
        );
      });
    }
  );
});

// Export client report as CSV
router.get('/export/csv/:clientId', (req, res) => {
  const clientId = parseInt(req.params.clientId);
  
  if (isNaN(clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  
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
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${sanitizeFilename(client.name)}_report_${timestamp}.csv`;
      let headersSent = false;

      const writeHeader = () => {
        if (headersSent) return;
        headersSent = true;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.write('Date,Hours,Description,Created At\n');
      };

      let failed = false;
      const fail = (error) => {
        if (failed) return;
        failed = true;
        console.error('Error streaming CSV:', error);
        if (!headersSent) {
          return res.status(500).json({ error: 'Failed to generate CSV report' });
        }
        res.destroy(error);
      };

      // Stream rows straight to the response; no temp file. Rows are batched
      // into chunks so the response (and gzip) sees a few large writes.
      let chunk = '';
      const flush = () => {
        if (chunk) {
          res.write(chunk);
          chunk = '';
        }
      };

      db.each(
        `SELECT hours, description, date, created_at
         FROM work_entries 
         WHERE client_id = ? AND user_email = ? 
         ORDER BY date DESC`,
        [clientId, req.userEmail],
        (err, row) => {
          if (err) return fail(err);
          if (failed || res.destroyed) return;
          writeHeader();
          chunk += `${csvField(row.date)},${csvField(row.hours)},${csvField(row.description)},${csvField(row.created_at)}\n`;
          if (chunk.length >= CSV_CHUNK_SIZE) flush();
        },
        (err) => {
          if (err) return fail(err);
          if (failed || res.destroyed) return;
          writeHeader();
          flush();
          res.end();
        }
      );
    }
  );
});

// Export client report as PDF
router.get('/export/pdf/:clientId', (req, res) => {
  const clientId = parseInt(req.params.clientId);
  
  if (isNaN(clientId)) {
    return res.status(400).json({ error: 'Invalid client ID' });
  }
  
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
      
      db.get(CLIENT_TOTALS_QUERY, [clientId, req.userEmail], (err, totals) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: 'Internal server error' });
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
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `${sanitizeFilename(client.name)}_report_${timestamp}.pdf`;
          
            // Set response headers
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          
            // Pipe PDF to response
            doc.pipe(res);
          
            // Add content to PDF
            doc.fontSize(20).text(`Time Report for ${client.name}`, { align: 'center' });
            doc.moveDown();
          
            const totalHours = totals ? Number(totals.totalHours) : 0;
            const entryCount = totals ? totals.entryCount : 0;
            doc.fontSize(14).text(`Total Hours: ${totalHours.toFixed(2)}`);
            doc.text(`Total Entries: ${entryCount}`);
            doc.text(`Generated: ${new Date().toLocaleString()}`);
            doc.moveDown();
          
            // Add table header
            doc.fontSize(12).text('Date', 50, doc.y, { width: 100 });
            doc.text('Hours', 150, doc.y - 15, { width: 80 });
            doc.text('Description', 230, doc.y - 15, { width: 300 });
            doc.moveDown();
          
            // Add horizontal line
            doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
            doc.moveDown(0.5);
          
            // Add work entries
            workEntries.forEach((entry, index) => {
              const y = doc.y;
            
              // Check if we need a new page
              if (y > 700) {
                doc.addPage();
              }
            
              doc.text(entry.date, 50, doc.y, { width: 100 });
              doc.text(entry.hours.toString(), 150, y, { width: 80 });
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
      });
    }
  );
});

module.exports = router;
