import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getProjectById, getUsersByProject, updateProjectStatus, updateUserStatus } from '../lib/users'
import type { Project, User } from '../types/database'
import { formatDate } from '../utils/date'
import { getStatusBadgeClass, getStatusText } from '../utils/status'
import { getFullName } from '../utils/user'
import './AdminPages.css'
import './AdminDashboard.css'

export default function ProjectViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { authUser, signOut } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [projectUsers, setProjectUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmType, setConfirmType] = useState<'project' | 'user' | null>(null)
  const [itemToToggle, setItemToToggle] = useState<Project | User | null>(null)
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

  useEffect(() => {
    if (id) {
      loadProject(parseInt(id))
    }
  }, [id])

  const loadProject = async (projectId: number) => {
    setLoading(true)
    setError(null)
    try {
      const projectData = await getProjectById(projectId)
      if (projectData) {
        setProject(projectData)
        await loadUsers(projectId)
      } else {
        setError('Проект не знайдено')
      }
    } catch (err) {
      console.error('Error loading project:', err)
      setError('Не вдалося завантажити проект')
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async (projectId: number) => {
    setLoadingUsers(true)
    try {
      const users = await getUsersByProject(projectId)
      setProjectUsers(users)
    } catch (err) {
      console.error('Error loading users:', err)
    } finally {
      setLoadingUsers(false)
    }
  }

  const handleToggleProjectStatus = () => {
    if (project) {
      setConfirmType('project')
      setItemToToggle(project)
      setShowConfirmModal(true)
    }
  }

  const handleToggleUserStatus = (user: User) => {
    setConfirmType('user')
    setItemToToggle(user)
    setShowConfirmModal(true)
  }

  const handleConfirmToggle = async () => {
    if (!itemToToggle || !confirmType) return

    setError(null)
    setSuccess(null)

    try {
      if (confirmType === 'project') {
        const projectItem = itemToToggle as Project
        const newStatus = projectItem.status === 'Активний' ? 'Деактивований' : 'Активний'
        const result = await updateProjectStatus(projectItem.id, newStatus)
        if (result) {
          if (newStatus === 'Деактивований') {
            setSuccess(`Статус проекту змінено на "${newStatus}". Всі користувачі проекту автоматично деактивовані.`)
          } else {
            setSuccess(`Статус проекту змінено на "${newStatus}"`)
          }
          await loadProject(projectItem.id)
        } else {
          setError('Не вдалося змінити статус проекту')
        }
      } else if (confirmType === 'user') {
        const userItem = itemToToggle as User
        const newStatus = userItem.status === 'active' ? 'inactive' : 'active'
        const result = await updateUserStatus(userItem.id, newStatus)
        if (result) {
          setSuccess(`Статус користувача "${getFullName(userItem)}" змінено на "${getStatusText(newStatus)}"`)
          if (project) {
            await loadUsers(project.id)
          }
        } else {
          setError('Не вдалося змінити статус користувача')
        }
      }
      setShowConfirmModal(false)
      setConfirmType(null)
      setItemToToggle(null)
    } catch (err: any) {
      setError(err.message || 'Помилка зміни статусу')
      setShowConfirmModal(false)
      setConfirmType(null)
      setItemToToggle(null)
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div className="loading">Завантаження...</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="admin-page">
        <div className="alert alert-error">
          {error || 'Проект не знайдено'}
        </div>
        <button className="btn-secondary" onClick={() => navigate('/dashboard')} style={{ marginTop: '20px' }}>
          Назад до проектів
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
                  navigate('/dashboard')
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
                className="sidebar-nav-item"
                onClick={() => {
                  navigate('/dashboard')
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
              <h2>Карточка проекту: {project.name}</h2>
            </div>
            <div className="project-header-right">
              <button
                className={`btn-action btn-toggle ${project.status === 'Активний' ? 'inactive' : 'active'}`}
                onClick={handleToggleProjectStatus}
                title={project.status === 'Активний' ? 'Деактивувати проект' : 'Активувати проект'}
              >
                {project.status === 'Активний' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                    <line x1="12" y1="2" x2="12" y2="12"></line>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                    <line x1="12" y1="2" x2="12" y2="12"></line>
                  </svg>
                )}
              </button>
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
              <h4>Інформація про проект</h4>
              <div className="card-row">
                <div className="card-field">
                  <label>Назва проекту:</label>
                  <span>{project.name}</span>
                </div>
                <div className="card-field">
                  <label>Статус:</label>
                  <span className={`status-badge ${project.status === 'Активний' ? 'status-active' : 'status-inactive'}`}>
                    {project.status || 'Не вказано'}
                  </span>
                </div>
              </div>
              <div className="card-row">
                <div className="card-field">
                  <label>Дата реєстрації:</label>
                  <span>{formatDate(project.date_added)}</span>
                </div>
                <div className="card-field">
                  <label>Назва компанії:</label>
                  <span>{project.company_name || '-'}</span>
                </div>
              </div>
              <div className="card-row">
                <div className="card-field">
                  <label>Код компанії:</label>
                  <span>{project.company_code || '-'}</span>
                </div>
              </div>
            </div>

            <div className="card-section">
              <h4>Користувачі проекту ({projectUsers.length})</h4>
              {loadingUsers ? (
                <div className="loading" style={{ padding: '20px', textAlign: 'center' }}>
                  Завантаження користувачів...
                </div>
              ) : projectUsers.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#718096' }}>
                  Немає користувачів у цьому проекті
                </div>
              ) : (
                <div className="table-container" style={{ marginTop: '16px' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>ПІБ</th>
                        <th>Email</th>
                        <th>Телефон</th>
                        <th>Статус</th>
                        <th>Дата реєстрації</th>
                        <th>Дії</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectUsers.map((user) => (
                        <tr key={user.id}>
                          <td>{user.id}</td>
                          <td>{getFullName(user)}</td>
                          <td>{user.email || '-'}</td>
                          <td>{user.phone || '-'}</td>
                          <td>
                            <span className={`status-badge ${getStatusBadgeClass(user.status)}`}>
                              {getStatusText(user.status)}
                            </span>
                          </td>
                          <td>{formatDate(user.date_added)}</td>
                          <td>
                            <div className="action-buttons">
                              <button
                                className={`btn-action btn-toggle ${user.status === 'active' ? 'inactive' : 'active'} ${project.status === 'Деактивований' ? 'disabled' : ''}`}
                                onClick={() => handleToggleUserStatus(user)}
                                title={project.status === 'Деактивований' ? 'Проект деактивований. Спочатку активуйте проект.' : (user.status === 'active' ? 'Деактивувати' : 'Активувати')}
                                disabled={project.status === 'Деактивований'}
                              >
                                {user.status === 'active' ? (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                                    <line x1="12" y1="2" x2="12" y2="12"></line>
                                  </svg>
                                ) : (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                                    <line x1="12" y1="2" x2="12" y2="12"></line>
                                  </svg>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showConfirmModal && itemToToggle && (
        <div className="modal-overlay" onClick={() => { setShowConfirmModal(false); setConfirmType(null); setItemToToggle(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Підтвердження</h3>
              <button className="modal-close" onClick={() => { setShowConfirmModal(false); setConfirmType(null); setItemToToggle(null); }}>
                ×
              </button>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', fontSize: '16px', color: '#2d3748', lineHeight: '1.6' }}>
                Ви впевнені, що хочете {confirmType === 'project' 
                  ? (itemToToggle as Project).status === 'Активний' ? 'деактивувати' : 'активувати'
                  : (itemToToggle as User).status === 'active' ? 'деактивувати' : 'активувати'
                } {confirmType === 'project' ? 'проект' : 'користувача'}?
              </p>
              <div style={{ 
                background: '#f7fafc', 
                padding: '16px', 
                borderRadius: '8px',
                marginBottom: '24px',
                border: '1px solid #e2e8f0'
              }}>
                {confirmType === 'project' ? (
                  <>
                    <div style={{ marginBottom: '8px' }}>
                      <strong style={{ color: '#718096', fontSize: '14px' }}>Назва проекту:</strong>
                      <div style={{ color: '#2d3748', fontSize: '16px', fontWeight: '600' }}>{(itemToToggle as Project).name}</div>
                    </div>
                    <div>
                      <strong style={{ color: '#718096', fontSize: '14px' }}>Поточний статус:</strong>
                      <div>
                        <span className={`status-badge ${(itemToToggle as Project).status === 'Активний' ? 'status-active' : 'status-inactive'}`}>
                          {(itemToToggle as Project).status || 'Не вказано'}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ marginBottom: '8px' }}>
                      <strong style={{ color: '#718096', fontSize: '14px' }}>ПІБ:</strong>
                      <div style={{ color: '#2d3748', fontSize: '16px', fontWeight: '600' }}>{getFullName(itemToToggle as User)}</div>
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <strong style={{ color: '#718096', fontSize: '14px' }}>Email:</strong>
                      <div style={{ color: '#2d3748', fontSize: '16px' }}>{(itemToToggle as User).email || '-'}</div>
                    </div>
                    <div>
                      <strong style={{ color: '#718096', fontSize: '14px' }}>Поточний статус:</strong>
                      <div>
                        <span className={`status-badge ${getStatusBadgeClass((itemToToggle as User).status)}`}>
                          {getStatusText((itemToToggle as User).status)}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => { setShowConfirmModal(false); setConfirmType(null); setItemToToggle(null); }}>
                  Скасувати
                </button>
                <button type="button" className="btn-primary" onClick={handleConfirmToggle}>
                  {confirmType === 'project'
                    ? (itemToToggle as Project).status === 'Активний' ? 'Деактивувати' : 'Активувати'
                    : (itemToToggle as User).status === 'active' ? 'Деактивувати' : 'Активувати'
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

