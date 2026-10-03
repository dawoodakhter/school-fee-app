// Saves all the school data into one file in the "backups" folder.
// Run: node scripts/backup.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../db');
const { makeBackup } = require('../backup');

async function main() {
  const folder = process.argv[2] || path.join(__dirname, '..', 'backups');
  fs.mkdirSync(folder, { recursive: true });

  const backup = await makeBackup(pool);
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `school-fee-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}.json`;
  const file = path.join(folder, name);
  fs.writeFileSync(file, JSON.stringify(backup, null, 2));

  console.log('Backup saved:', file);
  console.log(
    `It holds ${backup.counts.students} students, ${backup.counts.payments} payments, ` +
      `${backup.counts.monthly_fees} fee months, ${backup.counts.one_time_charges} one-time charges.`
  );
}

main()
  .catch((err) => {
    console.error('Backup failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());