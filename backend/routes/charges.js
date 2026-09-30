// Charge routes: extra monthly charges (stationary, exam, misc fund) and one-time charges.
const express = require('express');
const pool = require('../db');
const { getSettings } = require('../studentData');
const { getMonthsBetween } = require('../feeCalc');

const router = express.Router();

const MAX_AMOUNT = 10000000;

function isAmount(n) {
  return Number.isInteger(n) && n >= 0 && n <= MAX_AMOUNT;
}

async function monthIsInWindow(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) return 'month must look like 2026-09';
  const settings = await getSettings();
  if (!getMonthsBetween(settings.start, settings.end).includes(month)) {
    return `month must be between ${settings.start} and ${settings.end}`;
  }
  return null;
}

// SET the charges of ONE student for ONE month. Send only what you want to change.
// Body example: { "studentId": 1, "month": "2026-10", "stationary": 300, "exam": 500 }
router.put('/month', async (req, res) => {
  try {
    const studentId = Number(req.body.studentId);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ message: 'studentId is required' });
    }
    const monthError = await monthIsInWindow(req.body.month);
    if (monthError) return res.status(400).json({ message: monthError });

    const fieldColumn = { tuition: 'tuition', stationary: 'stationary', exam: 'exam', miscFund: 'misc_fund' };
    const changes = {};
    for (const key of Object.keys(fieldColumn)) {
      if (req.body[key] !== undefined) {
        const n = Number(req.body[key]);
        if (!isAmount(n)) return res.status(400).json({ message: `${key} must be a whole number, 0 or more` });
        changes[fieldColumn[key]] = n;
      }
    }
    if (Object.keys(changes).length === 0) {
      return res.status(400).json({ message: 'Send at least one of: tuition, stationary, exam, miscFund' });
    }

    const student = await pool.query(
      `SELECT COALESCE(s.custom_fee, c.monthly_fee) AS fee
       FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = $1`, [studentId]);
    if (student.rowCount === 0) return res.status(404).json({ message: 'Student not found' });

    const cur = await pool.query(
      'SELECT tuition, stationary, exam, misc_fund FROM monthly_fees WHERE student_id = $1 AND month = $2',
      [studentId, req.body.month]);
    const base = cur.rows[0] || { tuition: student.rows[0].fee, stationary: 0, exam: 0, misc_fund: 0 };
    const m = { ...base, ...changes };

    const r = await pool.query(
      `INSERT INTO monthly_fees (student_id, month, tuition, stationary, exam, misc_fund)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (student_id, month) DO UPDATE
         SET tuition = $3, stationary = $4, exam = $5, misc_fund = $6
       RETURNING student_id AS "studentId", month, tuition, stationary, exam, misc_fund AS "miscFund"`,
      [studentId, req.body.month, m.tuition, m.stationary, m.exam, m.misc_fund]);
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// SET one charge for a WHOLE CLASS (or every class) for one month. Active students only.
// Body example: { "classId": 4, "month": "2026-11", "field": "exam", "amount": 500 }
// Leave out classId to apply it to all classes. Use amount 0 to clear it.
router.post('/bulk', async (req, res) => {
  try {
    const columnFor = { stationary: 'stationary', exam: 'exam', miscFund: 'misc_fund' };
    const { field, month } = req.body;
    const amount = Number(req.body.amount);
    if (!columnFor[field]) return res.status(400).json({ message: 'field must be stationary, exam or miscFund' });
    if (!isAmount(amount)) return res.status(400).json({ message: 'amount must be a whole number, 0 or more' });
    const monthError = await monthIsInWindow(month);
    if (monthError) return res.status(400).json({ message: monthError });

    const params = [amount, month];
    let classFilter = '';
    if (req.body.classId !== undefined && req.body.classId !== null) {
      const classId = Number(req.body.classId);
      if (!Number.isInteger(classId) || classId <= 0) return res.status(400).json({ message: 'classId is not valid' });
      const cls = await pool.query('SELECT id FROM classes WHERE id = $1', [classId]);
      if (cls.rowCount === 0) return res.status(400).json({ message: 'That class does not exist' });
      params.push(classId);
      classFilter = 'AND s.class_id = $3';
    }

    const r = await pool.query(
      `UPDATE monthly_fees mf SET ${columnFor[field]} = $1
       FROM students s
       WHERE s.id = mf.student_id AND s.is_active AND mf.month = $2 ${classFilter}
       RETURNING mf.student_id`, params);
    res.json({ updated: r.rowCount, field, month, amount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

const ONE_TIME_COLUMNS = `id, student_id AS "studentId", name, amount, paid_amount AS "paidAmount"`;

// ADD a one-time charge (for example an admission fee)
// Body example: { "studentId": 1, "name": "Admission Fee", "amount": 2000 }
router.post('/one-time', async (req, res) => {
  try {
    const studentId = Number(req.body.studentId);
    const amount = Number(req.body.amount);
    const name = String(req.body.name || '').trim();
    if (!Number.isInteger(studentId) || studentId <= 0) return res.status(400).json({ message: 'studentId is required' });
    if (!name || name.length > 100) return res.status(400).json({ message: 'name is required (up to 100 letters)' });
    if (!isAmount(amount) || amount === 0) return res.status(400).json({ message: 'amount must be a whole number above 0' });

    const student = await pool.query('SELECT id FROM students WHERE id = $1', [studentId]);
    if (student.rowCount === 0) return res.status(404).json({ message: 'Student not found' });

    const r = await pool.query(
      `INSERT INTO one_time_charges (student_id, name, amount) VALUES ($1, $2, $3) RETURNING ${ONE_TIME_COLUMNS}`,
      [studentId, name, amount]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// LIST the one-time charges of one student: /api/charges/one-time?studentId=1
router.get('/one-time', async (req, res) => {
  try {
    const studentId = Number(req.query.studentId);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ message: 'studentId is required, for example ?studentId=1' });
    }
    const r = await pool.query(
      `SELECT ${ONE_TIME_COLUMNS} FROM one_time_charges WHERE student_id = $1 ORDER BY id`, [studentId]);
    res.json({ count: r.rowCount, charges: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// RECORD a payment towards a one-time charge. Body: { "amount": 500 }
router.post('/one-time/:id/pay', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const amount = Number(req.body.amount);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Bad charge id' });
    if (!isAmount(amount) || amount === 0) return res.status(400).json({ message: 'amount must be a whole number above 0' });

    const r = await pool.query(
      `UPDATE one_time_charges SET paid_amount = paid_amount + $1
       WHERE id = $2 AND paid_amount + $1 <= amount RETURNING ${ONE_TIME_COLUMNS}`, [amount, id]);
    if (r.rowCount === 0) {
      const exists = await pool.query('SELECT id FROM one_time_charges WHERE id = $1', [id]);
      if (exists.rowCount === 0) return res.status(404).json({ message: 'Charge not found' });
      return res.status(400).json({ message: 'That is more than what is still unpaid on this charge' });
    }
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// REMOVE a one-time charge
router.delete('/one-time/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Bad charge id' });
    const r = await pool.query(`DELETE FROM one_time_charges WHERE id = $1 RETURNING ${ONE_TIME_COLUMNS}`, [id]);
    if (r.rowCount === 0) return res.status(404).json({ message: 'Charge not found' });
    res.json({ deleted: r.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;