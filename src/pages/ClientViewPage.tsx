import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getRoleById } from '../lib/users'
import { getClientWithRelations, updateClientStatus } from '../lib/clients'
import type { ClientWithRelations } from '../types/database'
import { formatDate, formatCurrency } from '../utils/date'
import { getStatusBadgeClass, getStatusText } from '../utils/status'
import TaskPlayer from '../components/TaskPlayer'
import SkeletonLoader from '../components/SkeletonLoader'
import './AdminPages.css'
import './AdminDashboard.css'

export default function ClientViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { authUser, user, signOut } = useAuth()
  const [client, setClient] = useState<ClientWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isTeamLead, setIsTeamLead] = useState(false)

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

  useEffect(() => {
    if (id) {
      loadClient(parseInt(id))
    }
  }, [id])

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

  const loadClient = async (clientId: number) => {
    setLoading(true)
    setError(null)
    try {
      const clientData = await getClientWithRelations(clientId)
      if (clientData) {
        setClient(clientData)
      } else {
        setError('Клієнт не знайдено')
      }
    } catch (err) {
      console.error('Error loading client:', err)
      setError('Не вдалося завантажити клієнта')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleStatusClick = () => {
    if (client) {
      setShowConfirmModal(true)
    }
  }

  const handleConfirmToggleStatus = async () => {
    if (!client) return

    const newStatus = client.status === 'active' ? 'inactive' : 'active'
    
    setError(null)
    setSuccess(null)

    try {
      const success = await updateClientStatus(client.id, newStatus)
      
      if (success) {
        setSuccess(`Клієнт "${client.legal_name}" ${newStatus === 'active' ? 'активовано' : 'деактивовано'}`)
        setShowConfirmModal(false)
        await loadClient(client.id)
      } else {
        setError('Не вдалося змінити статус клієнта')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка зміни статусу клієнта')
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div style={{ padding: '24px' }}>
          <SkeletonLoader type="card" />
        </div>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="admin-page">
        <div className="alert alert-error">
          {error || 'Клієнт не знайдено'}
        </div>
        <button className="btn-secondary" onClick={() => navigate('/dashboard')} style={{ marginTop: '20px' }}>
          Назад до клієнтів
        </button>
      </div>
    )
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
                className="sidebar-nav-item"
                onClick={() => {
                  navigate('/dashboard?tab=employees')
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
                className="sidebar-nav-item"
                onClick={() => {
                  navigate('/dashboard?tab=clients')
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
                className="sidebar-nav-item"
                onClick={() => {
                  navigate('/dashboard?tab=calendar')
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
                    className="sidebar-nav-item"
                    onClick={() => {
                      navigate('/dashboard?tab=calendar')
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
                    className="sidebar-nav-item"
                    onClick={() => {
                      navigate('/dashboard?tab=task-calendar')
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
                className="sidebar-nav-item"
                onClick={() => {
                  navigate('/dashboard?tab=my-calendar')
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
        <div className="admin-page">
          {error && (
            <div className="alert alert-error">
              {error}
            </div>
          )}

          {success && (
            <div className="alert alert-success">
              {success}
            </div>
          )}

          <div className="project-header-section">
            <div className="project-header-left">
              <h2>Карточка клієнта: {client.legal_name}</h2>
            </div>
            <div className="project-header-right">
              {!isTeamLead && (
                <button
                  className={`btn-action btn-toggle ${client.status === 'active' ? 'inactive' : 'active'}`}
                  onClick={handleToggleStatusClick}
                  title={client.status === 'active' ? 'Деактивувати клієнта' : 'Активувати клієнта'}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                    <line x1="12" y1="2" x2="12" y2="12"></line>
                  </svg>
                </button>
              )}
              <button 
                className="btn-back"
                onClick={() => navigate('/dashboard')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                Назад
              </button>
            </div>
          </div>

          <div className="project-card-view">
            <div className="card-section">
              <h4>Основна інформація</h4>
              <div className="card-row">
                <div className="card-field">
                  <label>ЕДРПОУ:</label>
                  <span>{client.edrpou || '-'}</span>
                </div>
                <div className="card-field">
                  <label>Юр. назва:</label>
                  <span>{client.legal_name}</span>
                </div>
              </div>
              <div className="card-row">
                <div className="card-field">
                  <label>Телефон:</label>
                  <span>{client.phone || '-'}</span>
                </div>
                <div className="card-field">
                  <label>Email:</label>
                  <span>{client.email || '-'}</span>
                </div>
              </div>
              <div className="card-row">
                <div className="card-field">
                  <label>Статус:</label>
                  <span className={`status-badge ${getStatusBadgeClass(client.status)}`}>
                    {getStatusText(client.status)}
                  </span>
                </div>
                <div className="card-field">
                  <label>Група компаній:</label>
                  <span>{client.group_company?.group_name || client.company_group || '-'}</span>
                </div>
              </div>
              <div className="card-row">
                <div className="card-field">
                  <label>Вартість обслуговування:</label>
                  <span>{formatCurrency(client.service_cost)}</span>
                </div>
                <div className="card-field">
                  <label>Дата створення:</label>
                  <span>{formatDate(client.created_at)}</span>
                </div>
              </div>
            </div>

            <div className="card-section">
              <h4>Адреса</h4>
              <div className="card-row">
                <div className="card-field">
                  <label>Місто:</label>
                  <span>{client.city || '-'}</span>
                </div>
                <div className="card-field">
                  <label>Адреса:</label>
                  <span>{client.address || '-'}</span>
                </div>
              </div>
            </div>

            <div className="card-section">
              <h4>Діяльність</h4>
              <div className="card-row">
                <div className="card-field">
                  <label>КВЕД:</label>
                  <span>{client.kved ? `${client.kved.code} - ${client.kved.description}` : '-'}</span>
                </div>
                <div className="card-field">
                  <label>Вид діяльності:</label>
                  <span>{client.activity_type || '-'}</span>
                </div>
              </div>
              <div className="card-row">
                <div className="card-field">
                  <label>Тип:</label>
                  <span>{client.type || '-'}</span>
                </div>
              </div>
            </div>

            <div className="card-section">
              <h4>Керівництво</h4>
              <div className="card-row">
                <div className="card-field">
                  <label>ПІБ директора:</label>
                  <span>{client.director_full_name || '-'}</span>
                </div>
                <div className="card-field">
                  <label>Стать:</label>
                  <span>
                    {client.gender === 'male' ? 'Чоловік' : 
                     client.gender === 'female' ? 'Жінка' : '-'}
                  </span>
                </div>
              </div>
            </div>

            <div className="card-section">
              <h4>Банківські реквізити</h4>
              <div className="card-row">
                <div className="card-field">
                  <label>IBAN:</label>
                  <span>{client.iban || '-'}</span>
                </div>
                <div className="card-field">
                  <label>Назва банку:</label>
                  <span>{client.bank_name || '-'}</span>
                </div>
              </div>
            </div>

            {client.departments && client.departments.length > 0 && (
              <div className="card-section">
                <h4>Відділи обслуговування</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {client.departments.map((dept) => (
                    <span 
                      key={dept.id}
                      className="status-badge"
                      style={{ 
                        background: '#e6f2ff', 
                        color: '#2c5282',
                        fontSize: '12px',
                        padding: '6px 12px'
                      }}
                    >
                      {dept.department_name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {client.employees && client.employees.length > 0 && (
              <div className="card-section">
                <h4>Закріплені працівники</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {client.employees.map((emp) => {
                    const fullName = [emp.surname, emp.name, emp.middle_name].filter(Boolean).join(' ') || '-'
                    return (
                      <span 
                        key={emp.id}
                        className="status-badge"
                        style={{ 
                          background: '#f0f4ff', 
                          color: '#4c51bf',
                          fontSize: '12px',
                          padding: '6px 12px'
                        }}
                      >
                        {fullName}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showConfirmModal && client && (
        <div className="modal-overlay" onClick={() => { setShowConfirmModal(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Підтвердження</h3>
              <button className="modal-close" onClick={() => { setShowConfirmModal(false); }}>
                ×
              </button>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', fontSize: '16px', color: '#2d3748', lineHeight: '1.6' }}>
                Ви впевнені, що хочете {client.status === 'active' ? 'деактивувати' : 'активувати'} клієнта?
              </p>
              <div style={{ 
                background: '#f7fafc', 
                padding: '16px', 
                borderRadius: '8px',
                marginBottom: '24px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>Юр. назва:</strong>
                  <div style={{ color: '#2d3748', fontSize: '16px', fontWeight: '600' }}>{client.legal_name}</div>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>ЕДРПОУ:</strong>
                  <div style={{ color: '#2d3748', fontSize: '16px' }}>{client.edrpou || '-'}</div>
                </div>
                <div>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>Email:</strong>
                  <div style={{ color: '#2d3748', fontSize: '16px' }}>{client.email || '-'}</div>
                </div>
              </div>
              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => { setShowConfirmModal(false); }}
                >
                  Скасувати
                </button>
                <button 
                  type="button" 
                  className={`btn-primary ${client.status === 'active' ? 'btn-danger' : 'btn-success'}`}
                  onClick={handleConfirmToggleStatus}
                >
                  {client.status === 'active' ? 'Деактивувати' : 'Активувати'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Плеер задачі - відображається при активній задачі */}
      <TaskPlayer />
    </div>
  )
}

