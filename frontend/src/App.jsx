import { useEffect, useState } from 'react'
import { getToken, clearToken } from './api'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

export default function App() {
  const [loggedIn, setLoggedIn] = useState(Boolean(getToken()))

  // if the backend says our login has expired, show the login screen again
  useEffect(() => {
    const onExpired = () => setLoggedIn(false)
    window.addEventListener('auth-expired', onExpired)
    return () => window.removeEventListener('auth-expired', onExpired)
  }, [])

  function logout() {
    clearToken()
    setLoggedIn(false)
  }

  if (!loggedIn) return <Login onLoggedIn={() => setLoggedIn(true)} />
  return <Dashboard onLogout={logout} />
}