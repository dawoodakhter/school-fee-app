// Reads the text of a spreadsheet file saved as CSV. Returns a list of rows, each a list of cells.
// Handles quotes ("Khan, Ali"), quotes inside quotes (""), new lines inside quotes, Windows line endings,
// the invisible first character Excel adds, and files that use ; or tabs instead of commas.
export function parseCsv(input) {
  const text = String(input).replace(/^\uFEFF/, '')

  const firstLine = text.split(/\r\n|\n|\r/, 1)[0]
  const counts = { ',': 0, ';': 0, '\t': 0 }
  for (const ch of firstLine) if (ch in counts) counts[ch] += 1
  const delimiter = Object.keys(counts).reduce((best, d) => (counts[d] > counts[best] ? d : best), ',')

  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // lines with nothing in them are skipped
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}