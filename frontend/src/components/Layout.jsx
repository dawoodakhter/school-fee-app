import { NavLink, Outlet } from 'react-router-dom'

export default function Layout({ onLogout }) {
  return (
    <div>
      <header className="topbar no-print">
        <div className="brand">
          <strong>School Fee Manager</strong>
          <nav>
            <NavLink to="/" end>Dashboard</NavLink>
            <NavLink to="/students">Students</NavLink>
            <NavLink to="/charges">Charges</NavLink>
            <NavLink to="/reports">Reports</NavLink>
          </nav>
        </div>
        <button className="secondary" onClick={onLogout}>Log out</button>
      </header>
      <Outlet />
    </div>
  )
}