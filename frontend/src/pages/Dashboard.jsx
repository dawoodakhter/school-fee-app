import { useEffect, useState } from 'react'
import { api } from '../api'
import { money } from '../format'

export default function Dashboard() {
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

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

  const sum = (list, key) => list.reduce((total, s) => total + s[key], 0)
  const count = (status) => students.filter((s) => s.status === status).length

  return (
    <div>
      <main className="page">
        <h2>Dashboard</h2>

        {loading && <p className="muted">Loading...</p>}
        {error && <p className="error" role="alert">{error}</p>}

        {!loading && !error && (
          <>
            <div className="cards">
              <div className="card stat">
                <span className="muted">Students</span>
                <strong>{students.length}</strong>
              </div>
              <div className="card stat">
                <span className="muted">Due so far</span>
                <strong>{money(sum(students, 'totalDue'))}</strong>
              </div>
              <div className="card stat">
                <span className="muted">Collected</span>
                <strong>{money(sum(students, 'totalPaid'))}</strong>
              </div>
              <div className="card stat">
                <span className="muted">Remaining</span>
                <strong>{money(sum(students, 'remaining'))}</strong>
              </div>
            </div>

            <div className="cards">
              <div className="card stat">
                <span className="muted">Paid</span>
                <strong className="good">{count('paid')}</strong>
              </div>
              <div className="card stat">
                <span className="muted">Partly paid</span>
                <strong className="warn">{count('partial')}</strong>
              </div>
              <div className="card stat">
                <span className="muted">Not paid</span>
                <strong className="bad">{count('pending')}</strong>
              </div>
            </div>

            <h3>Classes</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Monthly fee</th>
                    <th>Students</th>
                    <th>Due so far</th>
                    <th>Collected</th>
                    <th>Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c) => {
                    const inClass = students.filter((s) => s.class === c.name)
                    return (
                      <tr key={c.id}>
                        <td>{c.name}</td>
                        <td>{money(c.monthlyFee)}</td>
                        <td>{inClass.length}</td>
                        <td>{money(sum(inClass, 'totalDue'))}</td>
                        <td>{money(sum(inClass, 'totalPaid'))}</td>
                        <td>{money(sum(inClass, 'remaining'))}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  )
}