// Tests the backup. It only READS your data, so it is safe on your real database.
// It starts the server itself, so stop your own server first.
// Run: node scripts/testBackup.js
require('dotenv').config();
require('../server');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const pool = require('../db');
const { checkBackup } = require('../backup');

const base = `http://localhost:${process.env.PORT || 5000}`;
const token = require('jsonwebtoken').sign({ username: 'test' }, process.env.JWT_SECRET);
let passed = 0, failed = 0;

async function get(url, useToken = true) {
  const headers = {};
  if (useToken) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(base + url, { headers });
  return { status: res.status, headers: res.headers, data: await res.json() };
}

function check(label, ok, extra) {
  if (ok) { passed++; console.log('PASS -', label); }
  else { failed++; console.log('FAIL -', label, extra ? JSON.stringify(extra) : ''); }
}

async function count(table) {
  const r = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return r.rows[0].n;
}

async function main() {
  await new Promise((r) => setTimeout(r, 1500)); // let the server start

  const noLogin = await get('/api/backup', false);
  check('without login the backup is refused (401)', noLogin.status === 401, noLogin.data);

  const res = await get('/api/backup');
  const b = res.data;
  check('with login the backup works', res.status === 200 && b.app === 'school-fee-manager' && b.formatVersion === 1, res.status);
  check('it is sent as a file to save', /attachment; filename="school-fee-backup-\d{4}-\d{2}-\d{2}\.json"/.test(res.headers.get('content-disposition') || ''), res.headers.get('content-disposition'));

  let ok = true;
  for (const table of ['classes', 'students', 'monthly_fees', 'payments', 'one_time_charges', 'settings']) {
    const inDb = await count(table);
    if (b.counts[table] !== inDb || b.tables[table].length !== inDb) ok = false;
  }
  check('every table in the backup has exactly as many rows as the database', ok, b.counts);

  const text = JSON.stringify(b);
  check('the backup has no passwords in it', !/password_hash|\$2[aby]\$/.test(text) && !b.tables.users, {});

  const withDob = b.tables.students.find((s) => s.date_of_birth);
  check('dates are plain text like 2020-05-01 (nothing shifted)', !withDob || /^\d{4}-\d{2}-\d{2}$/.test(withDob.date_of_birth), withDob && withDob.date_of_birth);
  check('the backup passes its own file check', (() => { try { checkBackup(JSON.parse(text)); return true; } catch (e) { return false; } })(), {});

  // the command-line backup writes a file with the same numbers
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fee-backup-'));
  execFileSync(process.execPath, [path.join(__dirname, 'backup.js'), folder], { env: process.env, stdio: 'pipe' });
  const files = fs.readdirSync(folder);
  const fromScript = files.length === 1 ? JSON.parse(fs.readFileSync(path.join(folder, files[0]), 'utf8')) : null;
  check('the backup command saves one file with the same counts',
    fromScript && JSON.stringify(fromScript.counts) === JSON.stringify(b.counts), { files });
  fs.rmSync(folder, { recursive: true, force: true });

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((e) => { failed++; console.error('Test crashed:', e.message); })
  .finally(async () => {
    await pool.end();
    process.exit(failed ? 1 : 0);
  });