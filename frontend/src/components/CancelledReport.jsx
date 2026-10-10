import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { money, monthLabel, today } from '../format'

export default function CancelledReport() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api('/payments/cancelled')
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) return <p className="error" role="alert">{error}</p>
  if (!data) return <p className="muted">Loading...</p>

  return (
    <>
      <div className="print-only">
        <h2>Cancelled payments</h2>
        <p>Printed on {today()}</p>
      </div>

      <div className="report-actions no-print">
        <button onClick={() => window.print()}>Print</button>
      </div>

      <p className="muted">
        {data.count} cancelled payments, {money(data.total)} in total. Newest first (the last 300 are shown).
        A payment that is cancelled here is removed from the student&apos;s fees, and this list keeps the record.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Cancelled on</th>
              <th>Student</th>
              <th>Class</th>
              <th>Roll</th>
              <th>For month</th>
              <th>Amount</th>
              <th>Paid on</th>
              <th>Received by</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {data.payments.map((p) => (
              <tr key={p.id}>
                <td>{p.cancelledAt}</td>
                <td>{p.studentId ? <Link to={`/students/${p.studentId}`}>{p.name}</Link> : p.name}</td>
                <td>{p.class || '-'}</td>
                <td>{p.rollNumber || '-'}</td>
                <td>{monthLabel(p.month)}</td>
                <td>{money(p.amount)}</td>
                <td>{p.paidOn || '-'}</td>
                <td>{p.receivedBy || '-'}</td>
                <td>{p.reason}</td>
              </tr>
            ))}
            {data.payments.length === 0 && (
              <tr><td colSpan="9" className="muted">No payment has been cancelled.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}