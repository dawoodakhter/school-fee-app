// Tests adding, editing and deactivating students. It starts the server itself,
// so stop your own server first. Run: node scripts/testStudents.js
// It creates 2 test students and deletes them again at the end.
require('dotenv').config();
require('../server');
const pool = require('../db');

const base = `http://localhost:${process.env.PORT || 5000}`;
let passed = 0, failed = 0;

async function call(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
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

  const before = await call('GET', '/api/students');
  const cls = await call('GET', '/api/classes');
  const c1 = cls.data.classes.find((c) => c.name === 'Class 1');
  const c2 = cls.data.classes.find((c) => c.name === 'Class 2');
  check('classes list has 9 classes', cls.data.count === 9, cls.data);
  console.log(`Class 1 fee ${c1.monthlyFee}, Class 2 fee ${c2.monthlyFee}\n`);

  const created = await call('POST', '/api/students', {
    name: 'test student one', rollNumber: 't900', classId: c1.id, guardianName: 'test guardian', concession: 100,
  });
  check('add a student works (201), name and roll number are tidied',
    created.status === 201 && created.data.name === 'Test Student One' && created.data.rollNumber === 'T900', created);
  const id = created.data.id;

  const fee = async () => (await call('GET', `/api/students/${id}/summary`)).data.fees;
  let f = await fee();
  check(`new student has 7 months and yearly fee (${c1.monthlyFee} - 100) x 7`,
    f.months.length === 7 && f.fullYearDue === (c1.monthlyFee - 100) * 7, f);

  const dup = await call('POST', '/api/students', { name: 'Another One', rollNumber: 'T900', classId: c1.id });
  check('same roll number in the same class is refused (409)', dup.status === 409, dup);
  const other = await call('POST', '/api/students', { name: 'test student two', rollNumber: 'T900', classId: c2.id });
  check('same roll number in a different class is allowed (201)', other.status === 201, other);

  const noName = await call('POST', '/api/students', { rollNumber: 'T901', classId: c1.id });
  check('missing name is refused (400)', noName.status === 400, noName);
  const badClass = await call('POST', '/api/students', { name: 'X', rollNumber: 'T902', classId: 999999 });
  check('unknown class is refused (400)', badClass.status === 400, badClass);
  const badDate = await call('POST', '/api/students', { name: 'X', rollNumber: 'T903', classId: c1.id, dateOfBirth: '31-12-2015' });
  check('wrong date format is refused (400)', badDate.status === 400, badDate);
  const badConc = await call('POST', '/api/students', { name: 'X', rollNumber: 'T904', classId: c1.id, concession: -5 });
  check('negative concession is refused (400)', badConc.status === 400, badConc);

  const p1 = await call('PUT', `/api/students/${id}`, { concession: 200 });
  f = await fee();
  check('changing concession to 200 updates the fee card',
    p1.status === 200 && f.fullYearDue === (c1.monthlyFee - 200) * 7, f);

  const clash = await call('PUT', `/api/students/${id}`, { classId: c2.id });
  check('moving into a class that already has that roll number is refused (409)', clash.status === 409, clash);
  await pool.query('DELETE FROM students WHERE id = $1', [other.data.id]); // remove the clashing test student
  await call('PUT', `/api/students/${id}`, { classId: c2.id });
  f = await fee();
  check(`moving to Class 2 changes tuition to ${c2.monthlyFee}`,
    f.fullYearDue === (c2.monthlyFee - 200) * 7, f);

  const pay = await call('POST', '/api/payments', { studentId: id, month: '2026-09', amount: 500 });
  await call('PUT', `/api/students/${id}`, { customFee: 2000 });
  f = await fee();
  check('custom fee 2000: months WITHOUT a payment change, September (has a payment) keeps its old fee',
    f.months[0].tuition === c2.monthlyFee && f.months[1].tuition === 2000 && f.months[6].tuition === 2000, f.months.map((m) => m.tuition));

  await call('PUT', `/api/students/${id}`, { customFee: null });
  f = await fee();
  check('removing the custom fee puts unpaid months back to the class fee',
    f.months[1].tuition === c2.monthlyFee && f.months[6].tuition === c2.monthlyFee, f.months.map((m) => m.tuition));

  const nothing = await call('PUT', `/api/students/${id}`, {});
  check('empty edit is refused (400)', nothing.status === 400, nothing);
  const ghost = await call('PUT', '/api/students/999999', { concession: 1 });
  check('editing a student that does not exist gives 404', ghost.status === 404, ghost);

  const del = await call('DELETE', `/api/students/${id}`);
  const listNow = await call('GET', '/api/students');
  const listAll = await call('GET', '/api/students?includeInactive=true');
  check('deactivated student disappears from the normal list, and shows with includeInactive=true',
    del.status === 200 && listNow.data.count === before.data.count && listAll.data.count === before.data.count + 1,
    { before: before.data.count, now: listNow.data.count, all: listAll.data.count });

  const back = await call('PUT', `/api/students/${id}`, { isActive: true });
  check('restoring a student works', back.status === 200 && back.data.isActive === true, back);

  const one = await call('GET', `/api/students/${id}`);
  check('viewing one student works and shows class name', one.status === 200 && one.data.class === 'Class 2', one);

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((e) => { failed++; console.error('Test crashed:', e.message); })
  .finally(async () => {
    // remove the test students (their fee rows and payments go with them)
    await pool.query("DELETE FROM students WHERE roll_number = 'T900' AND name LIKE 'Test Student%'");
    const left = await pool.query('SELECT COUNT(*) FROM students');
    console.log(`Test students removed. Students in database: ${left.rows[0].count}`);
    await pool.end();
    process.exit(failed ? 1 : 0);
  });