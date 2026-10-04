// Class routes: list the classes, add one, change its name or fee, remove an empty one.
const express = require('express');
const pool = require('../db');
const { getSettings } = require('../studentData');
const { getMonthsBetween } = require('../feeCalc');

const router = express.Router();

const MAX_FEE = 1000000;
const isFee = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_FEE;

// LIST all classes: /api/classes
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.monthly_fee AS "monthlyFee", c.sort_order AS "sortOrder",
              COUNT(s.id) FILTER (WHERE s.is_active)::int AS "studentCount"
       FROM classes c LEFT JOIN students s ON s.class_id = c.id
       GROUP BY c.id ORDER BY c.sort_order`
    );
    res.json({ count: result.rowCount, classes: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// ADD a class. Body: { "name": "Class 7", "monthlyFee": 2200 }
router.post('/', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const fee = Number(req.body.monthlyFee);
    if (!name || name.length > 50) return res.status(400).json({ message: 'name is required (up to 50 letters)' });
    if (!isFee(fee)) return res.status(400).json({ message: 'monthlyFee must be a whole number, 0 or more' });
    const r = await pool.query(
      `INSERT INTO classes (name, monthly_fee, sort_order)
       VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM classes))
       RETURNING id, name, monthly_fee AS "monthlyFee", sort_order AS "sortOrder"`,
      [name, fee]
    );
    res.status(201).json({ ...r.rows[0], studentCount: 0 });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'A class with that name already exists' });
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// CHANGE a class. Send the name, the fee, or both.
// Body example: { "monthlyFee": 1500, "effectiveFrom": "2026-11" }
// A new fee is used from effectiveFrom on, for months that nobody has paid yet and that still have the
// old class fee. Students with their own custom fee, and months that already have a payment, keep what they have.
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Bad class id' });

  const client = await pool.connect();
  try {
    const cur = await client.query('SELECT id, name, monthly_fee FROM classes WHERE id = $1', [id]);
    if (cur.rowCount === 0) return res.status(404).json({ message: 'Class not found' });
    const old = cur.rows[0];

    let name;
    if (req.body.name !== undefined) {
      name = String(req.body.name).trim();
      if (!name || name.length > 50) return res.status(400).json({ message: 'name is required (up to 50 letters)' });
    }
    let fee;
    if (req.body.monthlyFee !== undefined) {
      fee = Number(req.body.monthlyFee);
      if (!isFee(fee)) return res.status(400).json({ message: 'monthlyFee must be a whole number, 0 or more' });
    }
    const nameChanged = name !== undefined && name !== old.name;
    const feeChanged = fee !== undefined && fee !== old.monthly_fee;
    if (!nameChanged && !feeChanged) return res.status(400).json({ message: 'Nothing to change' });

    const from = req.body.effectiveFrom;
    if (feeChanged) {
      const settings = await getSettings();
      const months = getMonthsBetween(settings.start, settings.end);
      if (!months.includes(from)) {
        return res.status(400).json({ message: `effectiveFrom is required and must be a month between ${settings.start} and ${settings.end}` });
      }
    }

    await client.query('BEGIN');
    await client.query('UPDATE classes SET name = $1, monthly_fee = $2 WHERE id = $3', [
      nameChanged ? name : old.name,
      feeChanged ? fee : old.monthly_fee,
      id,
    ]);
    let monthsUpdated = 0;
    if (feeChanged) {
      const r = await client.query(
        `UPDATE monthly_fees mf SET tuition = $1
         FROM students s
         WHERE s.id = mf.student_id AND s.class_id = $2 AND s.custom_fee IS NULL
           AND mf.month >= $3 AND mf.tuition = $4
           AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.student_id = mf.student_id AND p.month = mf.month)`,
        [fee, id, from, old.monthly_fee]
      );
      monthsUpdated = r.rowCount;
    }
    await client.query('COMMIT');
    res.json({
      id,
      name: nameChanged ? name : old.name,
      monthlyFee: feeChanged ? fee : old.monthly_fee,
      monthsUpdated,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ message: 'A class with that name already exists' });
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// REMOVE a class. Only possible when it has no students at all (not even students who left).
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Bad class id' });
    const students = await pool.query('SELECT COUNT(*)::int AS n FROM students WHERE class_id = $1', [id]);
    if (students.rows[0].n > 0) {
      return res.status(409).json({ message: `This class still has ${students.rows[0].n} students (including students who left), so it cannot be removed` });
    }
    const r = await pool.query('DELETE FROM classes WHERE id = $1 RETURNING id', [id]);
    if (r.rowCount === 0) return res.status(404).json({ message: 'Class not found' });
    res.json({ deleted: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;