// Payment routes: record a payment, list payments, cancel a payment (with a reason, which is kept).
const express = require('express');
const pool = require('../db');
const { getSettings, loadStudents } = require('../studentData');
const { getMonthsBetween, getFeeSummary } = require('../feeCalc');

const router = express.Router();

const PAYMENT_COLUMNS = `id, student_id AS "studentId", month, amount,
  to_char(paid_on, 'YYYY-MM-DD') AS "paidOn", received_by AS "receivedBy"`;

// The record of cancelled payments. Created the first time it is needed, so nothing has to be run by hand.
const AUDIT_SQL = `
  CREATE TABLE IF NOT EXISTS cancelled_payments (
    id SERIAL PRIMARY KEY,
    payment_id INTEGER NOT NULL,
    student_id INTEGER,
    student_name TEXT NOT NULL,
    class_name TEXT,
    roll_number TEXT,
    month CHAR(7) NOT NULL,
    amount INTEGER NOT NULL,
    paid_on DATE,
    received_by TEXT,
    reason TEXT NOT NULL,
    cancelled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
let auditReady = null;
function ensureAuditTable() {
  if (!auditReady) {
    auditReady = pool.query(AUDIT_SQL).catch((err) => {
      auditReady = null;
      throw err;
    });
  }
  return auditReady;
}

// RECORD a payment
// Body example: { "studentId": 1, "month": "2026-09", "amount": 500, "receivedBy": "Sir Ali" }
router.post('/', async (req, res) => {
  try {
    const { studentId, month, amount, receivedBy, paidOn } = req.body;
    const amt = Number(amount);

    if (!Number.isInteger(Number(studentId)) || Number(studentId) <= 0) {
      return res.status(400).json({ message: 'studentId is required' });
    }
    if (!Number.isInteger(amt) || amt <= 0) {
      return res.status(400).json({ message: 'amount must be a whole number above 0' });
    }
    if (!/^\d{4}-\d{2}$/.test(month || '')) {
      return res.status(400).json({ message: 'month must look like 2026-09' });
    }
    if (paidOn && !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
      return res.status(400).json({ message: 'paidOn must look like 2026-09-30' });
    }

    const settings = await getSettings();
    if (!getMonthsBetween(settings.start, settings.end).includes(month)) {
      return res.status(400).json({ message: `month must be between ${settings.start} and ${settings.end}` });
    }

    const student = await pool.query('SELECT id FROM students WHERE id = $1', [Number(studentId)]);
    if (student.rowCount === 0) return res.status(404).json({ message: 'Student not found' });

    const result = await pool.query(
      `INSERT INTO payments (student_id, month, amount, paid_on, received_by)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5)
       RETURNING ${PAYMENT_COLUMNS}`,
      [Number(studentId), month, amt, paidOn || null, (receivedBy || '').trim() || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// LIST payments of one student: /api/payments?studentId=1
router.get('/', async (req, res) => {
  try {
    const studentId = Number(req.query.studentId);
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ message: 'studentId is required, for example /api/payments?studentId=1' });
    }
    const result = await pool.query(
      `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE student_id = $1 ORDER BY month, id`,
      [studentId]
    );
    res.json({ count: result.rowCount, payments: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// CANCELLED payments, newest first (the last 300): /api/payments/cancelled
router.get('/cancelled', async (req, res) => {
  try {
    await ensureAuditTable();
    const r = await pool.query(
      `SELECT id, payment_id AS "paymentId", student_id AS "studentId", student_name AS "name",
              class_name AS "class", roll_number AS "rollNumber", month, amount,
              to_char(paid_on, 'YYYY-MM-DD') AS "paidOn", received_by AS "receivedBy", reason,
              to_char(cancelled_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM-DD HH24:MI') AS "cancelledAt"
       FROM cancelled_payments ORDER BY cancelled_at DESC, id DESC LIMIT 300`
    );
    res.json({
      count: r.rowCount,
      total: r.rows.reduce((t, p) => t + p.amount, 0),
      payments: r.rows.map((p) => ({ ...p, month: p.month.trim() })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// RECEIPT for one payment: /api/payments/5/receipt
// It has everything printed on a receipt. The balance is the balance at the moment you ask.
router.get('/:id/receipt', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Bad payment id' });

    const p = await pool.query(
      `SELECT id, student_id AS "studentId", to_char(paid_on, 'YYYY-MM-DD') AS "paidOn",
              month, amount, received_by AS "receivedBy"
       FROM payments WHERE id = $1`, [id]);
    if (p.rowCount === 0) return res.status(404).json({ message: 'Payment not found' });
    const payment = p.rows[0];

    const found = await loadStudents(payment.studentId);
    const settings = await getSettings();
    const fees = getFeeSummary(found[0], settings);
    const school = await pool.query(
      "SELECT key, value FROM settings WHERE key IN ('school_name', 'school_address', 'school_phone')");
    const s = Object.fromEntries(school.rows.map((r) => [r.key, r.value]));

    res.json({
      receipt: {
        number: 'R-' + String(payment.id).padStart(6, '0'),
        id: payment.id,
        paidOn: payment.paidOn,
        month: payment.month.trim(),
        amount: payment.amount,
        receivedBy: payment.receivedBy,
      },
      student: {
        id: found[0].id,
        name: found[0].name,
        rollNumber: found[0].roll_number,
        class: found[0].class_name,
        guardianName: found[0].guardian_name,
      },
      school: { name: s.school_name || '', address: s.school_address || '', phone: s.school_phone || '' },
      balance: { totalDue: fees.totalDue, totalPaid: fees.totalPaid, remaining: fees.remaining },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// CANCEL one payment by its id: DELETE /api/payments/5   Body: { "reason": "entered the wrong amount" }
// The payment is first written to the cancelled_payments record, then removed (all or nothing).
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Bad payment id' });
  const reason = String((req.body && req.body.reason) || '').trim();
  if (reason.length < 3) return res.status(400).json({ message: 'A reason is required to cancel a payment (at least 3 letters)' });
  if (reason.length > 200) return res.status(400).json({ message: 'The reason is too long (at most 200 letters)' });

  const client = await pool.connect();
  try {
    await ensureAuditTable();
    await client.query('BEGIN');
    const found = await client.query(
      `SELECT p.id, p.student_id, p.month, p.amount, to_char(p.paid_on, 'YYYY-MM-DD') AS paid_on,
              p.received_by, s.name, s.roll_number, c.name AS class_name
       FROM payments p
       JOIN students s ON s.id = p.student_id
       JOIN classes c ON c.id = s.class_id
       WHERE p.id = $1
       FOR UPDATE OF p`, [id]);
    if (found.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Payment not found' });
    }
    const p = found.rows[0];
    await client.query(
      `INSERT INTO cancelled_payments
         (payment_id, student_id, student_name, class_name, roll_number, month, amount, paid_on, received_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10)`,
      [p.id, p.student_id, p.name, p.class_name, p.roll_number, p.month, p.amount, p.paid_on, p.received_by, reason]
    );
    await client.query('DELETE FROM payments WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({
      deleted: {
        id: p.id, studentId: p.student_id, month: p.month.trim(), amount: p.amount,
        paidOn: p.paid_on, receivedBy: p.received_by,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;