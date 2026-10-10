import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { downloadCsv, toCsv } from '../csv'
import { money, monthLabel, today } from '../format'

const COLUMNS = [
  { label: 'Date', value: (p) => p.paidOn },
  { label: 'Class', value: (p) => p.class },
  { label: 'Roll', value: (p) => p.rollNumber },
  { label: 'Name', value: (p) => p.name },
  { label: 'For month', value: (p) => monthLabel(p.month) },
  { label: 'Amount', value: (p) => p.amount },
  { label: 'Received by', value: (p) => p.receivedBy },
]

export default function ReceivedReport() {
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [counted, setCounted] = useState('')

  const rangeProblem = !from || !to ? 'Choose both dates' : from > to ? 'The first date must not be after the second' : ''

  useEffect(() => {
    api('/settings')
      .then((s) => setSchoolName((s && s.schoolName) || ''))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (rangeProblem) return undefined
    let cancelled = false
    async function load() {
      try {
        const result = await api(`/reports/collections?from=${from}&to=${to}`)
        if (cancelled) return
        setData(result)
        setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [from, to, rangeProblem])

  function thisMonth() {
    const now = today()
    setFrom(now.slice(0, 8) + '01')
    setTo(now)
  }

  // the answer on screen belongs to the dates in the boxes
  const shown = data && !rangeProblem && data.from === from && data.to === to ? data : null
  const loading = !rangeProblem && !error && !shown
  const title = from === to ? `Daily closing, ${from}` : `Payments received, ${from} to ${to}`

  // totals per class, worked out from the payments on screen
  const byClass = useMemo(() => {
    if (!shown) return []
    const map = new Map()
    for (const p of shown.payments) {
      const row = map.get(p.class) || { name: p.class, count: 0, total: 0 }
      row.count += 1
      row.total += p.amount
      map.set(p.class, row)
    }
    return [...map.values()]
  }, [shown])

  const countedNumber = counted === '' ? null : Number(counted)
  const countedOk = countedNumber !== null && Number.isFinite(countedNumber) && countedNumber >= 0
  const difference = shown && countedOk ? countedNumber - shown.total : null
  const differenceText =
    difference === null
      ? ''
      : difference === 0
        ? 'Matches exactly'
        : difference < 0
          ? `Short by ${money(-difference)}`
          : `Extra ${money(difference)}`

  return (
    <>
      <div className="print-only">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img className="challan-logo" src="/logo.jpg" alt="" />
          <strong style={{ fontSize: 18 }}>{schoolName}</strong>
        </div>
        <h2>{title}</h2>
        <p>Printed on {today()}</p>
      </div>

      <div className="card pay-form no-print">
        <div>
          <label htmlFor="r-from">From</label>
          <input id="r-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="r-to">To</label>
          <input id="r-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button type="button" className="secondary" onClick={() => { setFrom(today()); setTo(today()) }}>Today</button>
        <button type="button" className="secondary" onClick={thisMonth}>This month</button>
      </div>

      {rangeProblem && <p className="error" role="alert">{rangeProblem}</p>}
      {!rangeProblem && error && <p className="error" role="alert">{error}</p>}
      {!rangeProblem && loading && <p className="muted">Loading...</p>}

      {shown && !error && (
        <>
          <div className="report-actions no-print">
            <button onClick={() => window.print()}>Print</button>
            <button
              className="secondary"
              onClick={() => downloadCsv(`payments-${from}-to-${to}.csv`, toCsv(COLUMNS, shown.payments))}
            >
              Download spreadsheet
            </button>
          </div>

          <div className="cards">
            <div className="card stat"><span className="muted">Total received</span><strong>{money(shown.total)}</strong></div>
            <div className="card stat"><span className="muted">Payments</span><strong>{shown.count}</strong></div>
          </div>

          <section>
            <h3>Cash check</h3>
            <p className="muted no-print">
              Count the money in the drawer and type it here. This assumes every payment was received as cash.
            </p>
            <div className="filters">
              <label>
                Cash counted
                <input
                  className="no-print"
                  type="number"
                  min="0"
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                />
              </label>
            </div>
            <p>
              Expected: <strong>{money(shown.total)}</strong>
              {countedOk && (
                <>
                  {' '}| Counted: <strong>{money(countedNumber)}</strong> | <strong>{differenceText}</strong>
                </>
              )}
            </p>
          </section>

          {shown.byReceiver.length > 0 && (
            <>
              <h3>By person</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Received by</th><th>Payments</th><th>Total</th></tr></thead>
                  <tbody>
                    {shown.byReceiver.map((r) => (
                      <tr key={r.receivedBy}>
                        <td>{r.receivedBy}</td>
                        <td>{r.count}</td>
                        <td>{money(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {byClass.length > 0 && (
            <>
              <h3>By class</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Class</th><th>Payments</th><th>Total</th></tr></thead>
                  <tbody>
                    {byClass.map((c) => (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td>{c.count}</td>
                        <td>{money(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h3>All payments</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Class</th><th>Roll</th><th>Name</th><th>For month</th><th>Amount</th><th>Received by</th></tr>
              </thead>
              <tbody>
                {shown.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.paidOn}</td>
                    <td>{p.class}</td>
                    <td>{p.rollNumber}</td>
                    <td><Link to={`/students/${p.studentId}`}>{p.name}</Link></td>
                    <td>{monthLabel(p.month)}</td>
                    <td>{money(p.amount)}</td>
                    <td>{p.receivedBy || '-'}</td>
                  </tr>
                ))}
                {shown.payments.length === 0 && (
                  <tr><td colSpan="7" className="muted">No payments in these dates.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="muted">One-time charges (like an admission fee) are not in this report.</p>

          <div className="print-only" style={{ marginTop: 48 }}>
            <span style={{ display: 'inline-block', width: '50%' }}>Prepared by: ______________</span>
            <span style={{ display: 'inline-block', width: '50%' }}>Checked by: ______________</span>
          </div>
        </>
      )}
    </>
  )
}