// Fee calculation. The rules are the same as your old HTML app (getFeeSummary).
// This file does no database work. It only does maths on the data it is given.

function addMonths(yyyyMM, n) {
  const [y, m] = yyyyMM.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthsBetween(start, end) {
  if (!start || !end || start > end) return [];
  const months = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard < 600) {
    months.push(cur);
    cur = addMonths(cur, 1);
    guard++;
  }
  return months;
}

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// student = one object from loadStudents() in studentData.js
// settings = { start: '2026-09', end: '2027-03' }
function getFeeSummary(student, settings, nowMonth = currentMonthStr()) {
  const concession = student.concession || 0;
  const allMonths = getMonthsBetween(settings.start, settings.end);
  const miscTotal = student.oneTime.reduce((s, c) => s + c.amount, 0);
  const miscPaid = student.oneTime.reduce((s, c) => s + c.paid_amount, 0);
  const defaultTuition = student.custom_fee > 0 ? student.custom_fee : student.class_fee;

  let runningArrear = 0;
  const months = allMonths.map((m) => {
    const fee = student.feeRows[m] || {};
    const pay = student.payments[m] || { paid: 0, date: '', receivedBy: '' };
    const tuition = fee.tuition !== undefined ? fee.tuition : defaultTuition;
    const stationary = fee.stationary || 0;
    const exam = fee.exam || 0;
    const miscFund = fee.misc_fund || 0;
    const paid = pay.paid;

    const gross = tuition + stationary + exam + miscFund;
    const due = Math.max(0, gross - (tuition > 0 ? concession : 0));
    const isFuture = m > nowMonth;
    const arrearBefore = runningArrear;
    const totalDueRow = due + arrearBefore;
    const balance = Math.max(0, totalDueRow - paid);
    runningArrear = balance;

    let status;
    if (due <= 0 && paid <= 0) status = 'n/a';
    else if (paid >= due && due > 0) status = 'paid';
    else if (paid > 0) status = 'partial';
    else status = isFuture ? 'upcoming' : 'pending';

    return {
      month: m, status, isFuture,
      tuition, stationary, exam, miscFund,
      due, paid, date: pay.date, receivedBy: pay.receivedBy,
      arrearBefore, totalDueRow, balance,
    };
  });

  // Only months that have already started count as owed.
  const billed = months.filter((m) => !m.isFuture);
  const pendingMonths = billed.filter((m) => m.status === 'pending' || m.status === 'partial');
  const totalDue = billed.reduce((s, m) => s + m.due, 0) + miscTotal;
  const fullYearDue = months.reduce((s, m) => s + m.due, 0) + miscTotal;

  // Money paid for months inside the billing window + one-time charges paid.
  const paidInWindow = months.reduce((s, m) => s + m.paid, 0);
  const totalPaid = miscPaid + paidInWindow;

  // Money recorded for months OUTSIDE the billing window. Kept visible, not lost.
  const allPaid = Object.values(student.payments).reduce((s, p) => s + p.paid, 0);
  const paidOutsideWindow = allPaid - paidInWindow;

  const remaining = Math.max(0, totalDue - totalPaid);
  const sessionRemaining = Math.max(0, fullYearDue - totalPaid);

  let status;
  if (totalDue > 0 && totalPaid >= totalDue) status = 'paid';
  else if (totalPaid > 0) status = 'partial';
  else status = 'pending';

  return {
    months, pendingMonthsCount: pendingMonths.length,
    miscTotal, totalDue, fullYearDue, totalPaid,
    paidOutsideWindow, remaining, sessionRemaining, status,
  };
}

module.exports = { getFeeSummary, getMonthsBetween, currentMonthStr };