// Tests the extra-charge routes (stationary, exam, misc fund, one-time charges).
// It starts the server itself, so stop your own server first.
// Run: node scripts/testCharges.js
// It changes a few numbers and puts every one of them back at the end.
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

// things to put back at the end
let studentId = null, savedRow = null, bulkClassId = null, savedBulk = null, oneTimeId = null;

async function main() {
  await new Promise((r) => setTimeout(r, 1500)); // let the server start

  const list = await call('GET', '/api/students?class=Playgroup');
  studentId = list.data.students[0].id;
  console.log(`Testing with student #${studentId}: ${list.data.students[0].name}\n`);
  const fees = async () => (await call('GET', `/api/students/${studentId}/summary`)).data.fees;

  // remember the original numbers of this student's October row
  savedRow = (await pool.query(
    "SELECT tuition, stationary, exam, misc_fund FROM monthly_fees WHERE student_id = $1 AND month = '2026-10'",
    [studentId])).rows[0];

  // ---- one student, one month ----
  let f0 = await fees();
  const r1 = await call('PUT', '/api/charges/month', { studentId, month: '2026-10', stationary: 300, exam: 500 });
  check('set stationary 300 and exam 500 for October works', r1.status === 200 && r1.data.stationary === 300 && r1.data.exam === 500, r1);
  let f1 = await fees();
  check('yearly fee goes up by 800 (minus what was already there)',
    f1.fullYearDue - f0.fullYearDue === 800 - savedRow.stationary - savedRow.exam, { before: f0.fullYearDue, after: f1.fullYearDue });
  check('October row shows stationary 300 and exam 500', f1.months[1].stationary === 300 && f1.months[1].exam === 500, f1.months[1]);

  const r2 = await call('PUT', '/api/charges/month', { studentId, month: '2026-10', miscFund: 100 });
  check('changing only misc fund keeps the other charges', r2.data.miscFund === 100 && r2.data.stationary === 300 && r2.data.exam === 500, r2);

  const bad1 = await call('PUT', '/api/charges/month', { studentId, month: '2026-10', exam: -5 });
  check('negative amount is refused (400)', bad1.status === 400, bad1);
  const bad2 = await call('PUT', '/api/charges/month', { studentId, month: '2025-01', exam: 100 });
  check('month outside billing window is refused (400)', bad2.status === 400, bad2);
  const bad3 = await call('PUT', '/api/charges/month', { studentId: 999999, month: '2026-10', exam: 100 });
  check('unknown student gives 404', bad3.status === 404, bad3);
  const bad4 = await call('PUT', '/api/charges/month', { studentId, month: '2026-10' });
  check('sending nothing to change is refused (400)', bad4.status === 400, bad4);

  // ---- a whole class ----
  const cls = (await call('GET', '/api/classes')).data.classes.find((c) => c.name === 'Class 1');
  bulkClassId = cls.id;
  savedBulk = (await pool.query(
    `SELECT mf.student_id, mf.exam FROM monthly_fees mf JOIN students s ON s.id = mf.student_id
     WHERE s.class_id = $1 AND mf.month = '2026-11'`, [bulkClassId])).rows;
  const c1Student = (await call('GET', '/api/students?class=Class 1')).data.students[0];
  const before = (await call('GET', `/api/students/${c1Student.id}/summary`)).data.fees.fullYearDue;
  const bulk = await call('POST', '/api/charges/bulk', { classId: bulkClassId, month: '2026-11', field: 'exam', amount: 200 });
  check(`exam fee 200 for all Class 1 students updates ${cls.studentCount} students`, bulk.status === 200 && bulk.data.updated === cls.studentCount, bulk);
  const oldExam = savedBulk.find((x) => x.student_id === c1Student.id).exam;
  const after = (await call('GET', `/api/students/${c1Student.id}/summary`)).data.fees.fullYearDue;
  check('a Class 1 student now owes 200 more (minus what was there)', after - before === 200 - oldExam, { before, after });
  const badField = await call('POST', '/api/charges/bulk', { classId: bulkClassId, month: '2026-11', field: 'tuition', amount: 1 });
  check('bulk on a wrong field is refused (400)', badField.status === 400, badField);

  // ---- one-time charge ----
  f0 = await fees();
  const ot = await call('POST', '/api/charges/one-time', { studentId, name: 'Admission Fee', amount: 2000 });
  oneTimeId = ot.data.id;
  check('add a one-time charge of 2000 works (201)', ot.status === 201 && ot.data.paidAmount === 0, ot);
  f1 = await fees();
  check('it adds 2000 to the amount due', f1.totalDue - f0.totalDue === 2000 && f1.miscTotal === 2000, { before: f0.totalDue, after: f1.totalDue });

  const pay1 = await call('POST', `/api/charges/one-time/${oneTimeId}/pay`, { amount: 500 });
  check('paying 500 towards it works', pay1.status === 200 && pay1.data.paidAmount === 500, pay1);
  f1 = await fees();
  check('total paid goes up by 500', f1.totalPaid - f0.totalPaid === 500, { before: f0.totalPaid, after: f1.totalPaid });
  const over = await call('POST', `/api/charges/one-time/${oneTimeId}/pay`, { amount: 2000 });
  check('paying more than is unpaid is refused (400)', over.status === 400, over);
  const noName = await call('POST', '/api/charges/one-time', { studentId, amount: 100 });
  check('one-time charge without a name is refused (400)', noName.status === 400, noName);
  const listOT = await call('GET', `/api/charges/one-time?studentId=${studentId}`);
  check('one-time charge list shows 1 charge', listOT.data.count === 1, listOT);

  const del = await call('DELETE', `/api/charges/one-time/${oneTimeId}`);
  oneTimeId = null;
  f1 = await fees();
  check('removing it puts the totals back', del.status === 200 && f1.totalDue === f0.totalDue && f1.totalPaid === f0.totalPaid, f1);

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((e) => { failed++; console.error('Test crashed:', e.message); })
  .finally(async () => {
    try {
      // put every changed number back
      if (savedRow) {
        await pool.query(
          `UPDATE monthly_fees SET tuition = $1, stationary = $2, exam = $3, misc_fund = $4
           WHERE student_id = $5 AND month = '2026-10'`,
          [savedRow.tuition, savedRow.stationary, savedRow.exam, savedRow.misc_fund, studentId]);
      }
      if (savedBulk && savedBulk.length) {
        await pool.query(
          `UPDATE monthly_fees mf SET exam = v.exam
           FROM (SELECT unnest($1::int[]) AS sid, unnest($2::int[]) AS exam) v
           WHERE mf.student_id = v.sid AND mf.month = '2026-11'`,
          [savedBulk.map((x) => x.student_id), savedBulk.map((x) => x.exam)]);
      }
      if (oneTimeId) await pool.query('DELETE FROM one_time_charges WHERE id = $1', [oneTimeId]);
      console.log('All test changes were put back.');
    } catch (e) {
      console.error('Cleanup problem:', e.message);
    }
    await pool.end();
    process.exit(failed ? 1 : 0);
  });