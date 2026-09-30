// Tests the login. It starts the server itself, so stop your own server first.
// Run: node scripts/testAuth.js
// It makes a temporary test login and deletes it at the end. Your real admin is not touched.
require('dotenv').config();
require('../server');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const base = `http://localhost:${process.env.PORT || 5000}`;
let passed = 0, failed = 0;

async function call(method, url, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  return { status: res.status, data };
}

function check(label, ok, extra) {
  if (ok) { passed++; console.log('PASS -', label); }
  else { failed++; console.log('FAIL -', label, extra ? JSON.stringify(extra) : ''); }
}

const TEST_USER = 'zz_test_admin';

async function main() {
  await new Promise((r) => setTimeout(r, 1500)); // let the server start
  await pool.query(
    `INSERT INTO users (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [TEST_USER, await bcrypt.hash('first-password-1', 10)]);

  const open = await call('GET', '/health');
  check('the health page stays open and does not show student numbers', open.status === 200 && open.data.students === undefined, open);

  for (const url of ['/api/students', '/api/classes', '/api/payments?studentId=1', '/api/charges/one-time?studentId=1']) {
    const r = await call('GET', url);
    check(`${url} without login is refused (401)`, r.status === 401, r);
  }
  const noPost = await call('POST', '/api/payments', { studentId: 1, month: '2026-09', amount: 100 });
  check('recording a payment without login is refused (401)', noPost.status === 401, noPost);

  const wrongPass = await call('POST', '/api/auth/login', { username: TEST_USER, password: 'wrong-password' });
  check('wrong password is refused (401)', wrongPass.status === 401, wrongPass);
  const wrongUser = await call('POST', '/api/auth/login', { username: 'nobody_here', password: 'first-password-1' });
  check('wrong username gives the same message as a wrong password',
    wrongUser.status === 401 && wrongUser.data.message === wrongPass.data.message, wrongUser);
  const empty = await call('POST', '/api/auth/login', { username: TEST_USER });
  check('missing password is refused (400)', empty.status === 400, empty);

  const login = await call('POST', '/api/auth/login', { username: TEST_USER.toUpperCase(), password: 'first-password-1' });
  check('correct login works and gives a token (username is not case sensitive)', login.status === 200 && !!login.data.token, login);
  const token = login.data.token;

  const me = await call('GET', '/api/auth/me', null, token);
  check('the token shows who is logged in', me.status === 200 && me.data.username === TEST_USER, me);
  const students = await call('GET', '/api/students', null, token);
  check('with the token, the student list works (400 students)', students.status === 200 && students.data.count >= 1, { status: students.status });

  const tampered = await call('GET', '/api/students', null, token.slice(0, -3) + 'abc');
  check('a changed token is refused (401)', tampered.status === 401, tampered);
  const fake = jwt.sign({ username: 'hacker' }, 'some-other-secret-that-is-long-enough-123');
  const fakeRes = await call('GET', '/api/students', null, fake);
  check('a token made with another secret is refused (401)', fakeRes.status === 401, fakeRes);
  const expired = jwt.sign({ username: 'late' }, process.env.JWT_SECRET, { expiresIn: -10 });
  const expiredRes = await call('GET', '/api/students', null, expired);
  check('an expired token is refused (401)', expiredRes.status === 401, expiredRes);

  const short = await call('POST', '/api/auth/change-password', { currentPassword: 'first-password-1', newPassword: 'short' }, token);
  check('a too-short new password is refused (400)', short.status === 400, short);
  const badCurrent = await call('POST', '/api/auth/change-password', { currentPassword: 'not-right', newPassword: 'second-password-2' }, token);
  check('wrong current password is refused (401)', badCurrent.status === 401, badCurrent);
  const changed = await call('POST', '/api/auth/change-password', { currentPassword: 'first-password-1', newPassword: 'second-password-2' }, token);
  check('changing the password works', changed.status === 200, changed);
  const oldLogin = await call('POST', '/api/auth/login', { username: TEST_USER, password: 'first-password-1' });
  check('the old password no longer works (401)', oldLogin.status === 401, oldLogin);
  const newLogin = await call('POST', '/api/auth/login', { username: TEST_USER, password: 'second-password-2' });
  check('the new password works', newLogin.status === 200, newLogin);

  const saved = await pool.query('SELECT password_hash FROM users WHERE username = $1', [TEST_USER]);
  check('the password is stored scrambled, not as text', saved.rows[0].password_hash.startsWith('$2') && !saved.rows[0].password_hash.includes('second-password-2'), {});

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((e) => { failed++; console.error('Test crashed:', e.message); })
  .finally(async () => {
    await pool.query('DELETE FROM users WHERE username = $1', [TEST_USER]);
    console.log('Temporary test login removed.');
    await pool.end();
    process.exit(failed ? 1 : 0);
  });