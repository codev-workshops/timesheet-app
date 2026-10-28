const express = require('express');
const { getDatabase } = require('../database/init');
const { authenticateUser } = require('../middleware/auth');
const { requireManager } = require('../middleware/managerAuth');
const { teamDateRangeSchema, teamSummarySchema } = require('../validation/schemas');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

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
          
          // Calculate total hours
          const totalHours = workEntries.reduce((sum, entry) => sum + parseFloat(entry.hours), 0);
          
          res.json({
            client: client,
            workEntries: workEntries,
            totalHours: totalHours,
            entryCount: workEntries.length
          });
        }
      );
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
          
          // Create temporary CSV file
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `${client.name.replace(/[^a-zA-Z0-9]/g, '_')}_report_${timestamp}.csv`;
          const tempPath = path.join(__dirname, '../../temp', filename);
          
          // Ensure temp directory exists
          const tempDir = path.dirname(tempPath);
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          
          const csvWriter = createCsvWriter({
            path: tempPath,
            header: [
              { id: 'date', title: 'Date' },
              { id: 'hours', title: 'Hours' },
              { id: 'description', title: 'Description' },
              { id: 'created_at', title: 'Created At' }
            ]
          });
          
          csvWriter.writeRecords(workEntries)
            .then(() => {
              // Send file and clean up
              res.download(tempPath, filename, (err) => {
                if (err) {
                  console.error('Error sending file:', err);
                }
                // Clean up temp file
                fs.unlink(tempPath, (unlinkErr) => {
                  if (unlinkErr) {
                    console.error('Error deleting temp file:', unlinkErr);
                  }
                });
              });
            })
            .catch((error) => {
              console.error('Error creating CSV:', error);
              res.status(500).json({ error: 'Failed to generate CSV report' });
            });
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
          const filename = `${client.name.replace(/[^a-zA-Z0-9]/g, '_')}_report_${timestamp}.pdf`;
          
          // Set response headers
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
          
          // Pipe PDF to response
          doc.pipe(res);
          
          // Add content to PDF
          doc.fontSize(20).text(`Time Report for ${client.name}`, { align: 'center' });
          doc.moveDown();
          
          const totalHours = workEntries.reduce((sum, entry) => sum + parseFloat(entry.hours), 0);
          doc.fontSize(14).text(`Total Hours: ${totalHours.toFixed(2)}`);
          doc.text(`Total Entries: ${workEntries.length}`);
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
    }
  );
});

// ---------------------------------------------------------------------------
// Manager team reports. Scoped to employees mapped to the caller in
// manager_employees; never returns data for unmanaged users.
// ---------------------------------------------------------------------------

// work_entries.date holds either 'YYYY-MM-DD' text (seed data) or epoch
// milliseconds (dates bound as JS Date objects by POST /api/work-entries).
const ENTRY_DAY_SQL = `(CASE WHEN typeof(we.date) IN ('integer', 'real')
  THEN date(we.date / 1000, 'unixepoch') ELSE date(we.date) END)`;

const MANAGED_EMPLOYEES_SQL = 'SELECT employee_email FROM manager_employees WHERE manager_email = ?';

const PERIOD_FORMATS = {
  week: '%Y-%W',
  month: '%Y-%m'
};

function validateQuery(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    req.reportQuery = value;
    next();
  };
}

function getTeamEntries(managerEmail, startDate, endDate, callback) {
  getDatabase().all(
    `SELECT we.user_email AS employee_email, ${ENTRY_DAY_SQL} AS date, c.name AS client_name,
            we.hours, we.description
     FROM work_entries we
     JOIN clients c ON c.id = we.client_id AND c.user_email = we.user_email
     WHERE we.user_email IN (${MANAGED_EMPLOYEES_SQL})
       AND ${ENTRY_DAY_SQL} BETWEEN ? AND ?
     ORDER BY we.user_email, date, c.name`,
    [managerEmail, startDate, endDate],
    callback
  );
}

function sumHours(entries) {
  return Math.round(entries.reduce((sum, entry) => sum + parseFloat(entry.hours), 0) * 100) / 100;
}

function teamReportFilename(startDate, endDate, extension) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `team_report_${startDate}_${endDate}_${timestamp}.${extension}`;
}

router.use('/team', requireManager);

// List employees managed by the caller
router.get('/team/employees', (req, res) => {
  res.json({
    employees: req.managedEmployees.map((email) => ({ email }))
  });
});

// Hours per employee per week/month
router.get('/team/summary', validateQuery(teamSummarySchema), (req, res) => {
  const { start_date: startDate, end_date: endDate, group_by: groupBy } = req.reportQuery;

  getDatabase().all(
    `SELECT we.user_email AS employee_email,
            strftime(?, ${ENTRY_DAY_SQL}) AS period,
            ROUND(SUM(we.hours), 2) AS total_hours
     FROM work_entries we
     JOIN clients c ON c.id = we.client_id AND c.user_email = we.user_email
     WHERE we.user_email IN (${MANAGED_EMPLOYEES_SQL})
       AND ${ENTRY_DAY_SQL} BETWEEN ? AND ?
     GROUP BY we.user_email, period
     ORDER BY period, we.user_email`,
    [PERIOD_FORMATS[groupBy], req.userEmail, startDate, endDate],
    (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      res.json({
        startDate,
        endDate,
        groupBy,
        summary: rows
      });
    }
  );
});

