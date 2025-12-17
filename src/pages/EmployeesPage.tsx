import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { 
  getUsersByProject, 
  getDepartmentsByProject, 
  createDepartment, 
  createUser,
  getUserDepartments,
  setUserDepartments,
  getUserWithRole,
  getAllRoles,
  updateUserStatus
} from '../lib/users'
import { signUp, resetPasswordForEmail } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { User, Department, Role } from '../types/database'
import './AdminPages.css'
import './ManagerDashboard.css'

interface EmployeeWithRole extends User {
  role?: Role
}

export default function EmployeesPage() {
  const { user } = useAuth()
  const [employees, setEmployees] = useState<EmployeeWithRole[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [availableRoles, setAvailableRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [showDepartmentModal, setShowDepartmentModal] = useState(false)
  const [showEmployeeModal, setShowEmployeeModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithRole | null>(null)
  const [employeeToToggle, setEmployeeToToggle] = useState<EmployeeWithRole | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [departmentForm, setDepartmentForm] = useState({
    department_name: ''
  })

  const [employeeForm, setEmployeeForm] = useState({
    surname: '',
    name: '',
    middle_name: '',
    email: '',
    phone: '',
    role_id: 0,
    department_ids: [] as number[]
  })

  useEffect(() => {
    if (user?.project_id) {
      loadData()
      loadAvailableRoles()
    }
  }, [user?.project_id])

  const loadAvailableRoles = async () => {
    const allRoles = await getAllRoles()
    // Фільтруємо ролі: керівник виробництва не може створювати адміністратора (id=1) та керівника виробництва (id=2)
    const filteredRoles = allRoles.filter(role => role.id !== 1 && role.id !== 2)
    setAvailableRoles(filteredRoles)
  }

  const loadData = async () => {
    if (!user?.project_id || !user?.id) return

    setLoading(true)
    try {
      const [employeesData, departmentsData] = await Promise.all([
        getUsersByProject(user.project_id),
        getDepartmentsByProject(user.project_id)
      ])
      
      // Фільтруємо поточного користувача (керівника виробництва)
      const filteredEmployees = employeesData.filter(emp => emp.id !== user.id)
      
      // Завантажуємо ролі для кожного співробітника
      const employeesWithRoles = await Promise.all(
        filteredEmployees.map(async (emp) => {
          const userWithRole = await getUserWithRole(emp.id)
          return userWithRole ? { ...emp, role: userWithRole.role } : emp
        })
      )
      
      setEmployees(employeesWithRoles)
      setDepartments(departmentsData)
    } catch (err) {
      console.error('Error loading data:', err)
      setError('Не вдалося завантажити дані')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.project_id) return

    setError(null)
    setSuccess(null)

    try {
      const newDepartment = await createDepartment({
        department_name: departmentForm.department_name,
        project_id: user.project_id
      })

      if (newDepartment) {
        setSuccess(`Відділ "${departmentForm.department_name}" успішно створено`)
        setDepartmentForm({ department_name: '' })
        setShowDepartmentModal(false)
        await loadData()
      } else {
        setError('Не вдалося створити відділ')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка створення відділу')
    }
  }

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.project_id) return

    if (employeeForm.department_ids.length === 0) {
      setError('Оберіть хоча б один відділ')
      return
    }

    if (!employeeForm.role_id || employeeForm.role_id === 0) {
      setError('Оберіть роль для працівника')
      return
    }

    setError(null)
    setSuccess(null)

    try {
      // Генеруємо тимчасовий пароль
      const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase() + '1!'

      // 1. Створюємо користувача в Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: employeeForm.email,
        password: tempPassword,
      })

      if (authError) {
        throw authError
      }

      if (!authData.user) {
        throw new Error('Не вдалося створити користувача в системі аутентифікації')
      }

      // 2. Створюємо запис в таблиці users
      const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
          auth_user_id: authData.user.id,
          project_id: user.project_id,
          role_id: employeeForm.role_id,
          surname: employeeForm.surname,
          name: employeeForm.name,
          middle_name: employeeForm.middle_name,
          email: employeeForm.email,
          phone: employeeForm.phone,
          status: 'active',
        })
        .select()
        .single()

      if (userError) {
        throw userError
      }

      if (!newUser) {
        throw new Error('Не вдалося створити запис користувача')
      }

      // 3. Призначаємо департаменти
      await setUserDepartments(newUser.id, employeeForm.department_ids)

      // 4. Відправляємо email з посиланням для встановлення пароля
      try {
        await resetPasswordForEmail(employeeForm.email)
        setSuccess(`Працівник "${employeeForm.surname} ${employeeForm.name}" успішно створено! На email "${employeeForm.email}" надіслано посилання для встановлення пароля.`)
      } catch (resetError: any) {
        console.warn('Не вдалося відправити email:', resetError)
        setSuccess(`Працівник "${employeeForm.surname} ${employeeForm.name}" успішно створено! Увага: не вдалося відправити email з посиланням для встановлення пароля.`)
      }

      // Очищаємо форму
      setEmployeeForm({
        surname: '',
        name: '',
        middle_name: '',
        email: '',
        phone: '',
        role_id: 0,
        department_ids: []
      })
      setShowEmployeeModal(false)
      await loadData()
    } catch (err: any) {
      setError(err.message || 'Помилка створення працівника')
    }
  }

  const isFormValid = () => {
    return (
      employeeForm.surname.trim() !== '' &&
      employeeForm.name.trim() !== '' &&
      employeeForm.email.trim() !== '' &&
      employeeForm.role_id > 0 &&
      employeeForm.department_ids.length > 0
    )
  }

  const getFullName = (emp: EmployeeWithRole) => {
    const parts = [emp.surname, emp.name, emp.middle_name].filter(Boolean)
    return parts.join(' ') || '-'
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('uk-UA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  const handleViewEmployee = (employee: EmployeeWithRole) => {
    setSelectedEmployee(employee)
    setShowViewModal(true)
  }

  const handleToggleStatusClick = (employee: EmployeeWithRole) => {
    setEmployeeToToggle(employee)
    setShowConfirmModal(true)
  }

  const handleConfirmToggleStatus = async () => {
    if (!employeeToToggle) return

    const newStatus = employeeToToggle.status === 'active' ? 'inactive' : 'active'
    
    setError(null)
    setSuccess(null)

    try {
      const success = await updateUserStatus(employeeToToggle.id, newStatus)
      
      if (success) {
        setSuccess(`Працівник "${getFullName(employeeToToggle)}" ${newStatus === 'active' ? 'активовано' : 'деактивовано'}`)
        setShowConfirmModal(false)
        setEmployeeToToggle(null)
        await loadData()
      } else {
        setError('Не вдалося змінити статус працівника')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка зміни статусу працівника')
    }
  }

  const toggleDepartment = (departmentId: number) => {
    setEmployeeForm(prev => ({
      ...prev,
      department_ids: prev.department_ids.includes(departmentId)
        ? prev.department_ids.filter(id => id !== departmentId)
        : [...prev.department_ids, departmentId]
    }))
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
        <h2>Співробітники</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className="btn-primary" 
            onClick={() => setShowDepartmentModal(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Створити відділ
          </button>
          <button 
            className={`btn-primary ${departments.length === 0 ? 'disabled' : ''}`}
            onClick={() => {
              if (departments.length === 0) {
                setError('Перед тим як створити Вашого першого співробітника створіть департамент')
                return
              }
              setShowEmployeeModal(true)
            }}
            disabled={departments.length === 0}
            title={departments.length === 0 ? 'Перед тим як створити Вашого першого співробітника створіть департамент' : ''}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Створити працівника
          </button>
        </div>
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

      {departments.length === 0 && (
        <div className="alert alert-error" style={{ marginBottom: '24px' }}>
          Перед тим як створити Вашого першого співробітника створіть департамент
        </div>
      )}

      <div className="table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>ПІБ</th>
              <th>Email</th>
              <th>Телефон</th>
              <th>Роль</th>
              <th>Відділи</th>
              <th>Статус</th>
              <th>Дата реєстрації</th>
              <th>Дії</th>
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px' }}>
                  Немає співробітників
                </td>
              </tr>
            ) : (
              employees.map((employee) => (
                <EmployeeRow 
                  key={employee.id} 
                  employee={employee} 
                  departments={departments}
                  getFullName={getFullName}
                  formatDate={formatDate}
                  onView={handleViewEmployee}
                  onToggleStatus={handleToggleStatusClick}
                  currentUserId={user?.id}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {showDepartmentModal && (
        <div className="modal-overlay" onClick={() => setShowDepartmentModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Створити відділ</h3>
              <button className="modal-close" onClick={() => setShowDepartmentModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleCreateDepartment}>
              <div className="form-group">
                <label>Назва відділу *</label>
                <input
                  type="text"
                  value={departmentForm.department_name}
                  onChange={(e) => setDepartmentForm({ department_name: e.target.value })}
                  placeholder="Введіть назву відділу"
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowDepartmentModal(false)}>
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

      {showViewModal && selectedEmployee && (
        <div className="modal-overlay" onClick={() => setShowViewModal(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Карточка працівника: {getFullName(selectedEmployee)}</h3>
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
                    <span>{getFullName(selectedEmployee)}</span>
                  </div>
                  <div className="card-field">
                    <label>Email:</label>
                    <span>{selectedEmployee.email || '-'}</span>
                  </div>
                </div>
                <div className="card-row">
                  <div className="card-field">
                    <label>Телефон:</label>
                    <span>{selectedEmployee.phone || '-'}</span>
                  </div>
                  <div className="card-field">
                    <label>Статус:</label>
                    <span className={`status-badge ${selectedEmployee.status === 'active' ? 'status-active' : 'status-inactive'}`}>
                      {selectedEmployee.status === 'active' ? 'Активний' : selectedEmployee.status === 'inactive' ? 'Неактивний' : 'Не вказано'}
                    </span>
                  </div>
                </div>
                <div className="card-row">
                  <div className="card-field">
                    <label>Роль:</label>
                    <span>{selectedEmployee.role?.role_name || '-'}</span>
                  </div>
                  <div className="card-field">
                    <label>Дата реєстрації:</label>
                    <span>{formatDate(selectedEmployee.date_added)}</span>
                  </div>
                </div>
                <div className="card-row">
                  <div className="card-field">
                    <label>ID працівника:</label>
                    <span>{selectedEmployee.id}</span>
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

      {showConfirmModal && employeeToToggle && (
        <div className="modal-overlay" onClick={() => { setShowConfirmModal(false); setEmployeeToToggle(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Підтвердження</h3>
              <button className="modal-close" onClick={() => { setShowConfirmModal(false); setEmployeeToToggle(null); }}>
                ×
              </button>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', fontSize: '16px', color: '#2d3748', lineHeight: '1.6' }}>
                Ви впевнені, що хочете {employeeToToggle.status === 'active' ? 'деактивувати' : 'активувати'} працівника?
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
                  <div style={{ color: '#2d3748', fontSize: '16px', fontWeight: '600' }}>{getFullName(employeeToToggle)}</div>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>Email:</strong>
                  <div style={{ color: '#2d3748', fontSize: '16px' }}>{employeeToToggle.email || '-'}</div>
                </div>
                <div>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>Роль:</strong>
                  <div style={{ color: '#2d3748', fontSize: '16px' }}>{employeeToToggle.role?.role_name || '-'}</div>
                </div>
              </div>
              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => { setShowConfirmModal(false); setEmployeeToToggle(null); }}
                >
                  Скасувати
                </button>
                <button 
                  type="button" 
                  className={`btn-primary ${employeeToToggle.status === 'active' ? 'btn-danger' : 'btn-success'}`}
                  onClick={handleConfirmToggleStatus}
                >
                  {employeeToToggle.status === 'active' ? 'Деактивувати' : 'Активувати'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEmployeeModal && (
        <div className="modal-overlay" onClick={() => setShowEmployeeModal(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Створити працівника</h3>
              <button className="modal-close" onClick={() => setShowEmployeeModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleCreateEmployee}>
              <div className="form-row">
                <div className="form-group">
                  <label>Прізвище *</label>
                  <input
                    type="text"
                    value={employeeForm.surname}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, surname: e.target.value })}
                    placeholder="Введіть прізвище"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Ім'я *</label>
                  <input
                    type="text"
                    value={employeeForm.name}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })}
                    placeholder="Введіть ім'я"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>По батькові</label>
                  <input
                    type="text"
                    value={employeeForm.middle_name}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, middle_name: e.target.value })}
                    placeholder="Введіть по батькові"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    value={employeeForm.email}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                    placeholder="Введіть email"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Телефон</label>
                  <input
                    type="tel"
                    value={employeeForm.phone}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, phone: e.target.value })}
                    placeholder="Введіть телефон"
                  />
                </div>
                <div className="form-group">
                  <label>Роль *</label>
                  <select
                    value={employeeForm.role_id}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, role_id: parseInt(e.target.value) })}
                    required
                  >
                    <option value="0">Оберіть роль</option>
                    {availableRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.role_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Відділи *</label>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
                  gap: '12px',
                  marginTop: '8px'
                }}>
                  {departments.map((dept) => (
                    <label 
                      key={dept.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px',
                        border: `2px solid ${employeeForm.department_ids.includes(dept.id) ? '#ff6b35' : '#e2e8f0'}`,
                        borderRadius: '10px',
                        cursor: 'pointer',
                        background: employeeForm.department_ids.includes(dept.id) ? '#fff5f0' : '#ffffff',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={employeeForm.department_ids.includes(dept.id)}
                        onChange={() => toggleDepartment(dept.id)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: 500, color: '#2d3748' }}>{dept.department_name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowEmployeeModal(false)}>
                  Скасувати
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={!isFormValid()}
                >
                  Створити
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function EmployeeRow({ 
  employee, 
  departments, 
  getFullName, 
  formatDate,
  onView,
  onToggleStatus,
  currentUserId
}: { 
  employee: EmployeeWithRole
  departments: Department[]
  getFullName: (user: User) => string
  formatDate: (date: string) => string
  onView: (employee: EmployeeWithRole) => void
  onToggleStatus: (employee: EmployeeWithRole) => void
  currentUserId?: number
}) {
  const [employeeDepartments, setEmployeeDepartments] = useState<Department[]>([])

  useEffect(() => {
    loadEmployeeDepartments()
  }, [employee.id])

  const loadEmployeeDepartments = async () => {
    const depts = await getUserDepartments(employee.id)
    setEmployeeDepartments(depts)
  }

  return (
    <tr>
      <td>{employee.id}</td>
      <td>{getFullName(employee)}</td>
      <td>{employee.email || '-'}</td>
      <td>{employee.phone || '-'}</td>
      <td>
        {employee.role ? (
          <span 
            className="status-badge"
            style={{ 
              background: '#f0f4ff', 
              color: '#4c51bf',
              fontSize: '12px',
              padding: '6px 12px',
              fontWeight: 500
            }}
          >
            {employee.role.role_name}
          </span>
        ) : (
          '-'
        )}
      </td>
      <td>
        {employeeDepartments.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {employeeDepartments.map((dept) => (
              <span 
                key={dept.id}
                className="status-badge"
                style={{ 
                  background: '#e6f2ff', 
                  color: '#2c5282',
                  fontSize: '11px',
                  padding: '4px 10px'
                }}
              >
                {dept.department_name}
              </span>
            ))}
          </div>
        ) : (
          '-'
        )}
      </td>
      <td>
        <span className={`status-badge ${employee.status === 'active' ? 'status-active' : 'status-inactive'}`}>
          {employee.status === 'active' ? 'Активний' : employee.status === 'inactive' ? 'Неактивний' : 'Не вказано'}
        </span>
      </td>
      <td>{formatDate(employee.date_added)}</td>
      <td>
        <div className="action-buttons">
          <button
            className={`btn-action btn-toggle ${employee.status === 'active' ? 'inactive' : 'active'} ${employee.id === currentUserId ? 'disabled' : ''}`}
            onClick={() => onToggleStatus(employee)}
            disabled={employee.id === currentUserId}
            title={employee.id === currentUserId ? 'Ви не можете деактивувати себе' : (employee.status === 'active' ? 'Деактивувати' : 'Активувати')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
              <line x1="12" y1="2" x2="12" y2="12"></line>
            </svg>
          </button>
          <button
            className="btn-action btn-view"
            onClick={() => onView(employee)}
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
  )
}

