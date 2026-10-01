// Small helpers for showing money, months and statuses.
export const money = (n) => 'PKR ' + Number(n || 0).toLocaleString('en-US')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// '2026-09' -> 'Sep 2026'
export function monthLabel(yyyyMM) {
  const [year, month] = String(yyyyMM).split('-')
  return `${MONTHS[Number(month) - 1] || month} ${year}`
}

const STATUS_TEXT = {
  paid: 'Paid',
  partial: 'Part paid',
  pending: 'Not paid',
  upcoming: 'Upcoming',
  'n/a': '-',
}
export const statusLabel = (status) => STATUS_TEXT[status] || status

// today as 2026-09-30 in the computer's own time zone
export const today = () => new Date().toLocaleDateString('en-CA')