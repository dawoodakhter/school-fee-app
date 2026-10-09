import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { money } from '../format'
import Badge from '../components/Badge'

export default function Students() {
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showLeft, setShowLeft] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [c, s] = await Promise.all([
          api('/classes'),
          api(showLeft ? '/students?includeInactive=true' : '/students'),
        ])
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
  }, [showLeft])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter(
      (s) =>
        (!classFilter || s.class === classFilter) &&
        (!statusFilter || s.status === statusFilter) &&
        (!q || s.name.toLowerCase().includes(q) || s.rollNumber.toLowerCase().includes(q)),
    )
  }, [students, search, classFilter, statusFilter])

  const remainingShown = shown.reduce((total, s) => total + s.remaining, 0)

  return (
    <main className="page">
      <div className="page-head">
        <h2>Students</h2>
               <div className="head-buttons">
          <Link to="/students/import" className="button secondary">Import / export</Link>
                 <div className="head-buttons">
          <Link to="/students/import" className="button secondary">Import / export</Link>
          <Link to="/students/new" className="button">Add student</Link>
        </div>
        </div>
      </div>

      {loading && <p className="muted">Loading...</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {!loading && !error && (
        <>
          <div className="filters">
            <input
              aria-label="Search"
              placeholder="Search by name or roll number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select aria-label="Class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
            <select aria-label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="pending">Not paid</option>
              <option value="partial">Part paid</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          <label className="check">
            <input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} />
            Also show students who have left
          </label>

          <p className="muted" data-testid="summary">
            Showing {shown.length} of {students.length} students. Remaining: {money(remainingShown)}
          </p>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Roll</th>
                  <th>Name</th>
                  <th>Class</th>
                  <th>Due so far</th>
                  <th>Paid</th>
                  <th>Remaining</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} className={s.isActive === false ? 'row-left' : ''}>
                    <td>{s.rollNumber}</td>
                    <td>
                      <Link to={`/students/${s.id}`}>{s.name}</Link>
                      {s.isActive === false && <span className="left-tag">Left</span>}
                    </td>
                    <td>{s.class}</td>
                    <td>{money(s.totalDue)}</td>
                    <td>{money(s.totalPaid)}</td>
                    <td>{money(s.remaining)}</td>
                    <td><Badge status={s.status} /></td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan="7" className="muted">No students match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}