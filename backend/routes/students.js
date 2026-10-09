// Student routes: add, view, edit, deactivate (and restore) a student.
const express = require('express');
const pool = require('../db');
const { getSettings } = require('../studentData');
const { getMonthsBetween } = require('../feeCalc');
const { readFields, createStudent, updateStudent } = require('../studentOps');

const router = express.Router();

const STUDENT_SELECT = `
  SELECT s.id, s.roll_number AS "rollNumber", s.name, s.guardian_name AS "guardianName",
         s.contact_number AS "contactNumber", s.gender,
         to_char(s.date_of_birth, 'YYYY-MM-DD') AS "dateOfBirth",
         to_char(s.admission_date, 'YYYY-MM-DD') AS "admissionDate",
         s.section, s.concession, s.custom_fee AS "customFee", s.is_active AS "isActive",
         c.id AS "classId", c.name AS "class", c.monthly_fee AS "classFee"
  FROM students s JOIN classes c ON c.id = s.class_id`;

// VIEW one student: /api/students/5
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Bad student id' });
    const r = await pool.query(`${STUDENT_SELECT} WHERE s.id = $1`, [id]);
    if (r.rowCount === 0) return res.status(404).json({ message: 'Student not found' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// ADD a student
// Body example: { "name": "Ali Khan", "rollNumber": "A099", "classId": 4, "guardianName": "Khan" }
router.post('/', async (req, res) => {
  const { errors, values } = readFields(req.body, true);
  if (errors.length) return res.status(400).json({ message: errors.join('; ') });

  const client = await pool.connect();
  try {
    const cls = await client.query('SELECT id, monthly_fee FROM classes WHERE id = $1', [values.classId]);
    if (cls.rowCount === 0) return res.status(400).json({ message: 'That class does not exist' });

    const settings = await getSettings();
    const months = getMonthsBetween(settings.start, settings.end);
    const tuition = values.customFee || cls.rows[0].monthly_fee;

    await client.query('BEGIN');
    const id = await createStudent(client, values, months, tuition);
    await client.query('COMMIT');

    const r = await pool.query(`${STUDENT_SELECT} WHERE s.id = $1`, [id]);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ message: `Roll number ${values.rollNumber} already exists in that class` });
    }
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// EDIT a student. Send only the fields you want to change.
// Example: { "concession": 200 }   or   { "classId": 5 }   or   { "isActive": true }
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Bad student id' });
  const { errors, values } = readFields(req.body, false);
  if (errors.length) return res.status(400).json({ message: errors.join('; ') });
  if (Object.keys(values).length === 0) return res.status(400).json({ message: 'Nothing to change' });

  const client = await pool.connect();
  try {
    const existing = await client.query('SELECT id FROM students WHERE id = $1', [id]);
    if (existing.rowCount === 0) return res.status(404).json({ message: 'Student not found' });

    if (values.classId) {
      const cls = await client.query('SELECT id FROM classes WHERE id = $1', [values.classId]);
      if (cls.rowCount === 0) return res.status(400).json({ message: 'That class does not exist' });
    }

    await client.query('BEGIN');
    await updateStudent(client, id, values);
    await client.query('COMMIT');

    const r = await pool.query(`${STUDENT_SELECT} WHERE s.id = $1`, [id]);
    res.json(r.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ message: 'That roll number already exists in that class' });
    }
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

// DEACTIVATE a student (left the school). Their payment history is kept.
// To bring them back: PUT /api/students/5 with { "isActive": true }
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: 'Bad student id' });
    const r = await pool.query('UPDATE students SET is_active = FALSE WHERE id = $1 RETURNING id', [id]);
    if (r.rowCount === 0) return res.status(404).json({ message: 'Student not found' });
    res.json({ deactivated: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;