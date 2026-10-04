import { useEffect, useState } from 'react'
import { api } from '../api'
import { money, monthLabel, today } from '../format'

export default function ClassesPanel() {
  const [classes, setClasses] = useState([])
  const [months, setMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [edit, setEdit] = useState({ name: '', fee: '', from: '' })
  const [adding, setAdding] = useState({ name: '', fee: '' })

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [c, s] = await Promise.all([api('/classes'), api('/settings')])
        if (cancelled) return
        setClasses(c.classes)
        setMonths(s.months)
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
  }, [version])

  const reload = () => setVersion((v) => v + 1)
  const thisMonth = today().slice(0, 7)
  const defaultFrom = months.includes(thisMonth) ? thisMonth : months[0]

  function startEdit(c) {
    setEditingId(c.id)
    setEdit({ name: c.name, fee: String(c.monthlyFee), from: defaultFrom })
    setError('')
    setMessage('')
  }

  async function saveEdit(c) {
    setError('')
    setMessage('')
    const name = edit.name.trim()
    const fee = Number(edit.fee)
    if (!name) return setError('The class needs a name')
    if (edit.fee.trim() === '' || !Number.isInteger(fee) || fee < 0) {
      return setError('The fee must be a whole number, 0 or more')
    }
    const body = {}
    if (name !== c.name) body.name = name
    if (fee !== c.monthlyFee) {
      body.monthlyFee = fee
      body.effectiveFrom = edit.from
    }
    if (Object.keys(body).length === 0) return setError('Nothing changed')
    if (body.monthlyFee !== undefined) {
      const ok = window.confirm(
        `Change the monthly fee of ${c.name} from ${money(c.monthlyFee)} to ${money(fee)}, starting ${monthLabel(edit.from)}?\n\n` +
          'Earlier months, months that already have a payment, and students with their own custom fee keep what they have.',
      )
      if (!ok) return
    }
    try {
      const data = await api(`/classes/${c.id}`, { method: 'PUT', body })
      setMessage(
        body.monthlyFee !== undefined
          ? `Saved. ${data.monthsUpdated} fee months were updated.`
          : 'Saved.',
      )
      setEditingId(null)
      reload()
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeClass(c) {
    if (!window.confirm(`Remove the class "${c.name}"? This only works when it has no students.`)) return
    setError('')
    setMessage('')
    try {
      await api(`/classes/${c.id}`, { method: 'DELETE' })
      setMessage(`Removed the class ${c.name}`)
      reload()
    } catch (err) {
      setError(err.message)
    }
  }

  async function addClass(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    const fee = Number(adding.fee)
    if (!adding.name.trim()) return setError('Give the new class a name')
    if (adding.fee.trim() === '' || !Number.isInteger(fee) || fee < 0) {
      return setError('The fee must be a whole number, 0 or more')
    }
    try {
      await api('/classes', { method: 'POST', body: { name: adding.name.trim(), monthlyFee: fee } })
      setMessage(`Added the class ${adding.name.trim()}`)
      setAdding({ name: '', fee: '' })
      reload()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section>
      <h3>Classes and fees</h3>
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Class</th><th>Monthly fee</th><th>Students</th><th></th></tr>
            </thead>
            <tbody>
              {classes.map((c) =>
                editingId === c.id ? (
                  <tr key={c.id}>
                    <td>
                      <input
                        aria-label={`Name of ${c.name}`}
                        value={edit.name}
                        onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Monthly fee of ${c.name}`}
                        inputMode="numeric"
                        value={edit.fee}
                        onChange={(e) => setEdit({ ...edit, fee: e.target.value })}
                      />
                      {Number(edit.fee) !== c.monthlyFee && (
                        <label className="from-month">
                          from
                          <select
                            aria-label="Starting month"
                            value={edit.from}
                            onChange={(e) => setEdit({ ...edit, from: e.target.value })}
                          >
                            {months.map((m) => (
                              <option key={m} value={m}>{monthLabel(m)}</option>
                            ))}
                          </select>
                        </label>
                      )}
                    </td>
                    <td>{c.studentCount}</td>
                    <td>
                      <span className="inline-pay">
                        <button className="small" onClick={() => saveEdit(c)}>Save</button>
                        <button className="secondary small" onClick={() => setEditingId(null)}>Cancel</button>
                      </span>
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{money(c.monthlyFee)}</td>
                    <td>{c.studentCount}</td>
                    <td>
                      <span className="inline-pay">
                        <button className="secondary small" onClick={() => startEdit(c)} aria-label={`Edit ${c.name}`}>Edit</button>
                        <button className="danger small" onClick={() => removeClass(c)} aria-label={`Remove ${c.name}`}>Remove</button>
                      </span>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      <form className="card pay-form" onSubmit={addClass}>
        <div>
          <label htmlFor="nc-name">New class</label>
          <input id="nc-name" placeholder="for example Class 7" value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
        </div>
        <div>
          <label htmlFor="nc-fee">Monthly fee (PKR)</label>
          <input id="nc-fee" inputMode="numeric" value={adding.fee} onChange={(e) => setAdding({ ...adding, fee: e.target.value })} />
        </div>
        <button type="submit">Add class</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
    </section>
  )
}