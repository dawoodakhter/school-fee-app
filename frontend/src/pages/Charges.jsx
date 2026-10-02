import { useEffect, useState } from 'react'
import { api } from '../api'
import { money, monthLabel, today } from '../format'

const FIELD_NAMES = { exam: 'exam fee', stationary: 'stationary charge', miscFund: 'misc fund' }

export default function Charges() {
  const [classes, setClasses] = useState([])
  const [months, setMonths] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [month, setMonth] = useState('')
  const [classId, setClassId] = useState('') // empty means all classes
  const [field, setField] = useState('exam')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [c, s] = await Promise.all([api('/classes'), api('/settings')])
        if (cancelled) return
        setClasses(c.classes)
        setMonths(s.months)
        const thisMonth = today().slice(0, 7)
        setMonth(s.months.includes(thisMonth) ? thisMonth : s.months[0])
      } catch (err) {
        if (!cancelled) setLoadError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function apply(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    const n = Number(amount)
    if (amount.trim() === '' || !Number.isInteger(n) || n < 0) {
      setError('Amount must be a whole number, 0 or more')
      return
    }
    const chosen = classes.find((c) => String(c.id) === classId)
    const count = chosen ? chosen.studentCount : classes.reduce((t, c) => t + c.studentCount, 0)
    const where = chosen ? chosen.name : 'all classes'
    const what = FIELD_NAMES[field]
    const question =
      n === 0
        ? `Clear the ${what} for ${count} students (${where}) in ${monthLabel(month)}?`
        : `Set the ${what} to ${money(n)} for ${count} students (${where}) in ${monthLabel(month)}? ` +
          `This replaces any ${what} already entered for that month.`
    if (!window.confirm(question)) return

    setBusy(true)
    try {
      const body = { month, field, amount: n }
      if (classId) body.classId = Number(classId)
      const data = await api('/charges/bulk', { method: 'POST', body })
      setMessage(`Done: ${data.updated} students updated (${what} ${money(n)}, ${monthLabel(month)}, ${where})`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <main className="page"><p className="muted">Loading...</p></main>
  if (loadError) return <main className="page"><p className="error" role="alert">{loadError}</p></main>

  return (
    <main className="page">
      <h2>Charges for a whole class</h2>
      <p className="muted">
        Use this for charges everyone pays, like an exam fee. It sets the amount for every student who is still at the
        school. For one student, open the student and use "Charges for a month".
      </p>

      <form className="card pay-form" onSubmit={apply}>
        <div>
          <label htmlFor="b-month">Month</label>
          <select id="b-month" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="b-class">Class</label>
          <select id="b-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="b-field">Charge</label>
          <select id="b-field" value={field} onChange={(e) => setField(e.target.value)}>
            <option value="exam">Exam fee</option>
            <option value="stationary">Stationary</option>
            <option value="miscFund">Misc fund</option>
          </select>
        </div>
        <div>
          <label htmlFor="b-amount">Amount (PKR)</label>
          <input id="b-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button type="submit" disabled={busy || amount.trim() === ''}>{busy ? 'Saving...' : 'Apply'}</button>
      </form>
      <p className="muted">Enter 0 to clear a charge.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
    </main>
  )
}