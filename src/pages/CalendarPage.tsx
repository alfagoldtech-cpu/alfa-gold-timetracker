import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { 
  getTasksByProject, 
  createTask,
  updateTaskStatus,
  deleteTask
} from '../lib/tasks'
import type { Task } from '../types/database'
import './AdminPages.css'
import './ManagerDashboard.css'

export default function CalendarPage() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [taskForm, setTaskForm] = useState({
    task_name: '',
    task_type: 'single', // 'single', 'month', 'quarter', 'year'
    category: '',
    description: '',
    status: 'pending',
    year: new Date().getFullYear(),
    planned_date: ''
  })

  const [monthlyTasks, setMonthlyTasks] = useState<Array<{ month: number; date: string }>>([])
  const [quarterlyTasks, setQuarterlyTasks] = useState<Array<{ quarter: number; date: string }>>([])
  const [yearlyTask, setYearlyTask] = useState<{ date: string }>({ date: '' })

  useEffect(() => {
    if (user?.project_id) {
      loadTasks()
    }
  }, [user?.project_id])

  useEffect(() => {
    // Ініціалізуємо форми залежно від типу задачі
    if (taskForm.task_type === 'month') {
      const currentYear = taskForm.year
      const months = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        date: `${currentYear}-${String(i + 1).padStart(2, '0')}-01`
      }))
      setMonthlyTasks(months)
    } else if (taskForm.task_type === 'quarter') {
      const currentYear = taskForm.year
      const quarters = [
        { quarter: 1, date: `${currentYear}-01-01` },
        { quarter: 2, date: `${currentYear}-04-01` },
        { quarter: 3, date: `${currentYear}-07-01` },
        { quarter: 4, date: `${currentYear}-10-01` }
      ]
      setQuarterlyTasks(quarters)
    } else if (taskForm.task_type === 'year') {
      setYearlyTask({ date: `${taskForm.year}-01-01` })
    }
  }, [taskForm.task_type, taskForm.year])

  const loadTasks = async () => {
    if (!user?.project_id) return

    setLoading(true)
    try {
      const tasksData = await getTasksByProject(user.project_id)
      setTasks(tasksData)
    } catch (err) {
      console.error('Error loading tasks:', err)
      setError('Не вдалося завантажити задачі')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!taskForm.task_name.trim()) {
      setError('Введіть назву задачі')
      return
    }

    if (!user?.project_id) {
      setError('Не вдалося визначити проект')
      return
    }

    setError(null)
    setSuccess(null)

    try {
      let tasksToCreate: Array<{ planned_date: string; task_name: string }> = []

      if (taskForm.task_type === 'month') {
        // Створюємо 12 задач для кожного місяця
        tasksToCreate = monthlyTasks.map(task => ({
          planned_date: task.date,
          task_name: `${taskForm.task_name} - ${getMonthName(task.month)}`
        }))
      } else if (taskForm.task_type === 'quarter') {
        // Створюємо 4 задачі для кожного кварталу
        tasksToCreate = quarterlyTasks.map(task => ({
          planned_date: task.date,
          task_name: `${taskForm.task_name} - ${task.quarter} квартал`
        }))
      } else if (taskForm.task_type === 'year') {
        // Створюємо 1 задачу на рік
        if (!yearlyTask.date) {
          setError('Виберіть планову дату')
          return
        }
        tasksToCreate = [{
          planned_date: yearlyTask.date,
          task_name: taskForm.task_name
        }]
      } else {
        // Одиночна задача (старий формат)
        if (!taskForm.planned_date) {
          setError('Виберіть планову дату')
          return
        }
        tasksToCreate = [{
          planned_date: taskForm.planned_date,
          task_name: taskForm.task_name
        }]
      }

      // Створюємо всі задачі
      const results = await Promise.all(
        tasksToCreate.map(taskData =>
          createTask({
            project_id: user.project_id,
            task_name: taskData.task_name,
            task_type: taskForm.task_type === 'single' ? undefined : taskForm.task_type,
            category: taskForm.category || undefined,
            planned_date: taskData.planned_date,
            description: taskForm.description || undefined,
            status: taskForm.status
          })
        )
      )

      const successCount = results.filter(r => r !== null).length
      
      if (successCount > 0) {
        setSuccess(`Створено ${successCount} задач(и)`)
        setTaskForm({
          task_name: '',
          task_type: 'single',
          category: '',
          description: '',
          status: 'pending',
          year: new Date().getFullYear()
        })
        setMonthlyTasks([])
        setQuarterlyTasks([])
        setYearlyTask({ date: '' })
        setShowCreateModal(false)
        await loadTasks()
      } else {
        setError('Не вдалося створити задачі')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка створення задачі')
    }
  }

  const getMonthName = (month: number) => {
    const months = [
      'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
      'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
    ]
    return months[month - 1]
  }

  const getQuarterName = (quarter: number) => {
    return `${quarter} квартал`
  }

  const updateMonthlyDate = (monthIndex: number, date: string) => {
    setMonthlyTasks(prev => {
      const updated = [...prev]
      updated[monthIndex] = { ...updated[monthIndex], date }
      return updated
    })
  }

  const updateQuarterlyDate = (quarterIndex: number, date: string) => {
    setQuarterlyTasks(prev => {
      const updated = [...prev]
      updated[quarterIndex] = { ...updated[quarterIndex], date }
      return updated
    })
  }

  const handleDeleteClick = (task: Task) => {
    setTaskToDelete(task)
    setShowConfirmModal(true)
  }

  const handleConfirmDelete = async () => {
    if (!taskToDelete) return

    try {
      const success = await deleteTask(taskToDelete.id)
      
      if (success) {
        setSuccess(`Задачу "${taskToDelete.task_name}" успішно видалено`)
        setShowConfirmModal(false)
        setTaskToDelete(null)
        await loadTasks()
      } else {
        setError('Не вдалося видалити задачу')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка видалення задачі')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('uk-UA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'completed':
        return 'status-active'
      case 'in_progress':
        return 'status-badge'
      case 'pending':
      default:
        return 'status-inactive'
    }
  }

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'completed':
        return 'Виконано'
      case 'in_progress':
        return 'В процесі'
      case 'pending':
      default:
        return 'Очікує'
    }
  }

  const getTaskTypeText = (type?: string) => {
    switch (type) {
      case 'month':
        return 'Місяць'
      case 'quarter':
        return 'Квартал'
      case 'year':
        return 'Рік'
      case 'single':
      default:
        return 'Одиночна'
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
        <h2>Календар</h2>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Створити задачу
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
              <th>Назва задачі</th>
              <th>Тип</th>
              <th>Категорія</th>
              <th>Планова дата</th>
              <th>Статус</th>
              <th>Дії</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}>
                  Немає задач
                </td>
              </tr>
            ) : (
              tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.task_name}</td>
                  <td>{getTaskTypeText(task.task_type) || '-'}</td>
                  <td>{task.category || '-'}</td>
                  <td>{formatDate(task.planned_date)}</td>
                  <td>
                    <span className={`status-badge ${getStatusBadge(task.status)}`}>
                      {getStatusText(task.status)}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-action btn-danger"
                        onClick={() => handleDeleteClick(task)}
                        title="Видалити"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
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
          <div className={`modal-content ${taskForm.task_type === 'month' ? 'modal-large' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Створити задачу</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                ×
              </button>
            </div>
            <form onSubmit={handleCreateTask}>
              <div className="form-group">
                <label>Назва задачі *</label>
                <input
                  type="text"
                  value={taskForm.task_name}
                  onChange={(e) => setTaskForm({ ...taskForm, task_name: e.target.value })}
                  placeholder="Введіть назву задачі"
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Тип задачі *</label>
                  <select
                    value={taskForm.task_type}
                    onChange={(e) => setTaskForm({ ...taskForm, task_type: e.target.value })}
                    required
                  >
                    <option value="single">Одиночна</option>
                    <option value="month">Місяць (12 задач)</option>
                    <option value="quarter">Квартал (4 задачі)</option>
                    <option value="year">Рік (1 задача)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Категорія</label>
                  <input
                    type="text"
                    value={taskForm.category}
                    onChange={(e) => setTaskForm({ ...taskForm, category: e.target.value })}
                    placeholder="Введіть категорію"
                  />
                </div>
              </div>

              {taskForm.task_type === 'single' && (
                <div className="form-group">
                  <label>Планова дата *</label>
                  <input
                    type="date"
                    value={taskForm.planned_date}
                    onChange={(e) => setTaskForm({ ...taskForm, planned_date: e.target.value })}
                    required
                  />
                </div>
              )}

              {taskForm.task_type === 'month' && (
                <div className="form-group">
                  <label>Рік *</label>
                  <input
                    type="number"
                    value={taskForm.year}
                    onChange={(e) => setTaskForm({ ...taskForm, year: parseInt(e.target.value) || new Date().getFullYear() })}
                    min="2020"
                    max="2100"
                    required
                    style={{ marginBottom: '20px' }}
                  />
                  <label style={{ marginBottom: '16px', display: 'block', fontWeight: '600', color: '#2d3748', fontSize: '14px' }}>
                    Планові дати для кожного місяця:
                  </label>
                  <div className="months-grid">
                    {monthlyTasks.map((task, index) => (
                      <div key={index} className="month-input-wrapper">
                        <label className="month-label">
                          {getMonthName(task.month)}
                        </label>
                        <input
                          type="date"
                          value={task.date}
                          onChange={(e) => updateMonthlyDate(index, e.target.value)}
                          className="month-date-input"
                          required
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {taskForm.task_type === 'quarter' && (
                <div className="form-group">
                  <label>Рік *</label>
                  <input
                    type="number"
                    value={taskForm.year}
                    onChange={(e) => setTaskForm({ ...taskForm, year: parseInt(e.target.value) || new Date().getFullYear() })}
                    min="2020"
                    max="2100"
                    required
                    style={{ marginBottom: '20px' }}
                  />
                  <label style={{ marginBottom: '16px', display: 'block', fontWeight: '600', color: '#2d3748', fontSize: '14px' }}>
                    Планові дати для кожного кварталу:
                  </label>
                  <div className="quarters-grid">
                    {quarterlyTasks.map((task, index) => (
                      <div key={index} className="quarter-input-wrapper">
                        <label className="quarter-label">
                          {getQuarterName(task.quarter)}
                        </label>
                        <input
                          type="date"
                          value={task.date}
                          onChange={(e) => updateQuarterlyDate(index, e.target.value)}
                          className="quarter-date-input"
                          required
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {taskForm.task_type === 'year' && (
                <div className="form-group">
                  <label>Рік *</label>
                  <input
                    type="number"
                    value={taskForm.year}
                    onChange={(e) => {
                      const year = parseInt(e.target.value) || new Date().getFullYear()
                      setTaskForm({ ...taskForm, year })
                      setYearlyTask({ date: `${year}-01-01` })
                    }}
                    min="2020"
                    max="2100"
                    required
                    style={{ marginBottom: '16px' }}
                  />
                  <label>Планова дата *</label>
                  <input
                    type="date"
                    value={yearlyTask.date}
                    onChange={(e) => setYearlyTask({ date: e.target.value })}
                    required
                  />
                </div>
              )}
              <div className="form-group">
                <label>Опис</label>
                <textarea
                  value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  placeholder="Введіть опис задачі"
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #cbd5e0',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => {
                  setShowCreateModal(false)
                  setTaskForm({
                    task_name: '',
                    task_type: 'single',
                    category: '',
                    description: '',
                    status: 'pending',
                    year: new Date().getFullYear(),
                    planned_date: ''
                  })
                  setMonthlyTasks([])
                  setQuarterlyTasks([])
                  setYearlyTask({ date: '' })
                }}>
                  Скасувати
                </button>
                <button type="submit" className="btn-primary">
                  Створити {taskForm.task_type === 'month' ? '12 задач' : taskForm.task_type === 'quarter' ? '4 задачі' : taskForm.task_type === 'year' ? 'задачу' : 'задачу'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConfirmModal && taskToDelete && (
        <div className="modal-overlay" onClick={() => { setShowConfirmModal(false); setTaskToDelete(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Підтвердження</h3>
              <button className="modal-close" onClick={() => { setShowConfirmModal(false); setTaskToDelete(null); }}>
                ×
              </button>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', fontSize: '16px', color: '#2d3748', lineHeight: '1.6' }}>
                Ви впевнені, що хочете видалити задачу?
              </p>
              <div style={{ 
                background: '#f7fafc', 
                padding: '16px', 
                borderRadius: '8px',
                marginBottom: '24px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>Назва задачі:</strong>
                  <div style={{ color: '#2d3748', fontSize: '16px', fontWeight: '600' }}>{taskToDelete.task_name}</div>
                </div>
                <div>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>Планова дата:</strong>
                  <div style={{ color: '#2d3748', fontSize: '16px' }}>{formatDate(taskToDelete.planned_date)}</div>
                </div>
              </div>
              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => { setShowConfirmModal(false); setTaskToDelete(null); }}
                >
                  Скасувати
                </button>
                <button 
                  type="button" 
                  className="btn-primary btn-danger"
                  onClick={handleConfirmDelete}
                >
                  Видалити
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

