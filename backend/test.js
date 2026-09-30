require('dotenv').config();
const { Pool } = require('pg');

console.log(process.env.DATABASE_URL ? 'Step A: address found in .env' : 'Step A: NO address in .env');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.query('SELECT NOW()')
  .then(() => { console.log('Step B: SUCCESS, connected to the database'); pool.end(); })
  .catch((e) => { console.log('Step B: FAILED -', e.message); pool.end(); });
  