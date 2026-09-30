// Loads students, classes, fee amounts and the billing window from the old JSON file.
// It does NOT load any payments. Every student starts with nothing paid.
const fs = require('fs');
const path = require('path');
const pool = require('../db');

const raw = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'school_fee_data.json'), 'utf8')
);

const CLASS_ORDER = ['Playgroup', 'Nursery', 'Prep', 'Class 1', 'Class 2',
                     'Class 3', 'Class 4', 'Class 5', 'Class 6'];

// "1" -> "Class 1", "class 6" -> "Class 6", "prep" -> "Prep"
function normalizeClass(name) {
  const n = String(name || '').trim().toLowerCase();
  if (n === 'playgroup') return 'Playgroup';
  if (n === 'nursery') return 'Nursery';
  if (n === 'prep') return 'Prep';
  const m = n.match(/^(?:class\s*)?(\d+)$/);
  if (m) return `Class ${m[1]}`;
  return String(name || '').trim();
}

function titleCase(s) {
  return String(s || '').trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// keeps only real dates like 2026-04-04; "nill" or "" becomes empty
function isoDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null;
}

function monthsBetween(start, end) {
  const out = [];
  let [y, m] = start.split('-').map(Number);
  while (`${y}-${String(m).padStart(2, '0')}` <= end) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

// class fees come from feeStructures
const classFees = {};
for (const [key, st] of Object.entries(raw.feeStructures)) {
  classFees[normalizeClass(key)] = st.tuitionFee > 0 ? st.tuitionFee : st.baseFee;
}

const START = raw.settings.academicYearStart;
const END = raw.settings.academicYearEnd;
const windowMonths = monthsBetween(START, END);

async function run() {
  const client = await pool.connect();
  try {
    const check = await client.query('SELECT COUNT(*) FROM students');
    if (Number(check.rows[0].count) > 0 && !process.argv.includes('--reset')) {
      console.log('Students already exist. Run "node scripts/importData.js --reset" to wipe and reload.');
      return;
    }

    await client.query('BEGIN');
    await client.query('TRUNCATE payments, monthly_fees, one_time_charges, students, classes RESTART IDENTITY CASCADE');

    await client.query(
      `INSERT INTO settings (key, value) VALUES ('academic_year_start', $1), ('academic_year_end', $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [START, END]
    );

    const classIds = {};
    for (const name of Object.keys(classFees)) {
      const order = CLASS_ORDER.indexOf(name) + 1 || 99;
      const r = await client.query(
        'INSERT INTO classes (name, monthly_fee, sort_order) VALUES ($1, $2, $3) RETURNING id',
        [name, classFees[name], order]
      );
      classIds[name] = r.rows[0].id;
    }

    let studentCount = 0, feeRowCount = 0;
    const skipped = [];

    for (const s of raw.students) {
      const className = normalizeClass(s.class);
      const classId = classIds[className];
      if (!classId) { skipped.push(`${s.name}: unknown class "${s.class}"`); continue; }

      const customFee = s.hasCustomFee && s.tuitionFee > 0 ? s.tuitionFee : null;
      const monthlyFee = customFee !== null ? customFee : classFees[className];

      const ins = await client.query(
        `INSERT INTO students
          (roll_number, name, guardian_name, contact_number, gender, date_of_birth,
           admission_date, class_id, section, concession, custom_fee)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (class_id, roll_number) DO NOTHING
         RETURNING id`,
        [
          String(s.rollNumber).trim().toUpperCase(),
          titleCase(s.name),
          titleCase(s.guardianName) || null,
          (s.contactNumber || '').trim() || null,
          s.gender || null,
          isoDate(s.dateOfBirth),
          isoDate(s.admissionDate),
          classId,
          (s.section || '').trim() || null,
          s.concession || 0,
          customFee,
        ]
      );
      if (ins.rowCount === 0) { skipped.push(`${className} ${s.rollNumber}: duplicate roll number`); continue; }
      const studentId = ins.rows[0].id;
      studentCount++;

      // one fee row for every month of the billing window (tuition only, no extras yet)
      const feeSql = windowMonths
        .map((_, i) => `($1,$${i * 2 + 2},$${i * 2 + 3})`)
        .join(',');
      const params = [studentId];
      for (const m of windowMonths) params.push(m, monthlyFee);
      await client.query(
        `INSERT INTO monthly_fees (student_id, month, tuition) VALUES ${feeSql}`,
        params
      );
      feeRowCount += windowMonths.length;
    }

    await client.query('COMMIT');

    console.log('--- IMPORT DONE ---');
    console.log('Classes:', Object.keys(classIds).length);
    console.log('Students:', studentCount);
    console.log('Monthly fee rows:', feeRowCount, `(${windowMonths.length} months each: ${START} to ${END})`);
    console.log('Payments: 0 (not imported, everyone starts unpaid)');
    if (skipped.length) console.log('SKIPPED:', skipped);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed, nothing was saved:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();