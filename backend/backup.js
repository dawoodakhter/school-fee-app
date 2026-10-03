// Backup and restore of all the school data (classes, students, fees, payments, charges, settings).
// The login users are NOT in the backup, so a backup file never contains passwords.

const TABLES = ['classes', 'students', 'monthly_fees', 'payments', 'one_time_charges', 'settings'];
const APP_NAME = 'school-fee-manager';

// db can be a pool or a client
async function makeBackup(db) {
  const tables = {};
  for (const name of TABLES) {
    const order = name === 'settings' ? 'x.key' : 'x.id';
    // row_to_json writes dates as plain text like 2026-09-30, so nothing shifts with time zones
    const r = await db.query(
      `SELECT COALESCE(json_agg(row_to_json(x) ORDER BY ${order}), '[]'::json) AS rows FROM ${name} x`
    );
    tables[name] = r.rows[0].rows;
  }
  const counts = {};
  for (const name of TABLES) counts[name] = tables[name].length;
  return { app: APP_NAME, formatVersion: 1, createdAt: new Date().toISOString(), counts, tables };
}

// throws an Error with a clear message when the file is not a backup of this app
function checkBackup(data) {
  if (!data || typeof data !== 'object' || data.app !== APP_NAME) {
    throw new Error('This file is not a School Fee Manager backup');
  }
  if (data.formatVersion !== 1) throw new Error('This backup has a version this program does not know');
  if (!data.tables || typeof data.tables !== 'object') throw new Error('The backup has no tables');
  for (const name of TABLES) {
    if (!Array.isArray(data.tables[name])) throw new Error(`The backup is missing the "${name}" table`);
    if (!data.tables[name].every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
      throw new Error(`The "${name}" table in the backup has a broken row`);
    }
  }
}

// REPLACES everything in the school tables with the backup. All or nothing.
async function restoreBackup(client, data) {
  checkBackup(data);
  await client.query('BEGIN');
  try {
    await client.query(
      'TRUNCATE payments, monthly_fees, one_time_charges, students, classes, settings RESTART IDENTITY CASCADE'
    );
    for (const name of TABLES) {
      const rows = data.tables[name];
      if (rows.length === 0) continue;
      await client.query(`INSERT INTO ${name} SELECT * FROM jsonb_populate_recordset(null::${name}, $1::jsonb)`, [
        JSON.stringify(rows),
      ]);
    }
    // the next new student, payment... must get a number after the biggest one restored
    for (const name of TABLES.filter((t) => t !== 'settings')) {
      await client.query(
        `SELECT setval(pg_get_serial_sequence('${name}', 'id'),
                       GREATEST(COALESCE((SELECT MAX(id) FROM ${name}), 0), 1),
                       (SELECT COUNT(*) > 0 FROM ${name}))`
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

module.exports = { TABLES, makeBackup, checkBackup, restoreBackup };