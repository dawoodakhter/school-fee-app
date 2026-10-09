// Importing students from a spreadsheet: first PLAN (check every row, nothing is saved), then APPLY.
// A row is matched to an existing student by its ID, or else by Class + Roll number.
// Rows that match nobody become NEW students. Empty cells never change anything.
const { isRealDate, readFields, createStudent, updateStudent } = require('./studentOps');

const MAX_ROWS = 3000;

const pad = (n) => String(n).padStart(2, '0');
const clean = (v) => (v === undefined || v === null ? '' : String(v).trim());

// Accepts 2020-05-01, 2020-5-1 and 1/5/2020 or 01-05-2020 (day first, as in Pakistan)
function normalizeDate(text) {
  let y, mo, d;
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/);
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else {
    m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (!m) return { error: `"${text}" is not a date. Write it like 2020-05-01 or 1/5/2020 (day first)` };
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  const iso = `${y}-${pad(mo)}-${pad(d)}`;
  return isRealDate(iso) ? { value: iso } : { error: `"${text}" is not a real date` };
}

// Excel drops the first 0 of a phone number like 0300 1234567. Put it back.
function normalizePhone(text) {
  if (/^\d(\.\d+)?e[+-]?\d+$/i.test(text)) {
    return { error: `"${text}" was changed into a short number by Excel. Format the Contact column as Text and type the numbers again` };
  }
  if (/^3\d{9}$/.test(text)) return { value: '0' + text };
  return { value: text };
}

function normalizeGender(text) {
  const t = text.toLowerCase();
  if (['male', 'm', 'boy'].includes(t)) return { value: 'Male' };
  if (['female', 'f', 'girl'].includes(t)) return { value: 'Female' };
  return { error: `Gender "${text}" is not Male or Female` };
}

function normalizeStatus(text) {
  const t = text.toLowerCase();
  if (t === 'active') return { value: true };
  if (['left', 'inactive'].includes(t)) return { value: false };
  return { error: `Status "${text}" must be Active or Left` };
}

// "1,200" and "PKR 1200" become 1200
function normalizeNumber(text, label) {
  const t = text.replace(/^(pkr|rs\.?)/i, '').replace(/[,\s]/g, '');
  if (!/^\d+$/.test(t)) return { error: `${label} "${text}" must be a whole number` };
  return { value: Number(t) };
}

function existingValue(student, key) {
  const map = {
    name: 'name', rollNumber: 'roll_number', classId: 'class_id', guardianName: 'guardian_name',
    contactNumber: 'contact_number', gender: 'gender', section: 'section', dateOfBirth: 'date_of_birth',
    admissionDate: 'admission_date', concession: 'concession', customFee: 'custom_fee', isActive: 'is_active',
  };
  const v = student[map[key]];
  return v === undefined ? null : v;
}

