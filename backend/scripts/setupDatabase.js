// Creates all the tables in a database (it never deletes anything).
// Your own database:       node scripts/setupDatabase.js
// Another database:        node scripts/setupDatabase.js "postgresql://..."
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const makePool = require('../makePool');

async function main() {
  const url = process.argv[2] || process.env.DATABASE_URL;
  if (!url) {
    console.log('No database address. Put DATABASE_URL in .env, or give the address after the command.');
    process.exit(1);
  }
  const pool = makePool(url);
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
    const r = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
    console.log('Tables ready:', r.rows.map((x) => x.table_name).join(', '));
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();