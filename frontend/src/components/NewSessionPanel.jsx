import { useEffect, useState } from 'react'
import { api } from '../api'
import { money, monthLabel } from '../format'

// month text helper: '2027-03' -> '2027-04'
function plusMonths(m, n) {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function NewSessionPanel() {
  const [oldEnd, setOldEnd] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [plan, setPlan] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [backedUp, setBackedUp] = useState(false)
  const [typed, setTyped] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    api('/settings')
      .then((s) => {
        setOldEnd(s.end)
        setStart(plusMonths(s.end, 1))
        setEnd(plusMonths(s.end, 12))
      })
      .catch((err) => setError(err.message))
  }, [])

  function changeDates(setter, value) {
    setter(value)
    setPlan(null)
    setError('')
  }

  async function showPreview() {
    setError('')
    setBusy(true)
    try {
      setPlan(await api(`/new-session/preview?start=${start}&end=${end}`))
    } catch (err) {
      setPlan(null)
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function startSession() {
    setError('')
    setBusy(true)
    try {
      setResult(await api('/new-session', { method: 'POST', body: { start, end, confirm: typed } }))
      setPlan(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <section>
        <h3>New session started</h3>
        <p>
          Billing period is now {monthLabel(result.start)} to {monthLabel(result.end)}.
          {' '}{result.promoted} students moved up, {result.passedOut} passed out,
          {' '}{money(result.carriedTotal)} carried forward for {result.carriedStudents} students.
        </p>
        <p className="muted">
          Next: go to the Classes section and set the new fees for the new year, then reload this page.
        </p>
      </section>
    )
  }

  const ready = backedUp && typed === 'START NEW SESSION' && plan && plan.clashes.length === 0

  return (
    <section>
      <h3>Start a new school session</h3>
      <p className="muted">
        Moves every student up one class, carries unpaid fees forward, and sets the new billing period.
        {oldEnd && ` The current period ends in ${monthLabel(oldEnd)}.`}
      </p>

      <div className="filters">
        <label>
          First month
          <input type="month" value={start} onChange={(e) => changeDates(setStart, e.target.value)} />
        </label>
        <label>
          Last month
          <input type="month" value={end} onChange={(e) => changeDates(setEnd, e.target.value)} />
        </label>
        <button type="button" className="secondary" disabled={busy || !start || !end} onClick={showPreview}>
          Show what will happen
        </button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      {plan && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>From class</th><th>Moves to</th><th>Students</th></tr>
              </thead>
              <tbody>
                {plan.moves.map((m) => (
                  <tr key={m.from}>
                    <td>{m.from}</td>
                    <td>{m.to}</td>
                    <td>{m.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Unpaid fees carried forward: <strong>{money(plan.carryTotal)}</strong> for {plan.carryCount} students.
          </p>
          {plan.carryTop.length > 0 && (
            <p className="muted">
              Largest: {plan.carryTop.map((c) => `${c.name} (${money(c.amount)})`).join(', ')}
            </p>
          )}
          {plan.clashes.length > 0 && (
            <div className="error" role="alert">
              <p>Fix these first. Nothing can be changed until they are gone:</p>
              <ul>{plan.clashes.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          )}

          <label className="check">
            <input type="checkbox" checked={backedUp} onChange={(e) => setBackedUp(e.target.checked)} />
            I made a backup just now (Backup section above)
          </label>
          <div>
            <label>
              Type START NEW SESSION to confirm
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </label>
          </div>
          <button type="button" disabled={!ready || busy} onClick={startSession}>
            Start new session
          </button>
        </>
      )}
    </section>
  )
}