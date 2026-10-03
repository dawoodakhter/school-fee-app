// Puts a backup file back. It REPLACES all the students, fees and payments in the database.
// Run: node scripts/restoreBackup.js "backups\school-fee-backup-2026-10-01_09-30.json" --yes
// To restore into another database, add its address:  ... --yes "postgresql://..."
require('dotenv').config();
const fs = require('fs');
const makePool = require('../makePool');
const { checkBackup, restoreBackup } = require('../backup');

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--') && !a.startsWith('postgres'));
  const url = args.find((a) => a.startsWith('postgres')) || process.env.DATABASE_URL;
  const confirmed = args.includes('--yes');

  if (!file) {
    console.log('Usage: node scripts/restoreBackup.js "<backup file>" --yes');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  checkBackup(data);

  const host = new URL(url).hostname;
  console.log(`Backup made on: ${data.createdAt}`);
  console.log(
    `It holds ${data.counts.students} students, ${data.counts.payments} payments, ` +
      `${data.counts.monthly_fees} fee months, ${data.counts.one_time_charges} one-time charges.`
  );
  console.log(`Database that will be REPLACED: ${host}`);
  if (!confirmed) {
    console.log('\nNothing was changed. To really do it, run the same command again and add --yes at the end.');
    process.exit(1);
  }

  const pool = makePool(url);
  const client = await pool.connect();
  try {
    await restoreBackup(client, data);
    const check = await client.query('SELECT (SELECT COUNT(*) FROM students) AS s, (SELECT COUNT(*) FROM payments) AS p');
    console.log(`Done. The database now has ${check.rows[0].s} students and ${check.rows[0].p} payments.`);
  } catch (err) {
    console.error('Restore failed, nothing was changed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Stopped:', err.message);
  process.exit(1);
});