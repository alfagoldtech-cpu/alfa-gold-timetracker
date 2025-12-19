import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Link, useSearchParams } from 'react-router-dom'
import { getRoleById } from '../lib/users'
import EmployeesPage from './EmployeesPage'
import ClientsPage from './ClientsPage'
import CalendarPage from './CalendarPage'
import TaskCalendarPage from './TaskCalendarPage'
import MyCalendarPage from './MyCalendarPage'
import './ManagerDashboard.css'
import './AdminDashboard.css'

export default function ManagerDashboard() {
  const { user, authUser, signOut } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isTeamLead, setIsTeamLead] = useState(false)
  
  // Отримуємо активний таб з URL або sessionStorage
  const getInitialTab = (): 'employees' | 'clients' | 'calendar' | 'task-calendar' | 'my-calendar' => {
    const tabFromUrl = searchParams.get('tab') as 'employees' | 'clients' | 'calendar' | 'task-calendar' | 'my-calendar' | null
    if (tabFromUrl && ['employees', 'clients', 'calendar', 'task-calendar', 'my-calendar'].includes(tabFromUrl)) {
      return tabFromUrl
    }
    const tabFromStorage = sessionStorage.getItem('managerDashboardTab') as 'employees' | 'clients' | 'calendar' | 'task-calendar' | 'my-calendar' | null
    if (tabFromStorage && ['employees', 'clients', 'calendar', 'task-calendar', 'my-calendar'].includes(tabFromStorage)) {
      return tabFromStorage
    }
    return 'employees'
  }
  
  const [activeTab, setActiveTab] = useState<'employees' | 'clients' | 'calendar' | 'task-calendar' | 'my-calendar'>(getInitialTab)
  
  // Оновлюємо URL та sessionStorage при зміні таба
  const handleTabChange = (tab: 'employees' | 'clients' | 'calendar' | 'task-calendar' | 'my-calendar') => {
    setActiveTab(tab)
    setSearchParams({ tab })
    sessionStorage.setItem('managerDashboardTab', tab)
  }

  // Відновлюємо таб з URL при завантаженні сторінки
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') as 'employees' | 'clients' | 'calendar' | 'task-calendar' | 'my-calendar' | null
    if (tabFromUrl && ['employees', 'clients', 'calendar', 'task-calendar', 'my-calendar'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl)
      sessionStorage.setItem('managerDashboardTab', tabFromUrl)
    }
  }, [searchParams])

  useEffect(() => {
    if (user?.role_id) {
      const checkUserRole = async () => {
        try {
          const role = await getRoleById(user.role_id)
          if (role) {
            setIsTeamLead(role.role_name === 'Тім лід')
          }
        } catch (error) {
          console.error('Error checking user role:', error)
          setIsTeamLead(false)
        }
      }
      checkUserRole()
    }
  }, [user?.role_id])

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
                className={`sidebar-nav-item ${activeTab === 'employees' ? 'active' : ''}`}
                onClick={() => {
                  handleTabChange('employees')
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
              <button
                className={`sidebar-nav-item ${activeTab === 'clients' ? 'active' : ''}`}
                onClick={() => {
                  handleTabChange('clients')
                  setSidebarOpen(false)
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="8.5" cy="7" r="4"></circle>
                  <path d="M20 8v6"></path>
                  <path d="M23 11h-6"></path>
                </svg>
                <span>Клієнти</span>
              </button>
              <button
                className={`sidebar-nav-item ${activeTab === 'calendar' ? 'active' : ''}`}
                onClick={() => {
                  handleTabChange('calendar')
                  setSidebarOpen(false)
                }}
                style={{ display: isTeamLead ? 'none' : 'flex' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                </svg>
                <span>Календар</span>
              </button>
              {isTeamLead && (
                <>
                  <button
                    className={`sidebar-nav-item ${activeTab === 'calendar' ? 'active' : ''}`}
                    onClick={() => {
                      handleTabChange('calendar')
                      setSidebarOpen(false)
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    <span>Планові задачі</span>
                  </button>
                  <button
                    className={`sidebar-nav-item ${activeTab === 'task-calendar' ? 'active' : ''}`}
                    onClick={() => {
                      handleTabChange('task-calendar')
                      setSidebarOpen(false)
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"></path>
                    </svg>
                    <span>Календар задач</span>
                  </button>
                </>
              )}
              <button
                className={`sidebar-nav-item ${activeTab === 'my-calendar' ? 'active' : ''}`}
                onClick={() => {
                  handleTabChange('my-calendar')
                  setSidebarOpen(false)
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="16" y1="2" x2="16" y2="6"></line>
                  <line x1="8" y1="2" x2="8" y2="6"></line>
                  <line x1="3" y1="10" x2="21" y2="10"></line>
                  <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"></path>
                </svg>
                <span>Мій календар</span>
              </button>
            </nav>
          </div>
        </>
      )}

      <div className="admin-dashboard-content">
        <div className="tab-content">
          {activeTab === 'employees' && <EmployeesPage />}
          {activeTab === 'clients' && <ClientsPage />}
          {activeTab === 'calendar' && <CalendarPage />}
          {activeTab === 'task-calendar' && isTeamLead && <TaskCalendarPage />}
          {activeTab === 'my-calendar' && <MyCalendarPage />}
        </div>
      </div>
    </div>
  )
}

