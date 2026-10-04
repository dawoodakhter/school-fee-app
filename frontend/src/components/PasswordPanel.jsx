import { useState } from 'react'
import { api } from '../api'

export default function PasswordPanel() {
  const [form, setForm] = useState({ current: '', next: '', again: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  async function save(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    if (form.next.length < 8) return setError('The new password must be at least 8 letters or numbers')
    if (form.next !== form.again) return setError('The two new passwords are not the same')
    setBusy(true)
    try {
      await api('/auth/change-password', {
        method: 'POST',
        body: { currentPassword: form.current, newPassword: form.next },
      })
      setMessage('Password changed. Use the new one next time you log in.')
      setForm({ current: '', next: '', again: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3>Change password</h3>
      <form className="card form-grid" onSubmit={save}>
        <div>
          <label htmlFor="pw-current">Current password</label>
          <input id="pw-current" type="password" autoComplete="current-password" value={form.current} onChange={set('current')} />
        </div>
        <div>
          <label htmlFor="pw-next">New password</label>
          <input id="pw-next" type="password" autoComplete="new-password" value={form.next} onChange={set('next')} />
        </div>
        <div>
          <label htmlFor="pw-again">New password again</label>
          <input id="pw-again" type="password" autoComplete="new-password" value={form.again} onChange={set('again')} />
        </div>
        <div className="form-wide">
          <button type="submit" disabled={busy || !form.current || !form.next}>{busy ? 'Saving...' : 'Change password'}</button>
        </div>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
    </section>
  )
}