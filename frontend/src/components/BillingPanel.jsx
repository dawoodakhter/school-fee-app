import { useEffect, useState } from 'react'
import { api } from '../api'
import { monthLabel, monthsBetween } from '../format'

export default function BillingPanel() {
  const [current, setCurrent] = useState(null)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const s = await api('/settings')
        if (cancelled) return
        setCurrent(s)
        setStart(s.start)
        setEnd(s.end)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [version])

  async function extend(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!start || !end) return setError('Choose both months')
    if (start > current.start || end < current.end) {
      return setError('You can only make the billing period longer, not shorter')
    }
    const newMonths = monthsBetween(start, end).length - current.months.length
    if (newMonths === 0) return setError('Nothing changed')
    let question =
      `Make the billing period run from ${monthLabel(start)} to ${monthLabel(end)}?\n\n` +
      `Every student gets ${newMonths} new fee ${newMonths === 1 ? 'month' : 'months'}.`
    if (start < current.start) {
      question += `\n\nWARNING: the months before ${monthLabel(current.start)} will count as OWED by every student. This cannot be undone.`
    } else {
      question += ' This cannot be undone.'
    }
    if (!window.confirm(question)) return

    setBusy(true)
    try {
      const data = await api('/settings/billing-period', { method: 'PUT', body: { start, end } })
      setMessage(`Done. The billing period is now ${monthLabel(data.start)} to ${monthLabel(data.end)}. ${data.rowsAdded} fee months were added.`)
      setVersion((v) => v + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3>Billing period</h3>
      {current && (
        <form className="card pay-form" onSubmit={extend}>
          <p className="form-wide" data-testid="billing-now">
            Now: {monthLabel(current.start)} to {monthLabel(current.end)} ({current.months.length} months)
          </p>
          <div>
            <label htmlFor="bp-start">First month</label>
            <input id="bp-start" type="month" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label htmlFor="bp-end">Last month</label>
            <input id="bp-end" type="month" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Make it longer'}</button>
          <p className="muted form-wide">
            You can make the period longer at either end, but not shorter. Moving the last month later is the usual use
            (for example to June). Moving the first month earlier makes those months count as owed by every student.
          </p>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
    </section>
  )
}