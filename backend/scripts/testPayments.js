require('./testGuard');
// Tests the payment routes. It starts the server itself, so stop your own server first.
// Run: node scripts/testPayments.js
require('dotenv').config();
require('../server');
const pool = require('../db');

const base = `http://localhost:${process.env.PORT || 5000}`;
let passed = 0, failed = 0;

// every cancel in this test uses a reason that starts with this, so the test can clean up after itself
const TEST_REASON = 'ZZ test: entered by mistake';

async function call(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + require('jsonwebtoken').sign({ username: 'test' }, process.env.JWT_SECRET) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

function check(label, ok, extra) {
  if (ok) { passed++; console.log('PASS -', label); }
  else { failed++; console.log('FAIL -', label, extra ? JSON.stringify(extra) : ''); }
}

async function removeTestRecords() {
  await pool.query("DELETE FROM cancelled_payments WHERE reason LIKE 'ZZ test:%'");
}

async function main() {
  await new Promise((r) => setTimeout(r, 1500)); // let the server start

  // make sure the cancelled-payments table exists, and that old test records from a crashed run are gone
  await call('GET', '/api/payments/cancelled');
  await removeTestRecords();

  const list = await call('GET', '/api/students?class=Playgroup');
  const id = list.data.students[0].id;
  const name = list.data.students[0].name;
  console.log(`Testing with student #${id}: ${name} (Playgroup, fee 1000 a month)\n`);

  let s = await call('GET', `/api/students/${id}/summary`);
  const sep = () => s.data.fees.months[0]; // September 2026 row of the fee card
  const base0 = s.data.fees.totalPaid; // this student may already have other payments, so we compare against this
  check('starts with September unpaid', sep().status === 'pending' && sep().paid === 0, sep());

  const p1 = await call('POST', '/api/payments', { studentId: id, month: '2026-09', amount: 400, receivedBy: 'Test Clerk' });
  check('record payment of 400 works (201)', p1.status === 201, p1);

  s = await call('GET', `/api/students/${id}/summary`);
  check('after 400: September is partial, paid 400, balance 600',
    sep().status === 'partial' && sep().paid === 400 && s.data.fees.totalPaid === base0 + 400 && sep().balance === 600, s.data.fees);

  const p2 = await call('POST', '/api/payments', { studentId: id, month: '2026-09', amount: 600 });
  s = await call('GET', `/api/students/${id}/summary`);
  check('after another 600: September is paid, balance 0',
    sep().status === 'paid' && s.data.fees.totalPaid === base0 + 1000 && sep().balance === 0, s.data.fees);

  const l = await call('GET', `/api/payments?studentId=${id}`);
  check('payment list shows 2 payments', l.data.count === 2, l.data);

  const bad1 = await call('POST', '/api/payments', { studentId: id, month: '2026-09', amount: -5 });
  check('negative amount is rejected (400)', bad1.status === 400, bad1);
  const bad2 = await call('POST', '/api/payments', { studentId: id, month: '2025-01', amount: 100 });
  check('month outside billing window is rejected (400)', bad2.status === 400, bad2);
  const bad3 = await call('POST', '/api/payments', { studentId: 999999, month: '2026-09', amount: 100 });
  check('unknown student is rejected (404)', bad3.status === 404, bad3);
  const bad4 = await call('POST', '/api/payments', { studentId: id, month: 'September', amount: 100 });
  check('wrong month format is rejected (400)', bad4.status === 400, bad4);

  // cancelling needs a reason
  const noReason = await call('DELETE', `/api/payments/${p1.data.id}`);
  check('cancelling without a reason is refused (400)', noReason.status === 400, noReason);
  const shortReason = await call('DELETE', `/api/payments/${p1.data.id}`, { reason: 'x' });
  check('a too short reason is refused (400)', shortReason.status === 400, shortReason);
  const stillThere = await call('GET', `/api/payments?studentId=${id}`);
  check('refused cancels removed nothing', stillThere.data.count === 2, stillThere.data);

  const c1 = await call('DELETE', `/api/payments/${p1.data.id}`, { reason: TEST_REASON });
  check('cancelling the 400 payment with a reason works (200)', c1.status === 200 && c1.data.deleted.amount === 400, c1);
  const c2 = await call('DELETE', `/api/payments/${p2.data.id}`, { reason: TEST_REASON });
  check('cancelling the 600 payment with a reason works (200)', c2.status === 200 && c2.data.deleted.amount === 600, c2);

  s = await call('GET', `/api/students/${id}/summary`);
  check('after cancelling both payments: September back to pending, total back to start',
    sep().status === 'pending' && sep().paid === 0 && s.data.fees.totalPaid === base0, s.data.fees);
  const gone = await call('DELETE', `/api/payments/${p1.data.id}`, { reason: TEST_REASON });
  check('cancelling the same payment twice gives 404', gone.status === 404, gone);

  // the record of cancelled payments
  const cancelled = await call('GET', '/api/payments/cancelled');
  const mine = (cancelled.data.payments || []).filter((p) => p.reason === TEST_REASON && p.studentId === id);
  check('both cancelled payments are in the cancelled list', cancelled.status === 200 && mine.length === 2, cancelled.data);
  const rec = mine.find((p) => p.paymentId === p1.data.id);
  check('the record keeps name, class, month, amount, receiver and reason',
    rec && rec.name === name && rec.class === 'Playgroup' && rec.month === '2026-09' &&
      rec.amount === 400 && rec.receivedBy === 'Test Clerk' && rec.reason === TEST_REASON, rec);
  check('the record has a date and time of cancelling', rec && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(rec.cancelledAt), rec);

  await removeTestRecords(); // leave the demo database as we found it
  console.log(`\n${passed} passed, ${failed} failed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error('Test crashed:', e.message); process.exit(1); });