// Makes a connection to a PostgreSQL database.
// A database on the internet (like Neon) needs a secure connection; one on your own computer does not.
const { Pool } = require('pg');

function makePool(connectionString) {
  const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString || '');
  return new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
}

module.exports = makePool;