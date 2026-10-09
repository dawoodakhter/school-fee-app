import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { api } from '../api'

export default function Layout({ onLogout }) {
  const [schoolName, setSchoolName] = useState('Al Hira Public School')

  useEffect(() => {
    api('/settings')
      .then((s) => {
        if (s && s.schoolName) setSchoolName(s.schoolName)
      })
      .catch(() => {})
  }, [])

  return (
    <div>
      <header className="topbar no-print">
        <div className="brand">
          <img className="logo" src="/logo.jpg" alt="" />
          <strong>{schoolName}</strong>
          <nav>
            <NavLink to="/" end>Dashboard</NavLink>
            <NavLink to="/students">Students</NavLink>
            <NavLink to="/charges">Charges</NavLink>
            <NavLink to="/reports">Reports</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </nav>
        </div>
        <button className="secondary" onClick={onLogout}>Log out</button>
      </header>
      <Outlet />
    </div>
  )
}