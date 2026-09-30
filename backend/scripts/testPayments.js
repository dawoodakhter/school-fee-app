// Tests the payment routes. It starts the server itself, so stop your own server first.
// Run: node scripts/testPayments.js
require('dotenv').config();
require('../server');
const pool = require('../db');

const base = `http://localhost:${process.env.PORT || 5000}`;
let passed = 0, failed = 0;

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

async function main() {
  await new Promise((r) => setTimeout(r, 1500)); // let the server start

  const list = await call('GET', '/api/students?class=Playgroup');
  const id = list.data.students[0].id;
  const name = list.data.students[0].name;
  console.log(`Testing with student #${id}: ${name} (Playgroup, fee 1000 a month)\n`);

  let s = await call('GET', `/api/students/${id}/summary`);
  check('starts unpaid: status pending, totalPaid 0', s.data.fees.status === 'pending' && s.data.fees.totalPaid === 0, s.data.fees);

  const p1 = await call('POST', '/api/payments', { studentId: id, month: '2026-09', amount: 400, receivedBy: 'Test Clerk' });
  check('record payment of 400 works (201)', p1.status === 201, p1);

  s = await call('GET', `/api/students/${id}/summary`);
  const sep = () => s.data.fees.months[0]; // September 2026 row of the fee card
  check('after 400: September is partial, paid 400, balance 600',
    sep().status === 'partial' && s.data.fees.totalPaid === 400 && sep().balance === 600, s.data.fees);

  const p2 = await call('POST', '/api/payments', { studentId: id, month: '2026-09', amount: 600 });
  s = await call('GET', `/api/students/${id}/summary`);
  check('after another 600: September is paid, balance 0',
    sep().status === 'paid' && s.data.fees.totalPaid === 1000 && sep().balance === 0, s.data.fees);

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

  await call('DELETE', `/api/payments/${p1.data.id}`);
  await call('DELETE', `/api/payments/${p2.data.id}`);
  s = await call('GET', `/api/students/${id}/summary`);
  check('after deleting both payments: back to pending, paid 0',
    s.data.fees.status === 'pending' && s.data.fees.totalPaid === 0, s.data.fees);
  const gone = await call('DELETE', `/api/payments/${p1.data.id}`);
  check('deleting the same payment twice gives 404', gone.status === 404, gone);

  console.log(`\n${passed} passed, ${failed} failed`);
  await pool.end();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error('Test crashed:', e.message); process.exit(1); });