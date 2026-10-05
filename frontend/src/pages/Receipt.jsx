import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { money, monthLabel, today } from '../format'
import { amountInWords } from '../words'

function ReceiptCopy({ data, label }) {
  const { receipt, student, school, balance } = data
  return (
    <div className="receipt">
      <div className="receipt-head">
        <div>
          {school.name && <h1>{school.name}</h1>}
          {school.address && <p>{school.address}</p>}
          {school.phone && <p>Phone: {school.phone}</p>}
        </div>
        <span className="receipt-copy">{label}</span>
      </div>

      <h2 className="receipt-title">FEE RECEIPT</h2>

      <div className="receipt-grid">
        <span>Receipt no.</span><strong>{receipt.number}</strong>
        <span>Date</span><strong>{receipt.paidOn}</strong>
        <span>Student</span><strong>{student.name}</strong>
        <span>Class and roll no.</span><strong>{student.class}, Roll {student.rollNumber}</strong>
        {student.guardianName && (<><span>Guardian</span><strong>{student.guardianName}</strong></>)}
        <span>Fee for</span><strong>{monthLabel(receipt.month)}</strong>
        <span>Received by</span><strong>{receipt.receivedBy || '-'}</strong>
      </div>

      <div className="receipt-amount">
        <div>
          <span>Amount received</span>
          <strong>{money(receipt.amount)}</strong>
        </div>
        <p>Rupees {amountInWords(receipt.amount)} only</p>
      </div>

      <div className="receipt-grid">
        <span>Total paid so far</span><strong>{money(balance.totalPaid)}</strong>
        <span>Balance remaining on {today()}</span><strong>{money(balance.remaining)}</strong>
      </div>

      <div className="receipt-sign">
        <span>Signature and stamp</span>
      </div>
    </div>
  )
}

export default function Receipt() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const result = await api(`/payments/${id}/receipt`)
        if (!cancelled) setData(result)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  if (error) {
    return (
      <main className="page">
        <p className="error" role="alert">{error}</p>
        <p><Link to="/students">Back to all students</Link></p>
      </main>
    )
  }
  if (!data) return <main className="page"><p className="muted">Loading...</p></main>

  return (
    <main className="page receipt-page">
      <div className="receipt-actions no-print">
        <Link to={`/students/${data.student.id}`} className="button secondary">&larr; Back to {data.student.name}</Link>
        <button onClick={() => window.print()}>Print receipt</button>
      </div>
      {!data.school.name && (
        <p className="muted no-print">
          Your school's name is not set, so it is missing from the receipt. <Link to="/settings">Add it in Settings</Link>.
        </p>
      )}
      <ReceiptCopy data={data} label="Parent copy" />
      <div className="cut-line"><span>cut here</span></div>
      <ReceiptCopy data={data} label="Office copy" />
    </main>
  )
}