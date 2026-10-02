import { useEffect, useState } from 'react'
import { api } from '../api'
import { money } from '../format'

export default function OneTimePanel({ studentId, onChanged }) {
  const [charges, setCharges] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [payAmounts, setPayAmounts] = useState({}) // what you typed for each charge

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await api(`/charges/one-time?studentId=${studentId}`)
        if (!cancelled) setCharges(data.charges)
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
  }, [studentId, version])

  function changed() {
    setVersion((v) => v + 1)
    onChanged()
  }

  async function addCharge(event) {
    event.preventDefault()
    setError('')
    const n = Number(amount)
    if (!name.trim()) return setError('Give the charge a name, for example Admission fee')
    if (!Number.isInteger(n) || n <= 0) return setError('Amount must be a whole number above 0')
    try {
      await api('/charges/one-time', { method: 'POST', body: { studentId: Number(studentId), name: name.trim(), amount: n } })
      setName('')
      setAmount('')
      changed()
    } catch (err) {
      setError(err.message)
    }
  }

  async function receive(charge) {
    setError('')
    const left = charge.amount - charge.paidAmount
    const text = payAmounts[charge.id] !== undefined ? payAmounts[charge.id] : String(left)
    const n = Number(text)
    if (!Number.isInteger(n) || n <= 0) return setError('Amount must be a whole number above 0')
    try {
      await api(`/charges/one-time/${charge.id}/pay`, { method: 'POST', body: { amount: n } })
      setPayAmounts((old) => {
        const next = { ...old }
        delete next[charge.id]
        return next
      })
      changed()
    } catch (err) {
      setError(err.message)
    }
  }

  async function remove(charge) {
    if (!window.confirm(`Remove the charge "${charge.name}" of ${money(charge.amount)}?`)) return
    setError('')
    try {
      await api(`/charges/one-time/${charge.id}`, { method: 'DELETE' })
      changed()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <h3>One-time charges</h3>
      {loading ? (
        <p className="muted">Loading...</p>
      ) : charges.length === 0 ? (
        <p className="muted">No one-time charges.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Charge</th><th>Amount</th><th>Paid</th><th>Remaining</th><th>Receive payment</th><th></th></tr>
            </thead>
            <tbody>
              {charges.map((c) => {
                const left = c.amount - c.paidAmount
                return (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{money(c.amount)}</td>
                    <td>{money(c.paidAmount)}</td>
                    <td>{money(left)}</td>
                    <td>
                      {left > 0 ? (
                        <span className="inline-pay">
                          <input
                            aria-label={`Amount for ${c.name}`}
                            inputMode="numeric"
                            value={payAmounts[c.id] !== undefined ? payAmounts[c.id] : String(left)}
                            onChange={(e) => setPayAmounts({ ...payAmounts, [c.id]: e.target.value })}
                          />
                          <button className="small" onClick={() => receive(c)}>Receive</button>
                        </span>
                      ) : (
                        <span className="muted">Fully paid</span>
                      )}
                    </td>
                    <td><button className="danger small" onClick={() => remove(c)}>Remove</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <form className="card pay-form" onSubmit={addCharge}>
        <div>
          <label htmlFor="ot-name">New charge</label>
          <input id="ot-name" placeholder="for example Admission fee" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ot-amount">Charge amount (PKR)</label>
          <input id="ot-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button type="submit">Add charge</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  )
}