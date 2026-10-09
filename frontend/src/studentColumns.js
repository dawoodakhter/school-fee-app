// The columns of the student spreadsheet: how they are written (export) and how they are recognised (import).

export const COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'rollNumber', label: 'Roll number' },
  { key: 'class', label: 'Class' },
  { key: 'section', label: 'Section' },
  { key: 'guardianName', label: 'Guardian' },
  { key: 'contactNumber', label: 'Contact' },
  { key: 'gender', label: 'Gender' },
  { key: 'dateOfBirth', label: 'Date of birth' },
  { key: 'admissionDate', label: 'Admission date' },
  { key: 'concession', label: 'Concession' },
  { key: 'customFee', label: 'Custom fee' },
  { key: 'status', label: 'Status' },
]

export const LABELS = Object.fromEntries(COLUMNS.map((c) => [c.key, c.label]))

// for toCsv(): one column per entry
export const EXPORT_COLUMNS = COLUMNS.map((c) => ({
  label: c.label,
  value: (s) => {
    if (c.key === 'status') return s.isActive ? 'Active' : 'Left'
    const v = s[c.key]
    return v === null || v === undefined ? '' : v
  },
}))

// other ways people write the column names
const ALIASES = {
  id: ['id', 'studentid'],
  name: ['name', 'studentname', 'fullname'],
  rollNumber: ['rollnumber', 'roll', 'rollno', 'rollnum'],
  class: ['class', 'classname', 'grade'],
  section: ['section'],
  guardianName: ['guardian', 'guardianname', 'fathername', 'parent', 'parentname'],
  contactNumber: ['contact', 'contactnumber', 'phone', 'phonenumber', 'mobile', 'mobilenumber', 'whatsapp'],
  gender: ['gender', 'sex'],
  dateOfBirth: ['dateofbirth', 'dob', 'birthdate'],
  admissionDate: ['admissiondate', 'dateofadmission'],
  concession: ['concession', 'discount'],
  customFee: ['customfee', 'customfees', 'specialfee'],
  status: ['status'],
}
const KEY_FOR = {}
for (const [key, names] of Object.entries(ALIASES)) for (const n of names) KEY_FOR[n] = key

const simplify = (text) => String(text).toLowerCase().replace(/[^a-z0-9]/g, '')

// table = rows from parseCsv. The first row holds the column names.
// Returns { columns: [keys found], unknown: [names ignored], rows: [{ line, ...cells }], problem }
export function readTable(table) {
  if (table.length === 0) return { columns: [], unknown: [], rows: [], problem: 'The file is empty' }

  const columnOf = {} // key -> position
  const unknown = []
  table[0].forEach((name, position) => {
    const text = String(name).trim()
    if (text === '') return
    const key = KEY_FOR[simplify(text)]
    if (key && columnOf[key] === undefined) columnOf[key] = position
    else unknown.push(text)
  })
  const columns = Object.keys(columnOf)

  if (columns.length === 0) {
    return { columns, unknown, rows: [], problem: 'The first row of the file must hold the column names, like ID, Name, Class, Roll number, Contact.' }
  }
  if (!columns.includes('id') && !(columns.includes('class') && columns.includes('rollNumber'))) {
    return { columns, unknown, rows: [], problem: 'The file needs an ID column, or both a Class column and a Roll number column, so the app knows which student each row is about.' }
  }
  if (table.length < 2) return { columns, unknown, rows: [], problem: 'The file has column names but no students.' }

  const rows = table.slice(1).map((cells, i) => {
    const row = { line: i + 2 }
    for (const key of columns) row[key] = String(cells[columnOf[key]] ?? '').trim()
    return row
  })
  return { columns, unknown, rows, problem: '' }
}