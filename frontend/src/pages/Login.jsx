import { useState } from 'react'
import { api, saveToken } from '../api'

export default function Login({ onLoggedIn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await api('/auth/login', { method: 'POST', body: { username, password } })
      saveToken(data.token)
      onLoggedIn()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={handleSubmit}>
        <img className="login-logo" src="/logo.jpg" alt="" />
        <h1>Al Hira Public School</h1>
        <p className="muted">Fee Management - Admin login</p>

        <label htmlFor="username">Username</label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {error && <p className="error" role="alert">{error}</p>}

        <button type="submit" disabled={busy || !username || !password}>
          {busy ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </div>
  )
}