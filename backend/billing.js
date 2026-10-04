// The billing period (first and last month) and how it can grow.
const { getMonthsBetween } = require('./feeCalc');

const isMonth = (v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v));

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// Makes the billing period LONGER. db must be a client inside a transaction (BEGIN ... COMMIT).
// Every student (also students who left) gets a fee row for each new month.
async function extendBillingPeriod(db, start, end) {
  if (!isMonth(start) || !isMonth(end)) throw httpError(400, 'start and end must look like 2026-09');
  if (start > end) throw httpError(400, 'start must not be after end');

  const r = await db.query("SELECT key, value FROM settings WHERE key IN ('academic_year_start', 'academic_year_end')");
  const now = Object.fromEntries(r.rows.map((x) => [x.key, x.value]));
  const oldStart = now.academic_year_start;
  const oldEnd = now.academic_year_end;
  if (start > oldStart || end < oldEnd) {
    throw httpError(400, `You can only make the billing period longer. It now runs from ${oldStart} to ${oldEnd}.`);
  }

  const months = getMonthsBetween(start, end);
  if (months.length > 24) throw httpError(400, 'The billing period can be 24 months long at most');
  const oldMonths = getMonthsBetween(oldStart, oldEnd);
  const newMonths = months.filter((m) => !oldMonths.includes(m));

  let rowsAdded = 0;
  if (newMonths.length > 0) {
    const added = await db.query(
      `INSERT INTO monthly_fees (student_id, month, tuition)
       SELECT s.id, m.month, COALESCE(s.custom_fee, c.monthly_fee)
       FROM students s
       JOIN classes c ON c.id = s.class_id
       CROSS JOIN unnest($1::text[]) AS m(month)
       ON CONFLICT (student_id, month) DO NOTHING`,
      [newMonths]
    );
    rowsAdded = added.rowCount;
  }
  await db.query(
    `INSERT INTO settings (key, value) VALUES ('academic_year_start', $1), ('academic_year_end', $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [start, end]
  );
  return { start, end, months, newMonths, rowsAdded };
}

module.exports = { extendBillingPeriod, isMonth, httpError };