// Turns rows into the text of a spreadsheet (CSV) file, and downloads it.

// A cell that starts with = or @ (or + or - followed by a letter) could be run as a formula
// when the file is opened in Excel, so we put a ' in front of it. Phone numbers like +92 300 are left alone.
function cell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=@\t\r]/.test(text) || /^[+-][^0-9\s.]/.test(text)) text = "'" + text
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

// columns: [{ label: 'Name', value: (row) => row.name }, ...]
export function toCsv(columns, rows) {
  const lines = [columns.map((c) => cell(c.label)).join(',')]
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(','))
  return lines.join('\r\n')
}

export function downloadCsv(filename, text) {
  // the first character makes Excel show non-English names correctly
  const blob = new Blob(['\ufeff' + text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}