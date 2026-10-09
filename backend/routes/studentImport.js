// Spreadsheet routes: export all students, and import (check or save) a spreadsheet of students.
const express = require('express');
const pool = require('../db');
const { getSettings } = require('../studentData');
const { getMonthsBetween } = require('../feeCalc');
const { MAX_ROWS, planImport, applyPlan } = require('../studentImport');

const router = express.Router();

// EXPORT every student, also students who left: /api/students/export
router.get('/export', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.id, s.name, s.roll_number AS "rollNumber", c.name AS "class", s.section,
              s.guardian_name AS "guardianName", s.contact_number AS "contactNumber", s.gender,
              to_char(s.date_of_birth, 'YYYY-MM-DD') AS "dateOfBirth",
              to_char(s.admission_date, 'YYYY-MM-DD') AS "admissionDate",
              s.concession, s.custom_fee AS "customFee", s.is_active AS "isActive"
       FROM students s JOIN classes c ON c.id = s.class_id
       ORDER BY c.sort_order, s.roll_number`
    );
    res.json({ count: r.rowCount, students: r.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// IMPORT. Body: { "rows": [ { "line": 2, "id": "5", "contactNumber": "0300 1234567", ... } ], "dryRun": true }
// With "dryRun": false the rows are really saved, but only when EVERY row is fine.
router.post('/import', async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows, dryRun } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'The file has no rows' });
    }
    if (rows.length > MAX_ROWS) {
      return res.status(400).json({ message: `The file has too many rows (at most ${MAX_ROWS} at a time)` });
    }
    if (!rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
      return res.status(400).json({ message: 'The rows are not in the right form' });
    }

    const classes = (await pool.query('SELECT id, name, monthly_fee FROM classes')).rows;
    const students = (await pool.query(
      `SELECT id, name, roll_number, class_id, guardian_name, contact_number, gender, section,
              to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
              to_char(admission_date, 'YYYY-MM-DD') AS admission_date,
              concession, custom_fee, is_active
       FROM students`
    )).rows;

    const plan = planImport(rows, classes, students);
    const answer = { summary: plan.summary, rows: plan.rows };

    // only an explicit "dryRun": false saves anything
    if (dryRun !== false) return res.json({ dryRun: true, ...answer });

    if (plan.summary.errors > 0) {
      return res.status(400).json({ message: 'The file has errors, so nothing was changed.', ...answer });
    }
    if (plan.summary.create + plan.summary.update === 0) {
      return res.json({ applied: true, created: 0, updated: 0, ...answer });
    }

    const settings = await getSettings();
    const months = getMonthsBetween(settings.start, settings.end);
    await client.query('BEGIN');
    const done = await applyPlan(client, plan, months);
    await client.query('COMMIT');
    res.json({ applied: true, ...done, ...answer });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A roll number is already used in that class, so nothing was changed. Check the file again.' });
    }
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;