// Report routes: money received between two dates.
const express = require('express');
const pool = require('../db');

const router = express.Router();

function isDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === v;
}

// PAYMENTS RECEIVED between two dates (both days included)
// Example: /api/reports/collections?from=2026-09-01&to=2026-09-30
router.get('/collections', async (req, res) => {
  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!isDate(from) || !isDate(to)) {
      return res.status(400).json({ message: 'from and to are required and must look like 2026-09-30' });
    }
    if (from > to) return res.status(400).json({ message: 'from must not be after to' });
    const days = (new Date(to + 'T00:00:00Z') - new Date(from + 'T00:00:00Z')) / 86400000;
    if (days > 366) return res.status(400).json({ message: 'Choose a range of one year or less' });

    const r = await pool.query(
      `SELECT p.id, to_char(p.paid_on, 'YYYY-MM-DD') AS "paidOn", p.month, p.amount,
              p.received_by AS "receivedBy",
              s.id AS "studentId", s.name, s.roll_number AS "rollNumber", c.name AS "class"
       FROM payments p
       JOIN students s ON s.id = p.student_id
       JOIN classes c ON c.id = s.class_id
       WHERE p.paid_on BETWEEN $1::date AND $2::date
       ORDER BY p.paid_on, c.sort_order, s.roll_number, p.id`,
      [from, to]
    );

    const total = r.rows.reduce((t, p) => t + p.amount, 0);
    const byReceiver = new Map();
    for (const p of r.rows) {
      const key = p.receivedBy || '(not recorded)';
      const entry = byReceiver.get(key) || { receivedBy: key, count: 0, total: 0 };
      entry.count += 1;
      entry.total += p.amount;
      byReceiver.set(key, entry);
    }

    res.json({
      from,
      to,
      count: r.rowCount,
      total,
      byReceiver: [...byReceiver.values()].sort((a, b) => b.total - a.total),
      payments: r.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;