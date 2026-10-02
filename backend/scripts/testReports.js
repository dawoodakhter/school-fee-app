// Tests the report route. It starts the server itself, so stop your own server first.
// Run: node scripts/testReports.js
// It adds 3 test payments and removes them again at the end.
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

const created = [];
const RANGE = '/api/reports/collections?from=2026-09-01&to=2026-09-30';

async function main() {
  await new Promise((r) => setTimeout(r, 1500)); // let the server start

  const students = (await call('GET', '/api/students')).data.students;
  const a = students[0].id;
  const b = students[1].id;
  const before = (await call('GET', RANGE)).data;

  const add = async (studentId, amount, paidOn, receivedBy) => {
    const r = await call('POST', '/api/payments', { studentId, month: '2026-09', amount, paidOn, receivedBy });
    created.push(r.data.id);
    return r;
  };
  await add(a, 400, '2026-09-15', 'ZZ Test Clerk');
  await add(b, 250, '2026-09-15', 'ZZ Test Clerk');
  await add(a, 100, '2026-09-20', null);

  const after = (await call('GET', RANGE)).data;
  check('the report shows 3 more payments', after.count - before.count === 3, { before: before.count, after: after.count });
  check('the total goes up by 750', after.total - before.total === 750, { before: before.total, after: after.total });

  const clerk = after.byReceiver.find((x) => x.receivedBy === 'ZZ Test Clerk');
  const clerkBefore = before.byReceiver.find((x) => x.receivedBy === 'ZZ Test Clerk');
  check('the clerk shows 2 payments adding up to 650', clerk && clerk.count === 2 && clerk.total === 650 && !clerkBefore, clerk);
  const none = after.byReceiver.find((x) => x.receivedBy === '(not recorded)');
  check('a payment with nobody written down is counted as (not recorded)', none && none.total >= 100, none);

  const mine = after.payments.filter((p) => created.includes(p.id));
  check('each payment shows the student name, class and roll number',
    mine.length === 3 && mine.every((p) => p.name && p.class && p.rollNumber && p.studentId), mine[0]);
  check('payments come in date order', after.payments.every((p, i, all) => i === 0 || all[i - 1].paidOn <= p.paidOn), {});
  check('dates are plain text like 2026-09-15', mine.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.paidOn)), mine[0]);

  const oneDay = (await call('GET', '/api/reports/collections?from=2026-09-20&to=2026-09-20')).data;
  check('a single day only shows that day (both ends are included)',
    oneDay.payments.every((p) => p.paidOn === '2026-09-20') && oneDay.payments.some((p) => p.id === created[2]), oneDay.count);
  const outside = (await call('GET', '/api/reports/collections?from=2026-10-01&to=2026-10-31')).data;
  check('payments from September are not in the October report', !outside.payments.some((p) => created.includes(p.id)), outside.count);

  const noFrom = await call('GET', '/api/reports/collections?to=2026-09-30');
  check('missing from date is refused (400)', noFrom.status === 400, noFrom);
  const badDate = await call('GET', '/api/reports/collections?from=30-09-2026&to=2026-09-30');
  check('wrong date format is refused (400)', badDate.status === 400, badDate);
  const fake = await call('GET', '/api/reports/collections?from=2026-02-31&to=2026-03-05');
  check('a date that does not exist is refused (400)', fake.status === 400, fake);
  const reversed = await call('GET', '/api/reports/collections?from=2026-09-30&to=2026-09-01');
  check('from after to is refused (400)', reversed.status === 400, reversed);
  const tooLong = await call('GET', '/api/reports/collections?from=2024-01-01&to=2026-01-01');
  check('a range longer than a year is refused (400)', tooLong.status === 400, tooLong);
  const noLogin = await call('GET', RANGE, null, false);
  check('without login the report is refused (401)', noLogin.status === 401, noLogin);

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((e) => { failed++; console.error('Test crashed:', e.message); })
  .finally(async () => {
    if (created.length) await pool.query('DELETE FROM payments WHERE id = ANY($1::int[])', [created]);
    const left = await pool.query('SELECT COUNT(*) FROM payments');
    console.log(`Test payments removed. Payments in database: ${left.rows[0].count}`);
    await pool.end();
    process.exit(failed ? 1 : 0);
  });