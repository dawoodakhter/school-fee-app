// Saves all the school data into one file in the "backups" folder.
// Run: node scripts/backup.js
//
// Optional settings in your .env file:
//   BACKUP_COPY_DIR=G:\My Drive\school-backups     (a second copy goes here, for example Google Drive or a USB stick)
//   BACKUP_KEEP=60                                  (how many backups to keep in the backups folder)
require('dotenv').config();
const path = require('path');
const pool = require('../db');
const { makeBackup } = require('../backup');
const { saveBackupFile } = require('../backupFiles');

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'The database address (DATABASE_URL) was not found. Check that the file backend\\.env exists and is filled in, ' +
        'and that this program is started from the backend folder.'
    );
  }
  const folder = process.argv[2] || path.join(__dirname, '..', 'backups');
  const keep = Number(process.env.BACKUP_KEEP) > 0 ? Number(process.env.BACKUP_KEEP) : 60;
  const copyDir = process.env.BACKUP_COPY_DIR ? process.env.BACKUP_COPY_DIR.trim() : '';

  const backup = await makeBackup(pool);
  const result = saveBackupFile(backup, folder, { keep, copyDir });

  console.log('Backup saved:', result.file);
  console.log(
    `It holds ${backup.counts.students} students, ${backup.counts.payments} payments, ` +
      `${backup.counts.monthly_fees} fee months, ${backup.counts.one_time_charges} one-time charges.`
  );
  if (result.copiedTo) console.log('A second copy was saved here:', result.copiedTo);
  if (result.copyProblem) {
    console.log(`WARNING: the second copy was NOT made (${result.copyProblem}). Check BACKUP_COPY_DIR in your .env file.`);
  }
  if (result.pruned > 0) console.log(`Removed ${result.pruned} old backup file(s) (keeping the newest ${keep}).`);
}

main()
  .catch((err) => {
    // some network errors have an empty message, so also show the error code
    console.error('Backup failed:', err.message || err.code || String(err));
    process.exitCode = 1;
  })
  .finally(() => pool.end());