// Hours per client (grouped by client name, since client rows are per-user) per employee
router.get('/team/by-project', validateQuery(teamDateRangeSchema), (req, res) => {
  const { start_date: startDate, end_date: endDate } = req.reportQuery;

  getDatabase().all(
    `SELECT c.name AS client_name,
            we.user_email AS employee_email,
            ROUND(SUM(we.hours), 2) AS total_hours
     FROM work_entries we
     JOIN clients c ON c.id = we.client_id AND c.user_email = we.user_email
     WHERE we.user_email IN (${MANAGED_EMPLOYEES_SQL})
       AND ${ENTRY_DAY_SQL} BETWEEN ? AND ?
     GROUP BY c.name, we.user_email
     ORDER BY c.name, we.user_email`,
    [req.userEmail, startDate, endDate],
    (err, rows) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      const totalsByClient = new Map();
      rows.forEach((row) => {
        totalsByClient.set(row.client_name, (totalsByClient.get(row.client_name) || 0) + row.total_hours);
      });
      const projectTotals = Array.from(totalsByClient, ([clientName, totalHours]) => ({
        client_name: clientName,
        total_hours: Math.round(totalHours * 100) / 100
      }));

      res.json({
        startDate,
        endDate,
        byProject: rows,
        projectTotals
      });
    }
  );
});

// Drill-down into a single managed employee
router.get('/team/employee/:email', validateQuery(teamDateRangeSchema), (req, res) => {
  const employeeEmail = req.params.email;

  if (!req.managedEmployees.includes(employeeEmail)) {
    return res.status(403).json({ error: 'Employee is not managed by you' });
  }

  const { start_date: startDate, end_date: endDate } = req.reportQuery;

  getDatabase().all(
    `SELECT we.id, ${ENTRY_DAY_SQL} AS date, we.hours, we.description, c.name AS client_name,
            we.created_at, we.updated_at
     FROM work_entries we
     JOIN clients c ON c.id = we.client_id AND c.user_email = we.user_email
     WHERE we.user_email = ?
       AND ${ENTRY_DAY_SQL} BETWEEN ? AND ?
     ORDER BY date DESC, we.id DESC`,
    [employeeEmail, startDate, endDate],
    (err, workEntries) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      res.json({
        employee_email: employeeEmail,
        startDate,
        endDate,
        workEntries,
        totalHours: sumHours(workEntries),
        entryCount: workEntries.length
      });
    }
  );
});

// Export team report as CSV
router.get('/team/export/csv', validateQuery(teamDateRangeSchema), (req, res) => {
  const { start_date: startDate, end_date: endDate } = req.reportQuery;

  getTeamEntries(req.userEmail, startDate, endDate, (err, entries) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    const filename = teamReportFilename(startDate, endDate, 'csv');
    const tempPath = path.join(__dirname, '../../temp', filename);

    const tempDir = path.dirname(tempPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const csvWriter = createCsvWriter({
      path: tempPath,
      header: [
        { id: 'employee_email', title: 'Employee' },
        { id: 'date', title: 'Date' },
        { id: 'client_name', title: 'Client' },
        { id: 'hours', title: 'Hours' },
        { id: 'description', title: 'Description' }
      ]
    });

    csvWriter.writeRecords(entries)
      .then(() => {
        res.download(tempPath, filename, (downloadErr) => {
          if (downloadErr) {
            console.error('Error sending file:', downloadErr);
          }
          fs.unlink(tempPath, (unlinkErr) => {
            if (unlinkErr) {
              console.error('Error deleting temp file:', unlinkErr);
            }
          });
        });
      })
      .catch((error) => {
        console.error('Error creating CSV:', error);
        res.status(500).json({ error: 'Failed to generate CSV report' });
      });
  });
});

// Export team report as PDF
router.get('/team/export/pdf', validateQuery(teamDateRangeSchema), (req, res) => {
  const { start_date: startDate, end_date: endDate } = req.reportQuery;

  getTeamEntries(req.userEmail, startDate, endDate, (err, entries) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    const doc = new PDFDocument();
    const filename = teamReportFilename(startDate, endDate, 'pdf');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    doc.fontSize(20).text('Team Time Report', { align: 'center' });
    doc.moveDown();

    doc.fontSize(14).text(`Period: ${startDate} to ${endDate}`);
    doc.text(`Total Hours: ${sumHours(entries).toFixed(2)}`);
    doc.text(`Total Entries: ${entries.length}`);
    doc.text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown();

    doc.fontSize(14).text('Hours by Employee');
    doc.fontSize(12);
    req.managedEmployees.forEach((email) => {
      const employeeEntries = entries.filter((entry) => entry.employee_email === email);
      doc.text(`${email}: ${sumHours(employeeEntries).toFixed(2)} hours (${employeeEntries.length} entries)`);
    });
    doc.moveDown();

    doc.fontSize(12).text('Date', 50, doc.y, { width: 80 });
    doc.text('Employee', 130, doc.y - 15, { width: 150 });
    doc.text('Client', 280, doc.y - 15, { width: 120 });
    doc.text('Hours', 400, doc.y - 15, { width: 50 });
    doc.text('Description', 450, doc.y - 15, { width: 100 });
    doc.moveDown();

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    entries.forEach((entry, index) => {
      if (doc.y > 700) {
        doc.addPage();
      }
      const y = doc.y;

      doc.text(entry.date, 50, y, { width: 80 });
      doc.text(entry.employee_email, 130, y, { width: 150 });
      doc.text(entry.client_name, 280, y, { width: 120 });
      doc.text(entry.hours.toString(), 400, y, { width: 50 });
      doc.text(entry.description || 'No description', 450, y, { width: 100 });
      doc.moveDown();

      if ((index + 1) % 5 === 0) {
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown(0.5);
      }
    });

    doc.end();
  });
});

module.exports = router;
