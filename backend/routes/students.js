// Student routes: add, view, edit, deactivate (and restore) a student.
const express = require('express');
const pool = require('../db');
const { getSettings } = require('../studentData');
const { getMonthsBetween } = require('../feeCalc');

const router = express.Router();

const STUDENT_SELECT = `
  SELECT s.id, s.roll_number AS "rollNumber", s.name, s.guardian_name AS "guardianName",
         s.contact_number AS "contactNumber", s.gender,
         to_char(s.date_of_birth, 'YYYY-MM-DD') AS "dateOfBirth",
         to_char(s.admission_date, 'YYYY-MM-DD') AS "admissionDate",
         s.section, s.concession, s.custom_fee AS "customFee", s.is_active AS "isActive",
         c.id AS "classId", c.name AS "class", c.monthly_fee AS "classFee"
  FROM students s JOIN classes c ON c.id = s.class_id`;

function titleCase(s) {
  return String(s).trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function isRealDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === v;
}

// Checks the fields that were sent. Returns { errors: [...], values: {...} }.
// Only fields that are present in the body are checked and returned.
function readFields(body, isCreate) {
  const errors = [];
  const v = {};
  const has = (k) => body[k] !== undefined;

  if (has('name') || isCreate) {
    const t = String(body.name || '').trim();
    if (!t) errors.push('name is required');
    else if (t.length > 100) errors.push('name is too long');
    else v.name = titleCase(t);
  }
  if (has('rollNumber') || isCreate) {
    const t = String(body.rollNumber || '').trim().toUpperCase();
    if (!t) errors.push('rollNumber is required');
    else if (t.length > 20) errors.push('rollNumber is too long');
    else v.rollNumber = t;
  }
  if (has('classId') || isCreate) {
    const n = Number(body.classId);
    if (!Number.isInteger(n) || n <= 0) errors.push('classId is required (see /api/classes)');
    else v.classId = n;
  }
  for (const [key, label, max] of [
    ['guardianName', 'guardianName', 100], ['contactNumber', 'contactNumber', 30],
    ['gender', 'gender', 20], ['section', 'section', 20],
  ]) {
    if (has(key)) {
      const t = body[key] === null ? '' : String(body[key]).trim();
      if (t.length > max) errors.push(`${label} is too long`);
      else v[key] = t === '' ? null : (key === 'guardianName' ? titleCase(t) : t);
    }
  }
  for (const key of ['dateOfBirth', 'admissionDate']) {
    if (has(key)) {
      if (body[key] === null || body[key] === '') v[key] = null;
      else if (!isRealDate(String(body[key]))) errors.push(`${key} must look like 2026-09-30`);
      else v[key] = String(body[key]);
    }
  }
  if (has('concession')) {
    const n = Number(body.concession);
    if (!Number.isInteger(n) || n < 0) errors.push('concession must be a whole number, 0 or more');
    else v.concession = n;
  }
  if (has('customFee')) {
    if (body.customFee === null || body.customFee === '') v.customFee = null;
    else {
      const n = Number(body.customFee);
      if (!Number.isInteger(n) || n <= 0) errors.push('customFee must be a whole number above 0, or null');
      else v.customFee = n;
    }
  }
  if (!isCreate && has('isActive')) {
    if (typeof body.isActive !== 'boolean') errors.push('isActive must be true or false');
    else v.isActive = body.isActive;
  }
  return { errors, values: v };
}

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
    const ins = await client.query(
      `INSERT INTO students (roll_number, name, guardian_name, contact_number, gender,
         date_of_birth, admission_date, class_id, section, concession, custom_fee)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [values.rollNumber, values.name, values.guardianName || null, values.contactNumber || null,
       values.gender || null, values.dateOfBirth || null, values.admissionDate || null,
       values.classId, values.section || null, values.concession || 0, values.customFee || null]
    );
    const id = ins.rows[0].id;

    // one fee row for each month of the billing window
    const params = [id];
    const rows = months.map((m, i) => { params.push(m, tuition); return `($1,$${i * 2 + 2},$${i * 2 + 3})`; });
    await client.query(`INSERT INTO monthly_fees (student_id, month, tuition) VALUES ${rows.join(',')}`, params);
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

    const columnFor = {
      name: 'name', rollNumber: 'roll_number', classId: 'class_id', guardianName: 'guardian_name',
      contactNumber: 'contact_number', gender: 'gender', section: 'section',
      dateOfBirth: 'date_of_birth', admissionDate: 'admission_date',
      concession: 'concession', customFee: 'custom_fee', isActive: 'is_active',
    };
    const sets = [], params = [];
    for (const [key, val] of Object.entries(values)) {
      params.push(val);
      sets.push(`${columnFor[key]} = $${params.length}`);
    }
    params.push(id);

    await client.query('BEGIN');
    await client.query(`UPDATE students SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

    // If the class or the custom fee changed, months with NO payments get the new tuition.
    // Months that already have a payment keep the amount they were charged.
    if (values.classId !== undefined || values.customFee !== undefined) {
      await client.query(
        `UPDATE monthly_fees mf
         SET tuition = (SELECT COALESCE(s.custom_fee, c.monthly_fee)
                        FROM students s JOIN classes c ON c.id = s.class_id WHERE s.id = mf.student_id)
         WHERE mf.student_id = $1
           AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.student_id = mf.student_id AND p.month = mf.month)`,
        [id]
      );
    }
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