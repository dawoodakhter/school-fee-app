// New school session: moves students up one class, carries unpaid money forward,
// and sets the new billing period. Everything happens in ONE transaction (all or nothing).
const pool = require('./db');
const { loadStudents, getSettings } = require('./studentData');
const { getFeeSummary, getMonthsBetween } = require('./feeCalc');
const { isMonth, httpError } = require('./billing');

const PASSED_OUT = 'Passed Out';

function nextMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// What the new session would look like. Changes nothing.
async function buildPlan(start, end) {
  const old = await getSettings();
  if (!isMonth(start) || !isMonth(end)) throw httpError(400, 'start and end must look like 2027-04');
  if (start > end) throw httpError(400, 'start must not be after end');
  if (start <= old.end) throw httpError(400, `The new session must start after the old one ends (${old.end}).`);
  const months = getMonthsBetween(start, end);
  if (months.length > 24) throw httpError(400, 'A session can be 24 months long at most');

  const allClasses = (await pool.query(
    'SELECT id, name, monthly_fee, sort_order FROM classes ORDER BY sort_order, id')).rows;
  const chain = allClasses.filter((c) => c.name !== PASSED_OUT);
  const passedOut = allClasses.find((c) => c.name === PASSED_OUT) || null;
  if (chain.length === 0) throw httpError(400, 'There are no classes');

  const rows = (await pool.query('SELECT id, class_id, roll_number, is_active FROM students')).rows;
  const moves = chain.map((c, i) => {
    const target = chain[i + 1] || null;
    return {
      from: c, to: target,
      toName: target ? target.name : PASSED_OUT,
      count: rows.filter((s) => s.class_id === c.id && s.is_active).length,
    };
  });

  // roll-number clashes: a promoted student must not meet a student who already sits in the target class
  const clashes = [];
  chain.forEach((c, i) => {
    const target = chain[i + 1];
    if (!target) return;
    const staying = new Set(rows.filter((s) => s.class_id === target.id && !s.is_active).map((s) => s.roll_number));
    for (const s of rows.filter((x) => x.class_id === c.id && x.is_active)) {
      if (staying.has(s.roll_number)) clashes.push(`${c.name} roll ${s.roll_number} clashes with a former student in ${target.name}`);
    }
  });

  // unpaid money of the old session, per student
  const students = await loadStudents();
  const carry = [];
  for (const s of students) {
    const sum = getFeeSummary(s, old);
    if (sum.sessionRemaining > 0) {
      carry.push({ id: s.id, name: s.name, className: s.class_name, amount: sum.sessionRemaining });
    }
  }
  return {
    old, start, end, months, chain, passedOut, moves, clashes,
    carry,
    carryTotal: carry.reduce((t, x) => t + x.amount, 0),
    graduates: moves[moves.length - 1],
  };
}

function summarize(plan) {
  return {
    oldStart: plan.old.start, oldEnd: plan.old.end, start: plan.start, end: plan.end,
    monthsCount: plan.months.length,
    moves: plan.moves.map((m) => ({ from: m.from.name, to: m.toName, count: m.count })),
    clashes: plan.clashes,
    carryCount: plan.carry.length,
    carryTotal: plan.carryTotal,
    carryTop: [...plan.carry].sort((a, b) => b.amount - a.amount).slice(0, 10),
  };
}

async function preview(start, end) {
  return summarize(await buildPlan(start, end));
}

async function startNewSession(start, end) {
  const plan = await buildPlan(start, end);
  if (plan.clashes.length > 0) {
    throw httpError(409, 'Some roll numbers clash, so nothing was changed. ' + plan.clashes.slice(0, 5).join('; '));
  }
  const gradYear = plan.old.end.slice(0, 4);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. students of the last class pass out (they get the class "Passed Out", inactive)
    let poId = plan.passedOut ? plan.passedOut.id : null;
    if (!poId) {
      const r = await client.query(
        `INSERT INTO classes (name, monthly_fee, sort_order)
         VALUES ($1, 0, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM classes)) RETURNING id`, [PASSED_OUT]);
      poId = r.rows[0].id;
    }
    const last = plan.chain[plan.chain.length - 1];
    const grads = await client.query(
      `UPDATE students SET class_id = $1, is_active = FALSE, roll_number = roll_number || ' (' || $2 || ')'
       WHERE class_id = $3 AND is_active`, [poId, gradYear, last.id]);

    // 2. everybody else moves up one class, highest class first
    let promoted = 0;
    for (let i = plan.chain.length - 2; i >= 0; i--) {
      const r = await client.query(
        'UPDATE students SET class_id = $1 WHERE class_id = $2 AND is_active',
        [plan.chain[i + 1].id, plan.chain[i].id]);
      promoted += r.rowCount;
    }

    // 3. unpaid money moves into ONE charge per student; the old charges are replaced by it
    await client.query('DELETE FROM one_time_charges');
    const label = `Previous session balance (${plan.old.start} to ${plan.old.end})`;
    for (const c of plan.carry) {
      await client.query(
        'INSERT INTO one_time_charges (student_id, name, amount, paid_amount) VALUES ($1, $2, $3, 0)',
        [c.id, label, c.amount]);
    }

    // 4. new billing period and a fee row for every month and every student
    await client.query(
      `INSERT INTO settings (key, value) VALUES ('academic_year_start', $1), ('academic_year_end', $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [start, end]);
    const added = await client.query(
      `INSERT INTO monthly_fees (student_id, month, tuition)
       SELECT s.id, m.month, COALESCE(s.custom_fee, c.monthly_fee)
       FROM students s JOIN classes c ON c.id = s.class_id
       CROSS JOIN unnest($1::text[]) AS m(month)
       ON CONFLICT (student_id, month) DO NOTHING`, [plan.months]);

    await client.query('COMMIT');
    return {
      start, end, promoted, passedOut: grads.rowCount,
      carriedStudents: plan.carry.length, carriedTotal: plan.carryTotal, feeRowsAdded: added.rowCount,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { preview, startNewSession, nextMonth, PASSED_OUT };