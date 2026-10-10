import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { money, monthLabel, today } from '../format'

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function niceDate(iso) {
  const [y, m, d] = String(iso).split('-')
  return y && m && d ? `${d}-${m}-${y}` : iso
}

function Slip({ copy, s, school, monthText, dueDate, number }) {
  return (
    <div className="slip">
      <div className="slip-head">
        <img className="challan-logo" src="/logo.jpg" alt="" />
        <div>
          <strong>{school.schoolName || 'School'}</strong>
          {school.schoolAddress && <div className="small">{school.schoolAddress}</div>}
          {school.schoolPhone && <div className="small">{school.schoolPhone}</div>}
        </div>
      </div>
      <div className="slip-title">Fee Challan - {copy}</div>
      <table className="slip-table">
        <tbody>
          <tr><td>Challan no.</td><td>{number}</td></tr>
          <tr><td>Month</td><td>{monthText}</td></tr>
          <tr><td>Student</td><td>{s.name}</td></tr>
          <tr><td>Class / Roll</td><td>{s.class} / {s.rollNumber}</td></tr>
          <tr><td>Guardian</td><td>{s.guardianName || '-'}</td></tr>
          <tr><td>Amount payable</td><td><strong>{money(s.remaining)}</strong></td></tr>
          <tr><td>Due date</td><td>{niceDate(dueDate)}</td></tr>
        </tbody>
      </table>
      <div className="slip-sign">Received by / stamp: ____________</div>
    </div>
  )
}

export default function Challans() {
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [school, setSchool] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [classFilter, setClassFilter] = useState('')
  const [onlyOwing, setOnlyOwing] = useState(true)
  const [dueDate, setDueDate] = useState(addDays(today(), 10))

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [c, s, st] = await Promise.all([api('/classes'), api('/students'), api('/settings')])
        if (cancelled) return
        setClasses(c.classes)
        setStudents(s.students)
        setSchool(st)
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

  const rows = useMemo(
    () =>
      students.filter(
        (s) => (!classFilter || s.class === classFilter) && (!onlyOwing || s.remaining > 0),
      ),
    [students, classFilter, onlyOwing],
  )

  const monthKey = today().slice(0, 7)
  const monthText = monthLabel(monthKey)

  if (loading) return <main className="page"><p className="muted">Loading...</p></main>
  if (error) return <main className="page"><p className="error" role="alert">{error}</p></main>

  return (
    <main className="page">
      <div className="no-print">
        <h2>Fee challans</h2>
        <p className="muted">
          One challan per student with a parent copy and a school copy. The amount is what the student
          still owes today, including anything unpaid from earlier months.
        </p>
        <div className="filters">
          <select aria-label="Class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <label>
            Due date
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={onlyOwing} onChange={(e) => setOnlyOwing(e.target.checked)} />
            Only students who owe money
          </label>
        </div>
        <div className="report-actions">
          <button onClick={() => window.print()} disabled={rows.length === 0}>
            Print {rows.length} challans
          </button>
        </div>
      </div>

      {rows.length === 0 && <p className="muted no-print">Nobody to show.</p>}

      <div className="challan-sheet">
        {rows.map((s) => {
          const number = `${monthKey.replace('-', '')}-${s.id}`
          return (
            <div className="challan" key={s.id}>
              <Slip copy="Parent copy" s={s} school={school} monthText={monthText} dueDate={dueDate} number={number} />
              <Slip copy="School copy" s={s} school={school} monthText={monthText} dueDate={dueDate} number={number} />
            </div>
          )
        })}
      </div>
    </main>
  )
}