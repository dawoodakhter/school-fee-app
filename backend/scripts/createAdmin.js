// Creates the admin login (or changes its password if the username already exists).
// Run: node scripts/createAdmin.js
require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const lines = rl[Symbol.asyncIterator]();
async function ask(question) {
  process.stdout.write(question);
  const { value } = await lines.next();
  return value || '';
}

async function main() {
  const username = String(await ask('Admin username (for example: admin): ')).trim().toLowerCase();
  const password = String(await ask('Admin password (8 or more characters): '));
  rl.close();

  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    console.log('Username must be 3 to 30 letters or numbers (no spaces). Nothing was saved.');
    return;
  }
  if (password.length < 8 || password.length > 72) {
    console.log('Password must be 8 to 72 characters. Nothing was saved.');
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [username, hash]
  );
  console.log(`Done. You can now log in as "${username}".`);
}

main()
  .catch((e) => console.error('Failed:', e.message))
  .finally(() => pool.end());