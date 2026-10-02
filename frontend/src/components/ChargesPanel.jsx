import { useState } from 'react'
import { api } from '../api'
import { monthLabel } from '../format'

const FIELDS = [
  { key: 'tuition', label: 'Tuition' },
  { key: 'stationary', label: 'Stationary' },
  { key: 'exam', label: 'Exam fee' },
  { key: 'miscFund', label: 'Misc fund' },
]

// the latest month that has already started (or the first month if none has)
function defaultMonth(months) {
  const started = months.filter((m) => !m.isFuture)
  return (started.length ? started[started.length - 1] : months[0]).month
}

export default function ChargesPanel({ studentId, months, onSaved }) {
  const [month, setMonth] = useState(() => defaultMonth(months))
  const [draft, setDraft] = useState({}) // only the boxes you have typed in
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const row = months.find((m) => m.month === month) || months[0]
  const valueOf = (key) => (draft[key] !== undefined ? draft[key] : String(row[key]))

  function changeMonth(next) {
    setMonth(next)
    setDraft({})
    setError('')
  }

  async function save(event) {
    event.preventDefault()
    setError('')
    const changes = {}
    for (const { key, label } of FIELDS) {
      if (draft[key] === undefined) continue
      const n = Number(draft[key])
      if (draft[key].trim() === '' || !Number.isInteger(n) || n < 0) {
        setError(`${label} must be a whole number, 0 or more`)
        return
      }
      if (n !== row[key]) changes[key] = n
    }
    if (Object.keys(changes).length === 0) {
      setError('Nothing changed')
      return
    }
    setBusy(true)
    try {
      await api('/charges/month', { method: 'PUT', body: { studentId: Number(studentId), month, ...changes } })
      setDraft({})
      onSaved(`Saved the charges for ${monthLabel(month)}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h3>Charges for a month</h3>
      <form className="card pay-form" onSubmit={save}>
        <div>
          <label htmlFor="ch-month">Charge month</label>
          <select id="ch-month" value={month} onChange={(e) => changeMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>
            ))}
          </select>
        </div>
        {FIELDS.map(({ key, label }) => (
          <div key={key}>
            <label htmlFor={`ch-${key}`}>{label}</label>
            <input
              id={`ch-${key}`}
              inputMode="numeric"
              value={valueOf(key)}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
          </div>
        ))}
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save charges'}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  )
}