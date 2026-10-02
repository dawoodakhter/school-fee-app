import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { downloadCsv, toCsv } from '../csv'
import { money, today } from '../format'

const COLUMNS = [
  { label: 'Class', value: (s) => s.class },
  { label: 'Roll', value: (s) => s.rollNumber },
  { label: 'Name', value: (s) => s.name },
  { label: 'Guardian', value: (s) => s.guardianName },
  { label: 'Contact', value: (s) => s.contactNumber },
  { label: 'Due so far', value: (s) => s.totalDue },
  { label: 'Paid', value: (s) => s.totalPaid },
  { label: 'Remaining', value: (s) => s.remaining },
]

export default function OwedReport() {
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [classFilter, setClassFilter] = useState('')
  const [onlyOwing, setOnlyOwing] = useState(true)
  const [sortBy, setSortBy] = useState('class')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [c, s] = await Promise.all([api('/classes'), api('/students')])
        if (cancelled) return
        setClasses(c.classes)
        setStudents(s.students)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const rows = useMemo(() => {
    const list = students.filter(
      (s) => (!classFilter || s.class === classFilter) && (!onlyOwing || s.remaining > 0),
    )
    // the list from the backend is already in class and roll order
    if (sortBy === 'most') return [...list].sort((a, b) => b.remaining - a.remaining)
    return list
  }, [students, classFilter, onlyOwing, sortBy])

  const total = rows.reduce((t, s) => t + s.remaining, 0)
  const title = `Fees owed${classFilter ? ' - ' + classFilter : ''}`

  if (loading) return <p className="muted">Loading...</p>
  if (error) return <p className="error" role="alert">{error}</p>

  return (
    <>
      <div className="print-only">
        <h2>{title}</h2>
        <p>Printed on {today()}</p>
      </div>

      <div className="filters no-print">
        <select aria-label="Class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
        <select aria-label="Sort by" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="class">Class and roll number</option>
          <option value="most">Most owed first</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} />
          Only students who owe money
        </label>
      </div>

      <div className="report-actions no-print">
        <button onClick={() => window.print()}>Print</button>
        <button
          className="secondary"
          onClick={() => downloadCsv(`fees-owed-${today()}.csv`, toCsv(COLUMNS, rows))}
        >
          Download spreadsheet
        </button>
      </div>

      <p className="muted" data-testid="owed-summary">
        {rows.length} students, {money(total)} remaining
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Class</th>
              <th>Roll</th>
              <th>Name</th>
              <th>Guardian</th>
              <th>Contact</th>
              <th>Due so far</th>
              <th>Paid</th>
              <th>Remaining</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>{s.class}</td>
                <td>{s.rollNumber}</td>
                <td><Link to={`/students/${s.id}`}>{s.name}</Link></td>
                <td>{s.guardianName || '-'}</td>
                <td>{s.contactNumber || '-'}</td>
                <td>{money(s.totalDue)}</td>
                <td>{money(s.totalPaid)}</td>
                <td>{money(s.remaining)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="8" className="muted">Nobody to show.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}