// rows: [{ line, id, name, rollNumber, class, section, guardianName, contactNumber, gender,
//          dateOfBirth, admissionDate, concession, customFee, status }]  (everything as text)
// classes: [{ id, name, monthly_fee }]    students: every student, as read from the database
function planImport(rows, classes, students) {
  const classByName = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c]));
  const classById = new Map(classes.map((c) => [c.id, c]));
  const studentById = new Map(students.map((s) => [s.id, s]));
  const keyOf = (classId, roll) => `${classId}|${String(roll).toUpperCase()}`;
  const studentByKey = new Map(students.map((s) => [keyOf(s.class_id, s.roll_number), s]));

  const items = rows.map((row, index) => {
    const item = {
      line: Number.isInteger(row.line) ? row.line : index + 2,
      errors: [], action: null, existing: null, values: {}, changedValues: {}, changes: [],
    };
    const cell = (key) => clean(row[key]);
    const fail = (message) => item.errors.push(message);

    // ----- which student is this row about? -----
    const idText = cell('id');
    const className = cell('class');
    const rollText = cell('rollNumber');
    let classFromCell = null;
    if (className) {
      classFromCell = classByName.get(className.toLowerCase());
      if (!classFromCell) fail(`Unknown class "${className}"`);
    }
    if (idText) {
      const id = Number(idText);
      item.existing = Number.isInteger(id) ? studentById.get(id) || null : null;
      if (!item.existing) fail(`There is no student with ID ${idText}`);
    } else if (!className && !rollText) {
      fail('Each row needs an ID, or both a Class and a Roll number');
    } else if (!className || !rollText) {
      fail('Without an ID, a row needs both a Class and a Roll number');
    } else if (classFromCell) {
      item.existing = studentByKey.get(keyOf(classFromCell.id, rollText)) || null;
    }
    item.action = item.existing ? 'update' : 'create';

    // ----- read the cells (empty cells are skipped) -----
    const body = {};
    if (cell('name')) body.name = cell('name');
    if (rollText) body.rollNumber = rollText;
    if (classFromCell) body.classId = classFromCell.id;
    if (cell('section')) body.section = cell('section');
    if (cell('guardianName')) body.guardianName = cell('guardianName');
    if (cell('contactNumber')) {
      const r = normalizePhone(cell('contactNumber'));
      if (r.error) fail(r.error); else body.contactNumber = r.value;
    }
    if (cell('gender')) {
      const r = normalizeGender(cell('gender'));
      if (r.error) fail(r.error); else body.gender = r.value;
    }
    for (const key of ['dateOfBirth', 'admissionDate']) {
      if (cell(key)) {
        const r = normalizeDate(cell(key));
        if (r.error) fail(`${key === 'dateOfBirth' ? 'Date of birth' : 'Admission date'}: ${r.error}`);
        else body[key] = r.value;
      }
    }
    if (cell('concession')) {
      const r = normalizeNumber(cell('concession'), 'Concession');
      if (r.error) fail(r.error); else body.concession = r.value;
    }
    if (cell('customFee')) {
      const r = normalizeNumber(cell('customFee'), 'Custom fee');
      if (r.error) fail(r.error); else body.customFee = r.value;
    }
    if (cell('status')) {
      const r = normalizeStatus(cell('status'));
      if (r.error) fail(r.error);
      else if (item.action === 'create' && r.value === false) fail('A new student cannot start as Left');
      else if (item.action === 'update') body.isActive = r.value;
    }

    // ----- the same rules as adding or editing a student by hand -----
    if (item.errors.length === 0) {
      const checked = readFields(body, item.action === 'create');
      checked.errors.forEach((e) => fail(e));
      item.values = checked.values;
    }

    // ----- what would change? -----
    if (item.errors.length === 0 && item.action === 'update') {
      for (const [key, value] of Object.entries(item.values)) {
        const before = existingValue(item.existing, key);
        if ((before === null ? null : before) !== (value === null ? null : value)) {
          item.changedValues[key] = value;
          if (key === 'classId') {
            item.changes.push({ field: 'class', from: classById.get(before)?.name || '', to: classById.get(value)?.name || '' });
          } else if (key === 'isActive') {
            item.changes.push({ field: 'status', from: before ? 'Active' : 'Left', to: value ? 'Active' : 'Left' });
          } else {
            item.changes.push({ field: key, from: before, to: value });
          }
        }
      }
      if (item.changes.length === 0) item.action = 'unchanged';
    }
    return item;
  });

  // ----- roll numbers must stay unique inside every class, one row after the other -----
  const occupied = new Map(students.map((s) => [keyOf(s.class_id, s.roll_number), { id: s.id, name: s.name }]));
  const seenStudents = new Set();
  for (const item of items) {
    if (item.errors.length > 0) continue;
    if (item.existing) {
      if (seenStudents.has(item.existing.id)) {
        item.errors.push(`${item.existing.name} appears more than once in the file`);
        continue;
      }
      seenStudents.add(item.existing.id);
    }
    const classId = item.values.classId !== undefined ? item.values.classId : item.existing && item.existing.class_id;
    const roll = item.values.rollNumber !== undefined ? item.values.rollNumber : item.existing && item.existing.roll_number;
    const newKey = keyOf(classId, roll);
    if (item.existing) {
      const oldKey = keyOf(item.existing.class_id, item.existing.roll_number);
      if (newKey === oldKey) continue;
      const holder = occupied.get(newKey);
      if (holder) {
        item.errors.push(`Roll number ${roll} is already used in ${classById.get(classId).name} by ${holder.name}`);
        continue;
      }
      occupied.delete(oldKey);
      occupied.set(newKey, { id: item.existing.id, name: item.existing.name });
    } else {
      const holder = occupied.get(newKey);
      if (holder) {
        item.errors.push(`Roll number ${roll} is already used in ${classById.get(classId).name} by ${holder.name}`);
        continue;
      }
      occupied.set(newKey, { id: null, name: item.values.name });
    }
  }

  const summary = { total: items.length, create: 0, update: 0, unchanged: 0, errors: 0 };
  for (const item of items) {
    if (item.errors.length > 0) summary.errors += 1;
    else summary[item.action] += 1;
  }

  const publicRows = items.map((item, i) => ({
    line: item.line,
    action: item.errors.length > 0 ? 'error' : item.action,
    id: item.existing ? item.existing.id : null,
    name: item.values.name || (item.existing ? item.existing.name : clean(rows[i].name)),
    class: item.values.classId !== undefined
      ? classById.get(item.values.classId)?.name
      : item.existing ? classById.get(item.existing.class_id)?.name : '',
    rollNumber: item.values.rollNumber || (item.existing ? item.existing.roll_number : ''),
    changes: item.changes,
    errors: item.errors,
  }));

  return { items, summary, rows: publicRows, classById };
}

// Saves the plan. client must be inside a transaction. Everything or nothing.
async function applyPlan(client, plan, months) {
  let created = 0;
  let updated = 0;
  for (const item of plan.items) {
    if (item.action === 'create') {
      const cls = plan.classById.get(item.values.classId);
      await createStudent(client, item.values, months, item.values.customFee || cls.monthly_fee);
      created += 1;
    } else if (item.action === 'update') {
      await updateStudent(client, item.existing.id, item.changedValues);
      updated += 1;
    }
  }
  return { created, updated };
}

module.exports = { MAX_ROWS, planImport, applyPlan, normalizeDate, normalizePhone };