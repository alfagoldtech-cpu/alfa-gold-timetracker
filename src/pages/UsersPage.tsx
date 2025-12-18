import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { updateUserStatus, getUserById } from '../lib/users'
import type { User, Project } from '../types/database'
import { formatDate } from '../utils/date'
import { getStatusBadgeClass, getStatusText } from '../utils/status'
import { getFullName } from '../utils/user'
import './AdminPages.css'

interface UserWithProject extends User {
  project?: Project
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserWithProject[]>([])
  const [loading, setLoading] = useState(true)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [userToToggle, setUserToToggle] = useState<UserWithProject | null>(null)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          projects (*)
        `)
        .order('date_added', { ascending: false })

      if (error) {
        console.error('Error loading users:', error)
      } else {
        const usersWithProjects = (data || []).map((user: any) => {
          let project = null
          if (user.projects) {
            if (Array.isArray(user.projects)) {
              project = user.projects.length > 0 ? user.projects[0] : null
            } else {
              project = user.projects
            }
          }
          return {
            ...user,
            project: project || undefined
          }
        })
        setUsers(usersWithProjects)
      }
    } catch (err) {
      console.error('Error loading users:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleStatusClick = (user: UserWithProject) => {
    if (user.project && user.project.status === 'Деактивований') {
      setError('Неможливо змінити статус користувача, оскільки проект деактивований. Спочатку активуйте проект.')
      return
    }
    setUserToToggle(user)
    setShowConfirmModal(true)
  }

  const handleConfirmToggle = async () => {
    if (!userToToggle) return

    const newStatus = userToToggle.status === 'active' ? 'inactive' : 'active'
    
    try {
      const success = await updateUserStatus(userToToggle.id, newStatus)
      if (success) {
        setSuccess(`Статус користувача "${getFullName(userToToggle)}" змінено на "${newStatus === 'active' ? 'Активний' : 'Неактивний'}"`)
        setShowConfirmModal(false)
        setUserToToggle(null)
        loadUsers()
      } else {
        setError('Не вдалося змінити статус користувача')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка зміни статусу')
    }
  }

  const handleViewUser = async (user: User) => {
    try {
      const fullUser = await getUserById(user.id)
      if (fullUser) {
        setSelectedUser(fullUser)
        setShowViewModal(true)
      }
    } catch (err) {
      console.error('Error loading user details:', err)
      setError('Не вдалося завантажити деталі користувача')
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div className="loading">Завантаження...</div>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>Користувачі</h2>
      </div>

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

      <div className="table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Email</th>
              <th>ПІБ</th>
              <th>Телефон</th>
              <th>Статус</th>
              <th>Дата реєстрації</th>
              <th>Дії</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                  Немає користувачів
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>{user.email || '-'}</td>
                  <td>{getFullName(user)}</td>
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
                        className={`btn-action btn-toggle ${user.status === 'active' ? 'inactive' : 'active'} ${user.project && user.project.status === 'Деактивований' ? 'disabled' : ''}`}
                        onClick={() => handleToggleStatusClick(user)}
                        title={user.project && user.project.status === 'Деактивований' ? 'Проект деактивований. Спочатку активуйте проект.' : (user.status === 'active' ? 'Деактивувати' : 'Активувати')}
                        disabled={user.project && user.project.status === 'Деактивований'}
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
                      <button
                        className="btn-action btn-view"
                        onClick={() => handleViewUser(user)}
                        title="Перегляд"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showViewModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Карточка користувача: {getFullName(selectedUser)}</h3>
              <button className="modal-close" onClick={() => setShowViewModal(false)}>
                ×
              </button>
            </div>
            <div className="project-card">
              <div className="card-section">
                <h4>Особиста інформація</h4>
                <div className="card-row">
                  <div className="card-field">
                    <label>ПІБ:</label>
                    <span>{getFullName(selectedUser)}</span>
                  </div>
                  <div className="card-field">
                    <label>Email:</label>
                    <span>{selectedUser.email || '-'}</span>
                  </div>
                </div>
                <div className="card-row">
                  <div className="card-field">
                    <label>Телефон:</label>
                    <span>{selectedUser.phone || '-'}</span>
                  </div>
                  <div className="card-field">
                    <label>Статус:</label>
                    <span className={`status-badge ${getStatusBadgeClass(selectedUser.status)}`}>
                      {getStatusText(selectedUser.status)}
                    </span>
                  </div>
                </div>
                <div className="card-row">
                  <div className="card-field">
                    <label>Дата реєстрації:</label>
                    <span>{formatDate(selectedUser.date_added)}</span>
                  </div>
                  <div className="card-field">
                    <label>ID користувача:</label>
                    <span>{selectedUser.id}</span>
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowViewModal(false)}>
                  Закрити
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && userToToggle && (
        <div className="modal-overlay" onClick={() => { setShowConfirmModal(false); setUserToToggle(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Підтвердження</h3>
              <button className="modal-close" onClick={() => { setShowConfirmModal(false); setUserToToggle(null); }}>
                ×
              </button>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', fontSize: '16px', color: '#2d3748', lineHeight: '1.6' }}>
                Ви впевнені, що хочете {userToToggle.status === 'active' ? 'деактивувати' : 'активувати'} користувача?
              </p>
              <div style={{ 
                background: '#f7fafc', 
                padding: '16px', 
                borderRadius: '8px',
                marginBottom: '24px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>ПІБ:</strong>
                  <div style={{ color: '#2d3748', fontSize: '16px', fontWeight: '600' }}>{getFullName(userToToggle)}</div>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>Email:</strong>
                  <div style={{ color: '#2d3748', fontSize: '16px' }}>{userToToggle.email || '-'}</div>
                </div>
                <div>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>Поточний статус:</strong>
                  <div>
                    <span className={`status-badge ${getStatusBadgeClass(userToToggle.status)}`}>
                      {getStatusText(userToToggle.status)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => { setShowConfirmModal(false); setUserToToggle(null); }}>
                  Скасувати
                </button>
                <button type="button" className="btn-primary" onClick={handleConfirmToggle}>
                  {userToToggle.status === 'active' ? 'Деактивувати' : 'Активувати'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

