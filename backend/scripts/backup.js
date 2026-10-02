// Manual database backup for file-based SQLite deployments.
//
// Usage:
//   DATABASE_PATH=/app/data/timesheet.db node scripts/backup.js
//   BACKUP_DIR=/app/data/backups DATABASE_PATH=/app/data/timesheet.db node scripts/backup.js
//
// Prints the backup file path on success and exits non-zero on failure or
// when the database is in-memory (nothing on disk to back up).
// See RUNBOOK.md "SEV-1: Data loss / DB reset" for the restore procedure.

const { backupDatabase, closeDatabase } = require('../src/database/init');

backupDatabase()
  .then(async (dest) => {
    await closeDatabase();
    if (!dest) {
      process.exit(1);
    }
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Backup failed:', err);
    await closeDatabase();
    process.exit(1);
  });
