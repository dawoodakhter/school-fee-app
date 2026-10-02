import { useEffect, useState } from 'react'
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

  const rangeProblem = !from || !to ? 'Choose both dates' : from > to ? 'The first date must not be after the second' : ''

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
  const title = `Payments received, ${from} to ${to}`

  return (
    <>
      <div className="print-only">
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
        </>
      )}
    </>
  )
}