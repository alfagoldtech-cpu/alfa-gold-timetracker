import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import EmployeesPage from './EmployeesPage'
import './ManagerDashboard.css'
import './AdminDashboard.css'

export default function ManagerDashboard() {
  const { user, authUser, signOut } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'employees'>('employees')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/login')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const getFullName = () => {
    if (!user) return ''
    const parts = [user.surname, user.name, user.middle_name].filter(Boolean)
    return parts.join(' ') || 'Користувач'
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-dashboard-header">
        <div className="header-left">
          <button 
            className="menu-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Відкрити меню"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          <h1>AlfaGold Time Tracker</h1>
          <span className="user-email">{authUser?.email}</span>
        </div>
        <div className="header-right">
          <Link
            to="/change-password"
            className="btn-link"
          >
            Змінити пароль
          </Link>
          <button
            onClick={handleSignOut}
            className="btn-logout"
          >
            Вийти
          </button>
        </div>
      </header>

      {/* Sidebar Navigation */}
      {sidebarOpen && (
        <>
          <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}></div>
          <div className="sidebar-nav">
            <div className="sidebar-nav-header">
              <h2>Меню</h2>
              <button 
                className="sidebar-close"
                onClick={() => setSidebarOpen(false)}
                aria-label="Закрити меню"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <nav className="sidebar-nav-menu">
              <button
                className={`sidebar-nav-item ${activeTab === 'employees' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('employees')
                  setSidebarOpen(false)
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <span>Співробітники</span>
              </button>
            </nav>
          </div>
        </>
      )}

      <div className="admin-dashboard-content">
        <div className="tab-content">
          {activeTab === 'employees' && <EmployeesPage />}
        </div>
      </div>
    </div>
  )
}

