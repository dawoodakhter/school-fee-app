// The rules for students, shared by the student screens and the spreadsheet import.
// Adding a student by hand and by spreadsheet follow exactly the same rules.

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

const COLUMN_FOR = {
  name: 'name', rollNumber: 'roll_number', classId: 'class_id', guardianName: 'guardian_name',
  contactNumber: 'contact_number', gender: 'gender', section: 'section',
  dateOfBirth: 'date_of_birth', admissionDate: 'admission_date',
  concession: 'concession', customFee: 'custom_fee', isActive: 'is_active',
};

// ADD a student and one fee row for every month of the billing period.
// client must be inside a transaction. tuition = the monthly fee (custom fee or class fee).
async function createStudent(client, values, months, tuition) {
  const ins = await client.query(
    `INSERT INTO students (roll_number, name, guardian_name, contact_number, gender,
       date_of_birth, admission_date, class_id, section, concession, custom_fee)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [values.rollNumber, values.name, values.guardianName || null, values.contactNumber || null,
     values.gender || null, values.dateOfBirth || null, values.admissionDate || null,
     values.classId, values.section || null, values.concession || 0, values.customFee || null]
  );
  const id = ins.rows[0].id;
  const params = [id];
  const rows = months.map((m, i) => { params.push(m, tuition); return `($1,$${i * 2 + 2},$${i * 2 + 3})`; });
  await client.query(`INSERT INTO monthly_fees (student_id, month, tuition) VALUES ${rows.join(',')}`, params);
  return id;
}

// CHANGE a student. values holds only the fields to change (as returned by readFields).
// If the class or the custom fee changed, months with NO payments get the new tuition.
// Months that already have a payment keep the amount they were charged.
// client must be inside a transaction.
async function updateStudent(client, id, values) {
  const sets = [], params = [];
  for (const [key, val] of Object.entries(values)) {
    params.push(val);
    sets.push(`${COLUMN_FOR[key]} = $${params.length}`);
  }
  params.push(id);
  await client.query(`UPDATE students SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

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
}

module.exports = { titleCase, isRealDate, readFields, COLUMN_FOR, createStudent, updateStudent };