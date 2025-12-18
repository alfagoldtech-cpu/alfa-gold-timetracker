import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import ProjectsPage from './ProjectsPage'
import UsersPage from './UsersPage'
import './AdminDashboard.css'

export default function AdminDashboard() {
  const { authUser, signOut } = useAuth()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'projects' | 'users'>('projects')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleSignOut = async () => {
    try {
      await signOut()
      // Використовуємо тільки повне перезавантаження для гарантованого очищення стану
      window.location.href = '/login?logout=true'
    } catch (error) {
      console.error('Error signing out:', error)
      // Навіть якщо є помилка, перенаправляємо на сторінку входу
      window.location.href = '/login?logout=true'
    }
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
                className={`sidebar-nav-item ${activeTab === 'projects' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('projects')
                  setSidebarOpen(false)
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                  <line x1="12" y1="22.08" x2="12" y2="12"></line>
                </svg>
                <span>Проекти</span>
              </button>
              <button
                className={`sidebar-nav-item ${activeTab === 'users' ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab('users')
                  setSidebarOpen(false)
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <span>Користувачі</span>
              </button>
            </nav>
          </div>
        </>
      )}

      <div className="admin-dashboard-content">
        <div className="tab-content">
          {activeTab === 'projects' && <ProjectsPage />}
          {activeTab === 'users' && <UsersPage />}
        </div>
      </div>
    </div>
  )
}

