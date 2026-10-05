import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { money, monthLabel, today } from '../format'
import Badge from '../components/Badge'
import ChargesPanel from '../components/ChargesPanel'
import OneTimePanel from '../components/OneTimePanel'

const dash = (n) => (n ? money(n) : '-')

// The month a payment most likely belongs to: the first month that has started and is not fully paid.
function suggestPayment(months) {
  const open = months.find((m) => !m.isFuture && (m.status === 'pending' || m.status === 'partial'))
  const chosen = open || months.find((m) => m.isFuture) || months[months.length - 1]
  if (!chosen) return { month: '', amount: '' }
  const owed = Math.max(0, chosen.due - chosen.paid)
  return { month: chosen.month, amount: owed > 0 ? String(owed) : '' }
}

// The key makes the page start fresh when you open a different student.
export default function StudentPage() {
  const { id } = useParams()
  return <StudentView key={id} id={id} />
}

function StudentView({ id }) {
  const navigate = useNavigate()
  const [student, setStudent] = useState(null)
  const [fees, setFees] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    month: '',
    amount: '',
    receivedBy: localStorage.getItem('fee_received_by') || '',
    paidOn: today(),
  })
  const [formError, setFormError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastPaymentId, setLastPaymentId] = useState(null)

  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((k) => k + 1)

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const [s, f, p] = await Promise.all([
          api(`/students/${id}`),
          api(`/students/${id}/summary`),
          api(`/payments?studentId=${id}`),
        ])
        if (cancelled) return
        setStudent(s)
        setFees(f.fees)
        setPayments(p.payments)
        const next = suggestPayment(f.fees.months)
        setForm((old) => ({ ...old, month: next.month, amount: next.amount }))
        setError('')
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [id, reloadKey])

  function changeMonth(month) {
    const row = fees.months.find((m) => m.month === month)
    const owed = row ? Math.max(0, row.due - row.paid) : 0
    setForm((old) => ({ ...old, month, amount: owed > 0 ? String(owed) : '' }))
  }

  async function savePayment(event) {
    event.preventDefault()
    setFormError('')
    setMessage('')
    const amount = Number(form.amount)
    if (!Number.isInteger(amount) || amount <= 0) {
      setFormError('Enter the amount as a whole number above 0')
      return
    }
    setBusy(true)
    try {
      const created = await api('/payments', {
        method: 'POST',
        body: {
          studentId: Number(id),
          month: form.month,
          amount,
          receivedBy: form.receivedBy,
          paidOn: form.paidOn,
        },
      })
      localStorage.setItem('fee_received_by', form.receivedBy)
      setLastPaymentId(created.id)
      setMessage(`Saved: ${money(amount)} for ${monthLabel(form.month)}`)
      reload()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function removePayment(payment) {
    const ok = window.confirm(`Delete this payment of ${money(payment.amount)} for ${monthLabel(payment.month)}?`)
    if (!ok) return
    setFormError('')
    setMessage('')
    try {
      await api(`/payments/${payment.id}`, { method: 'DELETE' })
      setMessage('Payment deleted')
      setLastPaymentId(null)
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  async function markAsLeft() {
    const ok = window.confirm(`Mark ${student.name} as left the school? Their payment history is kept.`)
    if (!ok) return
    setFormError('')
    setMessage('')
    try {
      await api(`/students/${id}`, { method: 'DELETE' })
      navigate('/students')
    } catch (err) {
      setFormError(err.message)
    }
  }

  async function restore() {
    setFormError('')
    setMessage('')
    try {
      await api(`/students/${id}`, { method: 'PUT', body: { isActive: true } })
      setMessage('Student is back in the school list')
      reload()
    } catch (err) {
      setFormError(err.message)
    }
  }

  if (loading) return <main className="page"><p className="muted">Loading...</p></main>

  if (error || !student || !fees) {
    return (
      <main className="page">
        <p className="error" role="alert">{error || 'Student not found'}</p>
        <p><Link to="/students">Back to all students</Link></p>
      </main>
    )
  }

  return (
    <main className="page">
      <p><Link to="/students">&larr; All students</Link></p>

      <div className="title-row">
        <h2>{student.name}</h2>
        <Badge status={fees.status} />
        <div className="title-actions">
          <Link to={`/students/${id}/edit`} className="button secondary">Edit</Link>
          {student.isActive ? (
            <button className="danger" onClick={markAsLeft}>Mark as left</button>
          ) : (
            <button onClick={restore}>Restore student</button>
          )}
        </div>
      </div>
      {!student.isActive && (
        <p className="left-note" role="status">This student has left the school.</p>
      )}
      <p className="muted">
        {student.class} &middot; Roll {student.rollNumber}
        {student.section ? ` · Section ${student.section}` : ''}
        {student.guardianName ? ` · Guardian: ${student.guardianName}` : ''}
        {student.contactNumber ? ` · ${student.contactNumber}` : ''}
      </p>
      <p className="muted">
        Monthly fee: {money(student.customFee || student.classFee)}
        {student.customFee ? ' (custom fee)' : ''}
        {student.concession ? ` · Concession: ${money(student.concession)} a month` : ''}
      </p>

      <div className="cards">
        <div className="card stat"><span className="muted">Due so far</span><strong>{money(fees.totalDue)}</strong></div>
        <div className="card stat"><span className="muted">Paid</span><strong>{money(fees.totalPaid)}</strong></div>
        <div className="card stat"><span className="muted">Remaining</span><strong>{money(fees.remaining)}</strong></div>
        <div className="card stat"><span className="muted">Whole year</span><strong>{money(fees.fullYearDue)}</strong></div>
      </div>

      {student.isActive && <h3>Record a payment</h3>}
      {student.isActive && (
      <form className="card pay-form" onSubmit={savePayment}>
        <div>
          <label htmlFor="pay-month">Month</label>
          <select id="pay-month" value={form.month} onChange={(e) => changeMonth(e.target.value)}>
            {fees.months.map((m) => (
              <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pay-amount">Amount (PKR)</label>
          <input
            id="pay-amount"
            inputMode="numeric"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="pay-date">Date</label>
          <input
            id="pay-date"
            type="date"
            value={form.paidOn}
            onChange={(e) => setForm({ ...form, paidOn: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="pay-by">Received by</label>
          <input
            id="pay-by"
            value={form.receivedBy}
            onChange={(e) => setForm({ ...form, receivedBy: e.target.value })}
          />
        </div>
        <button type="submit" disabled={busy || !form.amount}>{busy ? 'Saving...' : 'Save payment'}</button>
      </form>
      )}
      {formError && <p className="error" role="alert">{formError}</p>}
      {message && (
        <p className="success" role="status">
          {message}
          {lastPaymentId && (
            <>
              {' '}
              <Link to={`/receipts/${lastPaymentId}`}>Print receipt</Link>
            </>
          )}
        </p>
      )}

      {student.isActive && (
        <ChargesPanel
          studentId={id}
          months={fees.months}
          onSaved={(text) => {
            setFormError('')
            setMessage(text)
            reload()
          }}
        />
      )}
      {student.isActive && <OneTimePanel studentId={id} onChanged={reload} />}

      <h3>Fee card</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Tuition</th>
              <th>Stationary</th>
              <th>Exam</th>
              <th>Misc fund</th>
              <th>Due</th>
              <th>Arrears</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {fees.months.map((m) => (
              <tr key={m.month} className={m.isFuture ? 'row-future' : ''}>
                <td>{monthLabel(m.month)}</td>
                <td>{dash(m.tuition)}</td>
                <td>{dash(m.stationary)}</td>
                <td>{dash(m.exam)}</td>
                <td>{dash(m.miscFund)}</td>
                <td>{money(m.due)}</td>
                <td>{dash(m.arrearBefore)}</td>
                <td>{dash(m.paid)}</td>
                <td>{money(m.balance)}</td>
                <td><Badge status={m.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Payments received</h3>
      {payments.length === 0 ? (
        <p className="muted">No payments yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>For month</th><th>Amount</th><th>Received by</th><th></th></tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.paidOn}</td>
                  <td>{monthLabel(p.month)}</td>
                  <td>{money(p.amount)}</td>
                  <td>{p.receivedBy || '-'}</td>
                  <td>
                    <span className="inline-pay">
                      <Link to={`/receipts/${p.id}`} className="button secondary small">Receipt</Link>
                      <button className="danger small" onClick={() => removePayment(p)}>Delete</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}