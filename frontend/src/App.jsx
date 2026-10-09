import { useEffect, useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { getToken, clearToken } from './api'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Students from './pages/Students'
import StudentPage from './pages/StudentPage'
import StudentForm from './pages/StudentForm'
import ImportStudents from './pages/ImportStudents'
import Charges from './pages/Charges'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Receipt from './pages/Receipt'

function NotFound() {
  return (
    <main className="page">
      <h2>Page not found</h2>
      <p><Link to="/">Back to the dashboard</Link></p>
    </main>
  )
}

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

  return (
    <Routes>
      <Route element={<Layout onLogout={logout} />}>
        <Route index element={<Dashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="students/new" element={<StudentForm />} />
        <Route path="students/import" element={<ImportStudents />} />
        <Route path="students/:id" element={<StudentPage />} />
        <Route path="students/:id/edit" element={<StudentForm />} />
        <Route path="charges" element={<Charges />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="receipts/:id" element={<Receipt />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}