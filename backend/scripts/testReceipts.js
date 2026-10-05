// Tests the receipt route. It makes its own test class and test student (so your real students are never
// touched) and removes them at the end. It starts the server itself, so stop your own server first.
// Run: node scripts/testReceipts.js
require('dotenv').config();
require('../server');
const pool = require('../db');

const base = `http://localhost:${process.env.PORT || 5000}`;
const token = require('jsonwebtoken').sign({ username: 'test' }, process.env.JWT_SECRET);
let passed = 0, failed = 0;

async function call(method, url, body, useToken = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (useToken) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json() };
}

function check(label, ok, extra) {
  if (ok) { passed++; console.log('PASS -', label); }
  else { failed++; console.log('FAIL -', label, extra ? JSON.stringify(extra) : ''); }
}

const SCHOOL_KEYS = ['school_name', 'school_address', 'school_phone'];
let savedSchool = [];

async function removeTestData() {
  await pool.query("DELETE FROM students WHERE class_id IN (SELECT id FROM classes WHERE name LIKE 'ZZ Test%')");
  await pool.query("DELETE FROM classes WHERE name LIKE 'ZZ Test%'");
}

async function main() {
  await new Promise((r) => setTimeout(r, 1500)); // let the server start
  await removeTestData();
  savedSchool = (await pool.query('SELECT key, value FROM settings WHERE key = ANY($1)', [SCHOOL_KEYS])).rows;
  await call('PUT', '/api/settings/school', { schoolName: 'Test School', schoolAddress: 'Test Street 1', schoolPhone: '0300 0000000' });

  const months = (await call('GET', '/api/settings')).data.months;
  const cls = await call('POST', '/api/classes', { name: 'ZZ Test Class', monthlyFee: 1000 });
  const student = await call('POST', '/api/students', {
    name: 'zz receipt kid', rollNumber: 'ZR1', classId: cls.data.id, guardianName: 'zz parent',
  });
  const studentId = student.data.id;

  const pay = await call('POST', '/api/payments', { studentId, month: months[0], amount: 400, paidOn: '2026-09-15', receivedBy: 'Test Clerk' });
  const paymentId = pay.data.id;

  const noLogin = await call('GET', `/api/payments/${paymentId}/receipt`, null, false);
  check('without login the receipt is refused (401)', noLogin.status === 401, noLogin.data);

  const r = await call('GET', `/api/payments/${paymentId}/receipt`);
  check('a receipt can be asked for', r.status === 200, r.data);
  check('it has a receipt number made from the payment number',
    r.data.receipt.number === 'R-' + String(paymentId).padStart(6, '0') && r.data.receipt.id === paymentId, r.data.receipt);
  check('it shows the amount, the date, the month and who received it',
    r.data.receipt.amount === 400 && r.data.receipt.paidOn === '2026-09-15' &&
    r.data.receipt.month === months[0] && r.data.receipt.receivedBy === 'Test Clerk', r.data.receipt);
  check('it shows the student, the class and the guardian',
    r.data.student.name === 'Zz Receipt Kid' && r.data.student.class === 'ZZ Test Class' &&
    r.data.student.rollNumber === 'ZR1' && r.data.student.guardianName === 'Zz Parent', r.data.student);
  check('it shows the school details', r.data.school.name === 'Test School' && r.data.school.address === 'Test Street 1' && r.data.school.phone === '0300 0000000', r.data.school);
  check('the balance says paid 400 and how much is still owed',
    r.data.balance.totalPaid === 400 && r.data.balance.remaining === r.data.balance.totalDue - 400 && r.data.balance.totalDue >= 1000, r.data.balance);

  const pay2 = await call('POST', '/api/payments', { studentId, month: months[0], amount: 100 });
  const r2 = await call('GET', `/api/payments/${pay2.data.id}/receipt`);
  check('a second payment gets its own number and the balance has gone down',
    r2.data.receipt.number !== r.data.receipt.number && r2.data.balance.totalPaid === 500 && r2.data.receipt.receivedBy === null, r2.data);

  const ghost = await call('GET', '/api/payments/99999999/receipt');
  check('a payment that does not exist gives 404', ghost.status === 404, ghost.data);
  const bad = await call('GET', '/api/payments/abc/receipt');
  check('a bad payment number gives 400', bad.status === 400, bad.data);

  await call('DELETE', `/api/payments/${paymentId}`);
  const deleted = await call('GET', `/api/payments/${paymentId}/receipt`);
  check('after a payment is deleted its receipt is gone (404)', deleted.status === 404, deleted.data);

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((e) => { failed++; console.error('Test crashed:', e.message); })
  .finally(async () => {
    try {
      await removeTestData();
      await pool.query('DELETE FROM settings WHERE key = ANY($1)', [SCHOOL_KEYS]);
      for (const row of savedSchool) {
        await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2)', [row.key, row.value]);
      }
      console.log('Test class, test student and the school details were put back.');
    } catch (e) {
      console.error('Cleanup problem:', e.message);
    }
    await pool.end();
    process.exit(failed ? 1 : 0);
  });