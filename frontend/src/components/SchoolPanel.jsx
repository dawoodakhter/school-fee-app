import { useEffect, useState } from 'react'
import { api } from '../api'

export default function SchoolPanel() {
  const [form, setForm] = useState({ schoolName: '', schoolAddress: '', schoolPhone: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const s = await api('/settings')
        if (!cancelled) setForm({ schoolName: s.schoolName, schoolAddress: s.schoolAddress, schoolPhone: s.schoolPhone })
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
  }, [])

  async function save(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy(true)
    try {
      await api('/settings/school', { method: 'PUT', body: form })
      setMessage('School details saved')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  return (
    <section>
      <h3>School details</h3>
      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <form className="card form-grid" onSubmit={save}>
          <div>
            <label htmlFor="sc-name">School name</label>
            <input id="sc-name" value={form.schoolName} onChange={set('schoolName')} />
          </div>
          <div>
            <label htmlFor="sc-address">Address</label>
            <input id="sc-address" value={form.schoolAddress} onChange={set('schoolAddress')} />
          </div>
          <div>
            <label htmlFor="sc-phone">Phone</label>
            <input id="sc-phone" value={form.schoolPhone} onChange={set('schoolPhone')} />
          </div>
          <div className="form-wide">
            <p className="muted">These are printed at the top of fee receipts.</p>
            <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save school details'}</button>
          </div>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
    </section>
  )
}