import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { downloadCsv, toCsv } from '../csv'
import { money, today } from '../format'
import { DEFAULT_REMINDER, fillReminder, whatsappLink } from '../whatsapp'

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

const STORE_KEY = 'fee_reminder_text'

function loadReminder() {
  try {
    return localStorage.getItem(STORE_KEY) || DEFAULT_REMINDER
  } catch {
    return DEFAULT_REMINDER
  }
}

export default function OwedReport() {
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [schoolName, setSchoolName] = useState('our school')
  const [reminder, setReminder] = useState(loadReminder)
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
      // school name is optional: if this fails, the message says "our school"
      try {
        const st = await api('/settings')
        const name =
          st?.settings?.school_name ?? st?.school_name ?? st?.school?.name ?? st?.school?.schoolName
        if (!cancelled && name) setSchoolName(name)
      } catch {
        /* ignore */
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  function changeReminder(text) {
    setReminder(text)
    try {
      localStorage.setItem(STORE_KEY, text)
    } catch {
      /* ignore */
    }
  }

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

  function linkFor(s) {
    const message = fillReminder(reminder, {
      school: schoolName,
      name: s.name,
      class: s.class,
      amount: Number(s.remaining).toLocaleString('en-US'),
    })
    return whatsappLink(s.contactNumber, message)
  }

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

      <details className="reminder-box no-print">
        <summary>WhatsApp reminder message (you can change it)</summary>
        <p className="muted">
          Words in curly brackets are filled in for each student: {'{school}'} {'{name}'} {'{class}'} {'{amount}'}
        </p>
        <textarea
          aria-label="Reminder message"
          rows="5"
          value={reminder}
          onChange={(e) => changeReminder(e.target.value)}
        />
        <button type="button" className="secondary" onClick={() => changeReminder(DEFAULT_REMINDER)}>
          Use the standard message
        </button>
      </details>

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
              <th className="no-print">WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const link = linkFor(s)
              return (
                <tr key={s.id}>
                  <td>{s.class}</td>
                  <td>{s.rollNumber}</td>
                  <td><Link to={`/students/${s.id}`}>{s.name}</Link></td>
                  <td>{s.guardianName || '-'}</td>
                  <td>{s.contactNumber || '-'}</td>
                  <td>{money(s.totalDue)}</td>
                  <td>{money(s.totalPaid)}</td>
                  <td>{money(s.remaining)}</td>
                  <td className="no-print">
                    {link ? (
                      <a href={link} target="_blank" rel="noreferrer">WhatsApp</a>
                    ) : (
                      <span className="muted">No number</span>
                    )}
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan="9" className="muted">Nobody to show.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}