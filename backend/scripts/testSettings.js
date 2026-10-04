// Tests the settings, class fees and billing period.
// It creates its own test class ("ZZ Test Class") and test students, so your real classes and students are never
// touched, and it removes them at the end. It starts the server itself, so stop your own server first.
// Run: node scripts/testSettings.js
require('dotenv').config();
require('../server');
const pool = require('../db');
const { extendBillingPeriod } = require('../billing');
const { getMonthsBetween } = require('../feeCalc');

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
let savedSchool = null;

async function removeTestClasses() {
  await pool.query("DELETE FROM students WHERE class_id IN (SELECT id FROM classes WHERE name LIKE 'ZZ Test%')");
  await pool.query("DELETE FROM classes WHERE name LIKE 'ZZ Test%'");
}

async function tuitions(studentId) {
  const r = await pool.query('SELECT month, tuition FROM monthly_fees WHERE student_id = $1 ORDER BY month', [studentId]);
  return Object.fromEntries(r.rows.map((x) => [x.month.trim(), x.tuition]));
}

async function main() {
  await new Promise((r) => setTimeout(r, 1500)); // let the server start
  await removeTestClasses(); // in case an earlier run stopped halfway

  const before = (await call('GET', '/api/settings')).data;
  const months = before.months;
  const saved = await pool.query('SELECT key, value FROM settings WHERE key = ANY($1)', [SCHOOL_KEYS]);
  savedSchool = saved.rows;

  // ---------- school details ----------
  const noLogin = await call('PUT', '/api/settings/school', { schoolName: 'X' }, false);
  check('without login, saving school details is refused (401)', noLogin.status === 401, noLogin.data);
  const school = await call('PUT', '/api/settings/school', { schoolName: '  Test School  ', schoolAddress: 'Test Street 1', schoolPhone: '0300 0000000' });
  check('school details are saved and tidied', school.status === 200 && school.data.schoolName === 'Test School', school.data);
  const read = (await call('GET', '/api/settings')).data;
  check('and they come back when you ask for the settings', read.schoolAddress === 'Test Street 1' && read.schoolPhone === '0300 0000000' && read.months.length === months.length, read);
  const tooLong = await call('PUT', '/api/settings/school', { schoolName: 'x'.repeat(101) });
  check('a school name that is too long is refused (400)', tooLong.status === 400, tooLong.data);
  const nothing = await call('PUT', '/api/settings/school', {});
  check('saving nothing is refused (400)', nothing.status === 400, nothing.data);

  // ---------- adding a class ----------
  const created = await call('POST', '/api/classes', { name: 'ZZ Test Class', monthlyFee: 1000 });
  check('adding a class works (201)', created.status === 201 && created.data.studentCount === 0, created.data);
  const classId = created.data.id;
  const dup = await call('POST', '/api/classes', { name: 'ZZ Test Class', monthlyFee: 1 });
  check('a second class with the same name is refused (409)', dup.status === 409, dup.data);
  const noName = await call('POST', '/api/classes', { name: '  ', monthlyFee: 1 });
  check('a class without a name is refused (400)', noName.status === 400, noName.data);
  const badFee = await call('POST', '/api/classes', { name: 'ZZ Test Bad', monthlyFee: -5 });
  check('a negative fee is refused (400)', badFee.status === 400, badFee.data);

  // three test students: normal, own custom fee, and one who has paid the second month
  const mk = async (roll, extra = {}) => (await call('POST', '/api/students', { name: `zz test ${roll}`, rollNumber: roll, classId, ...extra })).data.id;
  const z1 = await mk('Z1');
  const z2 = await mk('Z2', { customFee: 1500 });
  const z3 = await mk('Z3');
  await call('POST', '/api/payments', { studentId: z3, month: months[1], amount: 500 });

  // ---------- changing the class fee ----------
  const from = months[2];
  const laterMonths = months.filter((m) => m >= from);
  const noFrom = await call('PUT', `/api/classes/${classId}`, { monthlyFee: 1200 });
  check('a new fee without a starting month is refused (400)', noFrom.status === 400, noFrom.data);
  const badFrom = await call('PUT', `/api/classes/${classId}`, { monthlyFee: 1200, effectiveFrom: '1999-01' });
  check('a starting month outside the billing period is refused (400)', badFrom.status === 400, badFrom.data);
  const same = await call('PUT', `/api/classes/${classId}`, { monthlyFee: 1000 });
  check('the same fee again is refused (400)', same.status === 400 && /Nothing/.test(same.data.message), same.data);
  const neg = await call('PUT', `/api/classes/${classId}`, { monthlyFee: -1, effectiveFrom: from });
  check('a negative fee is refused (400)', neg.status === 400, neg.data);

  const change = await call('PUT', `/api/classes/${classId}`, { monthlyFee: 1200, effectiveFrom: from });
  check(`the fee changes and ${laterMonths.length * 2} fee months are updated (two students, ${laterMonths.length} months each)`,
    change.status === 200 && change.data.monthlyFee === 1200 && change.data.monthsUpdated === laterMonths.length * 2, change.data);
  const t1 = await tuitions(z1), t2 = await tuitions(z2), t3 = await tuitions(z3);
  check('a normal student: earlier months keep 1000, from the starting month on it is 1200',
    months.every((m) => t1[m] === (m >= from ? 1200 : 1000)), t1);
  check('a student with a custom fee keeps 1500 in every month', months.every((m) => t2[m] === 1500), t2);
  check('a month that already has a payment keeps its old fee, the others change',
    t3[months[1]] === 1000 && laterMonths.every((m) => t3[m] === 1200), t3);

  // a month someone set by hand (here 0) is not overwritten by the next class fee change
  await call('PUT', '/api/charges/month', { studentId: z1, month: months[3], tuition: 0 });
  const second = await call('PUT', `/api/classes/${classId}`, { monthlyFee: 1300, effectiveFrom: from });
  const t1b = await tuitions(z1);
  check('a month changed by hand keeps its own amount when the class fee changes again',
    second.status === 200 && t1b[months[3]] === 0 && t1b[months[2]] === 1300, t1b);

  // ---------- renaming ----------
  const rename = await call('PUT', `/api/classes/${classId}`, { name: 'ZZ Test Renamed' });
  const list = (await call('GET', '/api/students')).data.students.filter((s) => s.rollNumber === 'Z1');
  check('renaming works and students show the new class name', rename.status === 200 && list[0].class === 'ZZ Test Renamed', rename.data);
  const realClass = (await call('GET', '/api/classes')).data.classes.find((c) => !c.name.startsWith('ZZ Test'));
  if (realClass) {
    const clash = await call('PUT', `/api/classes/${classId}`, { name: realClass.name });
    check('renaming to a name that already exists is refused (409)', clash.status === 409, clash.data);
  }

  // ---------- billing period: refused changes (these change nothing) ----------
  const last = months[months.length - 1];
  const shrinkStart = await call('PUT', '/api/settings/billing-period', { start: months[1], end: last });
  check('starting the period later is refused (400)', shrinkStart.status === 400 && /longer/.test(shrinkStart.data.message), shrinkStart.data);
  const shrinkEnd = await call('PUT', '/api/settings/billing-period', { start: months[0], end: months[months.length - 2] });
  check('ending the period sooner is refused (400)', shrinkEnd.status === 400, shrinkEnd.data);
  const badFmt = await call('PUT', '/api/settings/billing-period', { start: 'Sept', end: last });
  check('wrong month format is refused (400)', badFmt.status === 400, badFmt.data);
  const backwards = await call('PUT', '/api/settings/billing-period', { start: '2030-05', end: '2030-01' });
  check('start after end is refused (400)', backwards.status === 400, backwards.data);
  const huge = await call('PUT', '/api/settings/billing-period', { start: months[0], end: '2040-01' });
  check('a period longer than 24 months is refused (400)', huge.status === 400, huge.data);
  const noLoginBp = await call('PUT', '/api/settings/billing-period', { start: months[0], end: last }, false);
  check('without login the billing period cannot be changed (401)', noLoginBp.status === 401, noLoginBp.data);

  // ---------- billing period: making it longer (tried inside a transaction that is cancelled) ----------
  const [y, m] = last.split('-').map(Number);
  const nextEnd = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const studentsTotal = (await pool.query('SELECT COUNT(*)::int AS n FROM students')).rows[0].n;
  const rowsBefore = (await pool.query('SELECT COUNT(*)::int AS n FROM monthly_fees')).rows[0].n;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ext = await extendBillingPeriod(client, months[0], nextEnd);
    check('making the period one month longer adds one fee row for every student, also students who left',
      ext.newMonths.length === 1 && ext.rowsAdded === studentsTotal, { ext, studentsTotal });
    const newRows = await client.query("SELECT student_id, tuition FROM monthly_fees WHERE month = $1 AND student_id = ANY($2)", [nextEnd, [z1, z2, z3]]);
    const byStudent = Object.fromEntries(newRows.rows.map((r) => [r.student_id, r.tuition]));
    check('the new month uses the class fee, or the custom fee for a student who has one', byStudent[z1] === 1300 && byStudent[z2] === 1500, byStudent);
    const nowSettings = await client.query("SELECT value FROM settings WHERE key = 'academic_year_end'");
    check('the end of the billing period is updated', nowSettings.rows[0].value === nextEnd, nowSettings.rows[0]);
    const again = await extendBillingPeriod(client, months[0], nextEnd);
    check('doing the same again adds nothing', again.rowsAdded === 0 && again.newMonths.length === 0, again);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
  const after = (await call('GET', '/api/settings')).data;
  const rowsAfter = (await pool.query('SELECT COUNT(*)::int AS n FROM monthly_fees')).rows[0].n;
  check('after cancelling, the real billing period and fee rows are exactly as before',
    after.end === before.end && after.start === before.start && rowsAfter === rowsBefore, { before: before.end, after: after.end });

  // ---------- removing a class ----------
  const blocked = await call('DELETE', `/api/classes/${classId}`);
  check('a class that has students cannot be removed (409)', blocked.status === 409 && /3 students/.test(blocked.data.message), blocked.data);
  await pool.query('DELETE FROM students WHERE class_id = $1', [classId]);
  const removed = await call('DELETE', `/api/classes/${classId}`);
  check('an empty class can be removed', removed.status === 200, removed.data);
  const gone = await call('DELETE', `/api/classes/${classId}`);
  check('removing it again gives 404', gone.status === 404, gone.data);

  console.log(`\n${passed} passed, ${failed} failed`);
}

main()
  .catch((e) => { failed++; console.error('Test crashed:', e.message); })
  .finally(async () => {
    try {
      await removeTestClasses();
      await pool.query('DELETE FROM settings WHERE key = ANY($1)', [SCHOOL_KEYS]);
      for (const row of savedSchool || []) {
        await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2)', [row.key, row.value]);
      }
      console.log('Test class, test students and the school details were put back.');
    } catch (e) {
      console.error('Cleanup problem:', e.message);
    }
    await pool.end();
    process.exit(failed ? 1 : 0);
  });