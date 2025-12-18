import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAllProjects, createProject, updateProjectStatus } from '../lib/users'
import { supabase } from '../lib/supabase'
import type { Project, User } from '../types/database'
import { formatDate } from '../utils/date'
import { getFullName } from '../utils/user'
import './AdminPages.css'

type ProjectWithUser = Project & { user?: User }

export default function ProjectsPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [projectToToggle, setProjectToToggle] = useState<ProjectWithUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Форма створення проекту
  const [formData, setFormData] = useState({
    project_name: '',
    status: 'Активний',
    surname: '',
    name: '',
    middle_name: '',
    phone: '',
    company_name: '',
    company_code: '',
    email: '',
  })

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    setLoading(true)
    try {
      const data = await getAllProjects()
      setProjects(data)
    } catch (err) {
      console.error('Error loading projects:', err)
    } finally {
      setLoading(false)
    }
  }

  const generatePassword = () => {
    const length = 12
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    let password = ''
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length))
    }
    return password
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!formData.email) {
      setError('Email обов\'язковий для створення користувача')
      return
    }

    try {
      // 1. Створюємо проект
      const project = await createProject({
        name: formData.project_name,
        status: formData.status,
        surname: formData.surname,
        middle_name: formData.middle_name,
        phone: formData.phone,
        company_name: formData.company_name,
        company_code: formData.company_code,
        email: formData.email,
      })

      if (!project) {
        throw new Error('Не вдалося створити проект')
      }

      // 2. Генеруємо пароль
      const password = generatePassword()

      // 3. Створюємо користувача в Supabase Auth через signUp
      // Примітка: Admin API недоступний з клієнта, тому використовуємо signUp
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: password,
        options: {
          emailRedirectTo: `${window.location.origin}/reset-password`,
        },
      })

      if (authError) {
        throw authError
      }

      if (!authData.user) {
        throw new Error('Не вдалося створити користувача в системі аутентифікації')
      }

      // 4. Створюємо запис в таблиці users
      const { error: userError } = await supabase
        .from('users')
        .insert({
          auth_user_id: authData.user.id,
          project_id: project.id,
          role_id: 2, // Керівник виробництва
          surname: formData.surname,
          name: formData.name,
          middle_name: formData.middle_name,
          phone: formData.phone,
          email: formData.email,
          status: 'active',
        })

      if (userError) {
        throw userError
      }

      // 5. Відправляємо email з посиланням для встановлення пароля
      // Використовуємо resetPasswordForEmail для відправки email
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (resetError) {
        console.warn('Не вдалося відправити email з паролем:', resetError)
        // Не блокуємо створення проекту, але показуємо попередження
        setSuccess(`Проект створено успішно! Тимчасовий пароль: ${password}. Збережіть його та передайте користувачу, оскільки email не було відправлено автоматично.`)
      } else {
        setSuccess('Проект створено успішно! Користувачу надіслано email з посиланням для встановлення пароля.')
      }

      // Очищаємо форму
      setFormData({
        project_name: '',
        status: 'Активний',
        surname: '',
        name: '',
        middle_name: '',
        phone: '',
        company_name: '',
        company_code: '',
        email: '',
      })

      setShowCreateModal(false)
      loadProjects()
    } catch (err: any) {
      setError(err.message || 'Помилка створення проекту')
    }
  }

  const getProjectFullName = (project: ProjectWithUser) => {
    if (project.user) {
      return getFullName(project.user)
    }
    return '-'
  }

  const handleToggleStatusClick = (project: ProjectWithUser) => {
    setProjectToToggle(project)
    setShowConfirmModal(true)
  }

  const handleConfirmToggle = async () => {
    if (!projectToToggle) return

    const newStatus = projectToToggle.status === 'Активний' ? 'Деактивований' : 'Активний'
    
    try {
      const success = await updateProjectStatus(projectToToggle.id, newStatus)
      if (success) {
        setSuccess(`Статус проекту "${projectToToggle.name}" змінено на "${newStatus}"`)
        setShowConfirmModal(false)
        setProjectToToggle(null)
        loadProjects()
      } else {
        setError('Не вдалося змінити статус проекту')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка зміни статусу')
    }
  }

  const handleViewProject = (project: ProjectWithUser) => {
    navigate(`/projects/${project.id}`)
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
        <h2>Проекти</h2>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Створити проект
        </button>
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
              <th>Назва проекту</th>
              <th>Дата реєстрації</th>
              <th>Статус</th>
              <th>ПІБ</th>
              <th>Контактний номер телефону</th>
              <th>Назва компанії</th>
              <th>Дії</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>
                  Немає проектів
                </td>
              </tr>
            ) : (
              projects.map((project) => (
                <tr key={project.id}>
                  <td>{project.name}</td>
                  <td>{formatDate(project.date_added)}</td>
                  <td>
                    <span className={`status-badge ${project.status === 'Активний' ? 'status-active' : 'status-inactive'}`}>
                      {project.status || 'Не вказано'}
                    </span>
                  </td>
                  <td>{getProjectFullName(project)}</td>
                  <td>{project.user?.phone || project.phone || '-'}</td>
                  <td>{project.company_name || '-'}</td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className={`btn-action btn-toggle ${project.status === 'Активний' ? 'inactive' : 'active'}`}
                        onClick={() => handleToggleStatusClick(project)}
                        title={project.status === 'Активний' ? 'Деактивувати' : 'Активувати'}
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
                        className="btn-action btn-view"
                        onClick={() => handleViewProject(project)}
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

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Створити проект</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleCreateProject}>
              <div className="form-group">
                <label>Назва проекту *</label>
                <input
                  type="text"
                  value={formData.project_name}
                  onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Статус *</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  required
                >
                  <option value="Активний">Активний</option>
                  <option value="Деактивований">Деактивований</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Прізвище</label>
                  <input
                    type="text"
                    value={formData.surname}
                    onChange={(e) => setFormData({ ...formData, surname: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Ім'я</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>По батькові</label>
                  <input
                    type="text"
                    value={formData.middle_name}
                    onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Контактний номер телефону</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Назва компанії</label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Код компанії</label>
                <input
                  type="text"
                  value={formData.company_code}
                  onChange={(e) => setFormData({ ...formData, company_code: e.target.value })}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Скасувати
                </button>
                <button type="submit" className="btn-primary">
                  Створити
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConfirmModal && projectToToggle && (
        <div className="modal-overlay" onClick={() => { setShowConfirmModal(false); setProjectToToggle(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Підтвердження</h3>
              <button className="modal-close" onClick={() => { setShowConfirmModal(false); setProjectToToggle(null); }}>
                ×
              </button>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', fontSize: '16px', color: '#2d3748', lineHeight: '1.6' }}>
                Ви впевнені, що хочете {projectToToggle.status === 'Активний' ? 'деактивувати' : 'активувати'} проект?
              </p>
              <div style={{ 
                background: '#f7fafc', 
                padding: '16px', 
                borderRadius: '8px',
                marginBottom: '24px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>Назва проекту:</strong>
                  <div style={{ color: '#2d3748', fontSize: '16px', fontWeight: '600' }}>{projectToToggle.name}</div>
                </div>
                <div>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>Поточний статус:</strong>
                  <div>
                    <span className={`status-badge ${projectToToggle.status === 'Активний' ? 'status-active' : 'status-inactive'}`}>
                      {projectToToggle.status || 'Не вказано'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => { setShowConfirmModal(false); setProjectToToggle(null); }}>
                  Скасувати
                </button>
                <button type="button" className="btn-primary" onClick={handleConfirmToggle}>
                  {projectToToggle.status === 'Активний' ? 'Деактивувати' : 'Активувати'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

