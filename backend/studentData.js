// Reads students, their month rows, payments and one-time charges from the database
// and puts them into the shape that feeCalc.js expects.
const pool = require('./db');

function dateText(d) {
  if (!d) return '';
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d);
}

async function getSettings() {
  const r = await pool.query("SELECT key, value FROM settings");
  const map = Object.fromEntries(r.rows.map((x) => [x.key, x.value]));
  return { start: map.academic_year_start, end: map.academic_year_end };
}

// studentId = a number to load one student, or nothing to load everybody
async function loadStudents(studentId) {
  const where = studentId ? 'WHERE s.id = $1' : '';
  const params = studentId ? [studentId] : [];

  const students = await pool.query(
    `SELECT s.id, s.roll_number, s.name, s.guardian_name, s.contact_number, s.section,
            s.concession, s.custom_fee, s.is_active,
            c.name AS class_name, c.monthly_fee AS class_fee, c.sort_order
     FROM students s JOIN classes c ON c.id = s.class_id
     ${where} ORDER BY c.sort_order, s.roll_number`, params);

  const sub = studentId ? 'WHERE student_id = $1' : '';
  const fees = await pool.query(
    `SELECT student_id, month, tuition, stationary, exam, misc_fund FROM monthly_fees ${sub}`, params);
  const pays = await pool.query(
    `SELECT student_id, month, SUM(amount)::int AS paid, MAX(paid_on) AS date,
            (ARRAY_AGG(received_by ORDER BY id DESC))[1] AS received_by
     FROM payments ${sub} GROUP BY student_id, month`, params);
  const once = await pool.query(
    `SELECT student_id, name, amount, paid_amount FROM one_time_charges ${sub}`, params);

  const byId = new Map();
  for (const s of students.rows) {
    byId.set(s.id, { ...s, feeRows: {}, payments: {}, oneTime: [] });
  }
  for (const f of fees.rows) {
    byId.get(f.student_id).feeRows[f.month.trim()] = {
      tuition: f.tuition, stationary: f.stationary, exam: f.exam, misc_fund: f.misc_fund,
    };
  }
  for (const p of pays.rows) {
    byId.get(p.student_id).payments[p.month.trim()] = {
      paid: p.paid, date: dateText(p.date), receivedBy: p.received_by || '',
    };
  }
  for (const o of once.rows) byId.get(o.student_id).oneTime.push(o);

  return [...byId.values()];
}

module.exports = { loadStudents, getSettings };