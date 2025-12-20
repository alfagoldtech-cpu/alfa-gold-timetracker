import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getRoleById, getUserWithRole, getUserDepartments } from '../lib/users'
import { getAssignedTasksByExecutorAndGroup, createAssignedTask, updateAssignedTask, type AssignedTaskWithDetails } from '../lib/assignedTasks'
import { createTask } from '../lib/tasks'
import { getTaskCategoriesByProject } from '../lib/tasksCategory'
import { getAllClients, getClientWithRelations } from '../lib/clients'
import { getTeamLeadGroupMembers } from '../lib/users'
import { supabase } from '../lib/supabase'
import type { User, Department, Role, TaskCategory, Client } from '../types/database'
import { formatDate, formatDateToUA, formatMonthYear } from '../utils/date'
import { getStatusBadgeClass, getStatusText, getTaskStatus, getTaskTypeText } from '../utils/status'
import { getActualTaskStatusSync } from '../utils/taskStatus'
import { useActiveTask } from '../contexts/ActiveTaskContext'
import { getFullName } from '../utils/user'
import TaskPlayer from '../components/TaskPlayer'
import SkeletonLoader from '../components/SkeletonLoader'
import './AdminPages.css'
import './AdminDashboard.css'

interface EmployeeWithRole extends User {
  role?: Role
  departments?: Department[]
}

export default function EmployeeViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { authUser, user, signOut } = useAuth()
  const { activeTaskId } = useActiveTask()
  const [employee, setEmployee] = useState<EmployeeWithRole | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isTeamLead, setIsTeamLead] = useState(false)

  // Стани для задач співробітника
  const [employeeTasks, setEmployeeTasks] = useState<AssignedTaskWithDetails[]>([])
  const [employeeTasksLoading, setEmployeeTasksLoading] = useState(false)
  const [employeeTasksPeriod, setEmployeeTasksPeriod] = useState<{ type: 'week' | 'month', startDate: Date }>({ type: 'week', startDate: getCurrentWeekMonday() })
  const [employeeTasksPage, setEmployeeTasksPage] = useState(0)
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([])
  const [availableExecutorsForCreate, setAvailableExecutorsForCreate] = useState<User[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [newTaskForm, setNewTaskForm] = useState({
    executor_id: null as number | null,
    planned_date: '',
    task_name: '',
    category_id: null as number | null,
    description: '',
    client_id: null as number | null
  })
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)

  // Допоміжні функції для роботи з датами
  function getCurrentWeekMonday(): Date {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
    const monday = new Date(today.setDate(diff))
    monday.setHours(0, 0, 0, 0)
    return monday
  }

  function addDays(date: Date, days: number): Date {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
  }

  function getWeekDates(startDate: Date): Date[] {
    const dates: Date[] = []
    for (let i = 0; i < 7; i++) {
      dates.push(addDays(startDate, i))
    }
    return dates
  }

  function addMonths(date: Date, months: number): Date {
    const result = new Date(date)
    result.setMonth(result.getMonth() + months)
    return result
  }


  function getAllDatesInMonth(date: Date): Date[] {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const dates: Date[] = []
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      dates.push(new Date(d))
    }
    return dates
  }

  useEffect(() => {
    if (id) {
      loadEmployee(parseInt(id))
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

  useEffect(() => {
    const isMounted = { current: true }
    
    if (employee?.id && user?.id && isTeamLead) {
      loadEmployeeTasks(isMounted)
    }
    
    return () => {
      isMounted.current = false
    }
  }, [employee?.id, user?.id, isTeamLead, employeeTasksPeriod])

  useEffect(() => {
    const isMounted = { current: true }
    
    if (user?.project_id) {
      loadFilterData(isMounted)
    }
    
    return () => {
      isMounted.current = false
    }
  }, [user?.project_id, isTeamLead])

  const loadFilterData = async (isMounted: { current: boolean } = { current: true }) => {
    if (!user?.project_id) return
    try {
      const [categories, allClients] = await Promise.all([
        getTaskCategoriesByProject(user.project_id),
        getAllClients(user.project_id)
      ])
      
      // Перевіряємо монтування перед встановленням стану
      if (!isMounted.current) return
      
      setTaskCategories(categories)
      
      // Фільтруємо клієнтів по відділам тім ліда
      if (isTeamLead && user.id) {
        const teamLeadDepts = await getUserDepartments(user.id)
        
        // Знову перевіряємо монтування після асинхронної операції
        if (!isMounted.current) return
        
        if (teamLeadDepts.length > 0) {
          const teamLeadDeptIds = teamLeadDepts.map(d => d.id)
          
          // Завантажуємо відділи для кожного клієнта та фільтруємо
          const clientsWithDepartments = await Promise.all(
            allClients.map(async (client) => {
              try {
                const clientWithRelations = await getClientWithRelations(client.id)
                return {
                  ...client,
                  departments: clientWithRelations?.departments || []
                }
              } catch (err) {
                console.warn(`Помилка завантаження відділів для клієнта ${client.id}:`, err)
                return {
                  ...client,
                  departments: []
                }
              }
            })
          )
          
          // Перевіряємо монтування після всіх асинхронних операцій
          if (!isMounted.current) return
          
          // Фільтруємо клієнтів за відділами тім ліда
          const filteredClients = clientsWithDepartments.filter(client => {
            const clientDeptIds = client.departments?.map((dept: any) => dept.id) || []
            return clientDeptIds.some((deptId: number) => teamLeadDeptIds.includes(deptId))
          }).map(({ departments, ...client }) => client) // Видаляємо departments з результату
          
          setClients(filteredClients)
        } else {
          // Якщо тім лід не має відділів, показуємо порожній список
          setClients([])
        }
      } else {
        setClients(allClients)
      }
    } catch (err) {
      console.error('Error loading filter data:', err)
    }
  }

  const loadEmployee = async (employeeId: number) => {
    setLoading(true)
    setError(null)
    try {
      const employeeData = await getUserWithRole(employeeId)
      if (employeeData) {
        const depts = await getUserDepartments(employeeId)
        setEmployee({ ...employeeData, departments: depts })
      } else {
        setError('Співробітника не знайдено')
      }
    } catch (err) {
      console.error('Error loading employee:', err)
      setError('Не вдалося завантажити співробітника')
    } finally {
      setLoading(false)
    }
  }

  const loadEmployeeTasks = async (isMounted: { current: boolean } = { current: true }) => {
    if (!employee?.id || !user?.id) return

    if (isMounted.current) {
      setEmployeeTasksLoading(true)
    }
    
    try {
      const tasks = await getAssignedTasksByExecutorAndGroup(employee.id, user.id)
      
      // Перевіряємо монтування перед встановленням стану
      if (!isMounted.current) return
      
      // Сортуємо по датах від меншої до більшої
      tasks.sort((a, b) => {
        const dateA = a.task?.planned_date || ''
        const dateB = b.task?.planned_date || ''
        return dateA.localeCompare(dateB)
      })

      setEmployeeTasks(tasks)
    } catch (err) {
      console.error('Error loading employee tasks:', err)
      if (isMounted.current) {
        setError('Не вдалося завантажити задачі співробітника')
      }
    } finally {
      if (isMounted.current) {
        setEmployeeTasksLoading(false)
      }
    }
  }

  const handleCreateIndividualTask = async () => {
    if (!user?.project_id || !user?.id || !employee?.id) {
      setError('Користувач або співробітник не знайдено')
      return
    }

    if (!newTaskForm.planned_date || !newTaskForm.task_name || !newTaskForm.client_id) {
      setError('Заповніть всі обов\'язкові поля: Дата виконання, Назва задачі, Компанія')
      return
    }

    setError(null)

    try {
      const groupId = isTeamLead ? user.id : (user.group_id || null)
      
      const task = await createTask({
        project_id: user.project_id,
        task_name: newTaskForm.task_name,
        task_type: 'Індивідуальна задача',
        recurrence_type: 'single',
        category_id: newTaskForm.category_id || undefined,
        planned_date: newTaskForm.planned_date,
        description: newTaskForm.description || undefined
      })

      if (!task) {
        setError('Не вдалося створити задачу')
        return
      }

      const assignedTask = await createAssignedTask({
        task_id: task.id,
        client_id: newTaskForm.client_id,
        department_id: null,
        group_id: groupId,
        executor_id: employee.id,
        is_active: true
      })

      if (!assignedTask) {
        setError('Не вдалося призначити задачу')
        return
      }

      await loadEmployeeTasks()
      setShowCreateTaskModal(false)
      setNewTaskForm({
        executor_id: null,
        planned_date: '',
        task_name: '',
        category_id: null,
        description: '',
        client_id: null
      })
      setSuccess('Задачу успішно створено')
    } catch (err: any) {
      console.error('Error creating individual task:', err)
      setError(err.message || 'Помилка створення задачі')
    }
  }

  const handleUpdateExecutor = async (taskId: number, executorId: number | null) => {
    const task = employeeTasks.find(t => t.id === taskId)
    if (!task) return

    const originalExecutorId = task.executor_id
    let executorGroupId: number | null = null

    if (executorId) {
      const executor = availableExecutorsForCreate.find(e => e.id === executorId)
      if (executor) {
        executorGroupId = executor.group_id || null
      }
    }

    setEmployeeTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const newExecutor = executorId 
          ? availableExecutorsForCreate.find(e => e.id === executorId) || undefined
          : undefined
        
        return {
          ...t,
          executor_id: executorId,
          group_id: executorGroupId,
          executor: newExecutor
        }
      }
      return t
    }))

    const updateData: { executor_id: number | null; group_id?: number | null } = { 
      executor_id: executorId,
      group_id: executorGroupId
    }
    
    const success = await updateAssignedTask(taskId, updateData)
    
    if (!success) {
      setEmployeeTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          return { 
            ...t, 
            executor_id: originalExecutorId,
            executor: task.executor
          }
        }
        return t
      }))
      setError('Не вдалося оновити виконавця')
    }
  }

  const handleToggleTaskActive = async (taskId: number) => {
    const task = employeeTasks.find(t => t.id === taskId)
    if (!task) return

    const currentStatus = task.is_active
    const newStatus = !currentStatus

    setEmployeeTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return { ...t, is_active: newStatus }
      }
      return t
    }))

    const success = await updateAssignedTask(taskId, { is_active: newStatus })
    
    if (!success) {
      setEmployeeTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          return { ...t, is_active: currentStatus }
        }
        return t
      }))
      setError('Не вдалося змінити статус задачі')
    } else {
      if (!newStatus) {
        setEditingTaskId(null)
      }
    }
  }

  useEffect(() => {
    const loadExecutors = async () => {
      if (!user?.project_id || !user?.id || !user?.role_id) return
      try {
        const role = await getRoleById(user.role_id)
        const isTeamLeadRole = role?.role_name === 'Тім лід'
        
        let executors: User[] = []
        if (isTeamLeadRole) {
          executors = await getTeamLeadGroupMembers(user.id)
        } else {
          // Для не-тім ліда завантажуємо всіх виконавців
          const { data } = await supabase
            .from('users')
            .select('*')
            .neq('role_id', 1)
            .neq('role_id', 2)
          executors = data || []
        }
        setAvailableExecutorsForCreate(executors)
      } catch (err) {
        console.error('Error loading executors:', err)
      }
    }
    loadExecutors()
  }, [user?.project_id, user?.id, user?.role_id])

  const handleSignOut = async () => {
    try {
      await signOut()
      window.location.href = '/login?logout=true'
    } catch (error) {
      console.error('Error signing out:', error)
      window.location.href = '/login?logout=true'
    }
  }

  // Фільтруємо задачі за періодом
  const filteredTasks = useMemo(() => {
    if (employeeTasksPeriod.type === 'week') {
      const weekDates = getWeekDates(employeeTasksPeriod.startDate)
      const weekDateStrings = weekDates.map(d => d.toISOString().split('T')[0])
      return employeeTasks.filter(task => {
        const taskDate = task.task?.planned_date
        if (!taskDate) return false
        const taskDateStr = taskDate.split('T')[0]
        return weekDateStrings.includes(taskDateStr)
      })
    } else {
      const monthDates = getAllDatesInMonth(employeeTasksPeriod.startDate)
      const monthDateStrings = monthDates.map(d => d.toISOString().split('T')[0])
      return employeeTasks.filter(task => {
        const taskDate = task.task?.planned_date
        if (!taskDate) return false
        const taskDateStr = taskDate.split('T')[0]
        return monthDateStrings.includes(taskDateStr)
      })
    }
  }, [employeeTasks, employeeTasksPeriod])

  // Пагінація задач
  const TASKS_PER_PAGE = 25
  const currentPage = employeeTasksPage
  const startIndex = currentPage * TASKS_PER_PAGE
  const endIndex = startIndex + TASKS_PER_PAGE
  const paginatedTasks = filteredTasks.slice(startIndex, endIndex)
  const totalPages = Math.ceil(filteredTasks.length / TASKS_PER_PAGE)

  if (loading) {
    return (
      <div className="admin-page">
        <div style={{ padding: '24px' }}>
          <SkeletonLoader type="card" />
        </div>
      </div>
    )
  }

  if (!employee) {
    return (
      <div className="admin-page">
        <div className="alert alert-error">
          {error || 'Співробітника не знайдено'}
        </div>
        <button className="btn-secondary" onClick={() => navigate('/dashboard')} style={{ marginTop: '20px' }}>
          Назад до співробітників
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
          <Link to="/change-password" className="btn-link">
            Змінити пароль
          </Link>
          <button onClick={handleSignOut} className="btn-logout">
            Вийти
          </button>
        </div>
      </header>

      {sidebarOpen && (
        <>
          <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}></div>
          <div className="sidebar-nav">
            <div className="sidebar-nav-header">
              <h2>Меню</h2>
              <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
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
                  navigate('/dashboard?tab=employees'); 
                  setSidebarOpen(false); 
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
                  navigate('/dashboard?tab=clients'); 
                  setSidebarOpen(false); 
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
                  navigate('/dashboard?tab=calendar'); 
                  setSidebarOpen(false); 
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
                      navigate('/dashboard?tab=calendar'); 
                      setSidebarOpen(false); 
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
                      navigate('/dashboard?tab=task-calendar'); 
                      setSidebarOpen(false); 
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
                  navigate('/dashboard?tab=my-calendar'); 
                  setSidebarOpen(false); 
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
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <div className="project-header-section">
            <div className="project-header-left">
              <h2>Карточка співробітника: {getFullName(employee)}</h2>
            </div>
            <div className="project-header-right">
              <button className="btn-back" onClick={() => navigate('/dashboard?tab=employees')}>
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
                  <label>ПІБ:</label>
                  <span>{getFullName(employee)}</span>
                </div>
                <div className="card-field">
                  <label>Email:</label>
                  <span>{employee.email || '-'}</span>
                </div>
              </div>
              <div className="card-row">
                <div className="card-field">
                  <label>Телефон:</label>
                  <span>{employee.phone || '-'}</span>
                </div>
                <div className="card-field">
                  <label>Роль:</label>
                  <span>{employee.role?.role_name || '-'}</span>
                </div>
              </div>
              <div className="card-row">
                <div className="card-field">
                  <label>Статус:</label>
                  <span className={`status-badge ${getStatusBadgeClass(employee.status)}`}>
                    {getStatusText(employee.status)}
                  </span>
                </div>
                <div className="card-field">
                  <label>Дата реєстрації:</label>
                  <span>{formatDate(employee.date_added)}</span>
                </div>
              </div>
            </div>

            {employee.departments && employee.departments.length > 0 && (
              <div className="card-section">
                <h4>Відділи</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {employee.departments.map((dept) => (
                    <span key={dept.id} className="status-badge" style={{ background: '#e6f2ff', color: '#2c5282', fontSize: '12px', padding: '6px 12px' }}>
                      {dept.department_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Секція задач співробітника */}
          {isTeamLead && employee.id && (
            <div className="card-section" style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ margin: 0 }}>Задачі співробітника</h4>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      setShowCreateTaskModal(true)
                      setNewTaskForm({ ...newTaskForm, executor_id: employee.id })
                    }}
                    style={{
                      padding: '6px 12px',
                      background: '#4299e1',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    ➕ Створити задачу
                  </button>
                </div>
              </div>

              {/* Навігація по періодах */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      const newStartDate = employeeTasksPeriod.type === 'week' 
                        ? addDays(employeeTasksPeriod.startDate, -7)
                        : addMonths(employeeTasksPeriod.startDate, -1)
                      setEmployeeTasksPeriod({ ...employeeTasksPeriod, startDate: newStartDate })
                      setEmployeeTasksPage(0)
                    }}
                    style={{
                      padding: '6px 12px',
                      background: '#f7fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    ← Попередній
                  </button>
                  <div style={{ 
                    padding: '6px 16px',
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#2d3748'
                  }}>
                    {employeeTasksPeriod.type === 'month' 
                      ? formatMonthYear(employeeTasksPeriod.startDate)
                      : `${formatDateToUA(employeeTasksPeriod.startDate.toISOString().split('T')[0])} - ${formatDateToUA(addDays(employeeTasksPeriod.startDate, 6).toISOString().split('T')[0])}`
                    }
                  </div>
                  <button
                    onClick={() => {
                      const newStartDate = employeeTasksPeriod.type === 'week' 
                        ? addDays(employeeTasksPeriod.startDate, 7)
                        : addMonths(employeeTasksPeriod.startDate, 1)
                      setEmployeeTasksPeriod({ ...employeeTasksPeriod, startDate: newStartDate })
                      setEmployeeTasksPage(0)
                    }}
                    style={{
                      padding: '6px 12px',
                      background: '#f7fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Наступний →
                  </button>
                  <button
                    onClick={() => {
                      const newType = employeeTasksPeriod.type === 'week' ? 'month' : 'week'
                      let newStartDate: Date
                      if (newType === 'week') {
                        newStartDate = getCurrentWeekMonday()
                      } else {
                        const today = new Date()
                        newStartDate = new Date(today.getFullYear(), today.getMonth(), 1)
                      }
                      setEmployeeTasksPeriod({ type: newType, startDate: newStartDate })
                      setEmployeeTasksPage(0)
                    }}
                    style={{
                      padding: '6px 12px',
                      background: '#4299e1',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    {employeeTasksPeriod.type === 'week' ? 'Показати місяць' : 'Показати тиждень'}
                  </button>
                </div>
              </div>

              {/* Список задач */}
              {employeeTasksLoading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>Завантаження...</div>
              ) : (
                <>
                  {filteredTasks.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#718096' }}>
                      Немає задач для цього періоду
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                        {paginatedTasks.map(task => {
                          // Використовуємо уніфіковану логіку визначення статусу
                          const status = getActualTaskStatusSync(task, activeTaskId)
                          const taskDate = task.task?.planned_date 
                            ? formatDateToUA(task.task.planned_date.split('T')[0])
                            : 'Не вказано'
                          const clientName = task.client?.legal_name || 'Не вказано'

                          return (
                            <div
                              key={task.id}
                              style={{
                                padding: '16px',
                                background: task.is_active ? '#ffffff' : '#f0f0f0',
                                borderRadius: '8px',
                                border: `1px solid ${task.is_active ? '#e2e8f0' : '#d0d0d0'}`,
                                opacity: task.is_active ? 1 : 0.7
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div style={{ flex: 1 }}>
                                  <h4 style={{ 
                                    fontSize: '16px', 
                                    fontWeight: '600', 
                                    color: task.is_active ? '#2d3748' : '#a0aec0',
                                    marginBottom: '8px'
                                  }}>
                                    {task.task?.task_name || `Задача #${task.task_id}`}
                                  </h4>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '14px', color: task.is_active ? '#718096' : '#a0aec0' }}>
                                    <span><strong>Дата:</strong> {taskDate}</span>
                                    <span><strong>Клієнт:</strong> {clientName}</span>
                                    {task.task?.task_type && (
                                      <span><strong>Тип:</strong> {getTaskTypeText(task.task.task_type)}</span>
                                    )}
                                  </div>
                                  {task.task?.description && (
                                    <p style={{ marginTop: '8px', fontSize: '14px', color: task.is_active ? '#4a5568' : '#a0aec0', lineHeight: '1.5' }}>
                                      {task.task.description}
                                    </p>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span className={`status-badge ${getStatusBadgeClass(status)}`} style={{ marginLeft: '12px' }}>
                                    {getStatusText(status)}
                                  </span>
                                  <button
                                    onClick={() => setEditingTaskId(task.id)}
                                    style={{
                                      padding: '6px 12px',
                                      background: '#4299e1',
                                      border: 'none',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontSize: '12px',
                                      fontWeight: '500',
                                      color: '#ffffff'
                                    }}
                                  >
                                    ✏️ Редагувати
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Пагінація задач */}
                      {totalPages > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '12px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                          <button
                            onClick={() => setEmployeeTasksPage(Math.max(0, currentPage - 1))}
                            disabled={currentPage === 0}
                            style={{
                              padding: '6px 12px',
                              background: currentPage === 0 ? '#f7fafc' : '#4299e1',
                              color: currentPage === 0 ? '#a0aec0' : '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
                              fontSize: '14px'
                            }}
                          >
                            ← Попередня
                          </button>
                          <span style={{ fontSize: '14px', color: '#2d3748' }}>
                            Сторінка {currentPage + 1} з {totalPages} (всього задач: {filteredTasks.length})
                          </span>
                          <button
                            onClick={() => setEmployeeTasksPage(Math.min(totalPages - 1, currentPage + 1))}
                            disabled={currentPage >= totalPages - 1}
                            style={{
                              padding: '6px 12px',
                              background: currentPage >= totalPages - 1 ? '#f7fafc' : '#4299e1',
                              color: currentPage >= totalPages - 1 ? '#a0aec0' : '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: currentPage >= totalPages - 1 ? 'not-allowed' : 'pointer',
                              fontSize: '14px'
                            }}
                          >
                            Наступна →
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Модальне вікно створення задачі */}
      {showCreateTaskModal && (
        <div className="modal-overlay" onClick={() => { setShowCreateTaskModal(false); setError(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>Створити індивідуальну задачу</h3>
              <button className="modal-close" onClick={() => { setShowCreateTaskModal(false); setError(null); }}>×</button>
            </div>
            <div style={{ padding: '24px' }}>
              {error && (
                <div style={{ padding: '12px', background: '#fed7d7', color: '#c53030', borderRadius: '6px', marginBottom: '16px' }}>
                  {error}
                </div>
              )}

              <div className="form-group">
                <label>Дата виконання *</label>
                <input
                  type="date"
                  value={newTaskForm.planned_date}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, planned_date: e.target.value })}
                  style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', width: '100%' }}
                />
              </div>

              <div className="form-group">
                <label>Назва задачі *</label>
                <input
                  type="text"
                  value={newTaskForm.task_name}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, task_name: e.target.value })}
                  placeholder="Введіть назву задачі"
                  style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', width: '100%' }}
                />
              </div>

              <div className="form-group">
                <label>Компанія *</label>
                <select
                  value={newTaskForm.client_id || ''}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, client_id: e.target.value ? Number(e.target.value) : null })}
                  style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', width: '100%' }}
                >
                  <option value="">Оберіть компанію</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.legal_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Категорія</label>
                <select
                  value={newTaskForm.category_id || ''}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, category_id: e.target.value ? Number(e.target.value) : null })}
                  style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', width: '100%' }}
                >
                  <option value="">Оберіть категорію (необов'язково)</option>
                  {taskCategories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Опис</label>
                <textarea
                  value={newTaskForm.description}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })}
                  placeholder="Введіть опис задачі (необов'язково)"
                  rows={4}
                  style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '14px', width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => { setShowCreateTaskModal(false); setError(null); }}>
                  Скасувати
                </button>
                <button className="btn-primary" onClick={handleCreateIndividualTask} style={{ background: '#4299e1', color: '#ffffff' }}>
                  Створити задачу
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальне вікно редагування задачі */}
      {editingTaskId && (() => {
        const task = employeeTasks.find(t => t.id === editingTaskId)
        if (!task) return null

        const taskName = task.task?.task_name || `Задача #${task.task_id}`
        const taskType = task.task?.task_type || 'Планова задача'

        return (
          <div className="modal-overlay" onClick={() => setEditingTaskId(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
              <div className="modal-header">
                <h3>Редагувати задачу</h3>
                <button className="modal-close" onClick={() => setEditingTaskId(null)}>×</button>
              </div>
              <div style={{ padding: '24px' }}>
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#2d3748', margin: 0 }}>
                      {taskName}
                    </h4>
                    {task.task?.task_type && (
                      <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: '#e6f3ff', color: '#2c5282', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {getTaskTypeText(taskType)}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '14px', color: '#718096' }}>
                    Клієнт: <span style={{ fontWeight: '500', color: '#4a5568' }}>{task.client?.legal_name || 'Не вказано'}</span>
                  </p>
                </div>

                <div className="form-group">
                  <label>Виконавець</label>
                  <select
                    value={task.executor_id || ''}
                    onChange={(e) => {
                      const executorId = e.target.value ? Number(e.target.value) : null
                      handleUpdateExecutor(task.id, executorId)
                    }}
                    style={{ padding: '12px 16px', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '15px', background: 'white', color: '#2d3748', fontWeight: '500', width: '100%', cursor: 'pointer' }}
                  >
                    <option value="">Не призначено</option>
                    {availableExecutorsForCreate.map((executor) => {
                      const fullName = [executor.surname, executor.name, executor.middle_name].filter(Boolean).join(' ') || executor.email
                      return (
                        <option key={executor.id} value={executor.id}>
                          {fullName}
                        </option>
                      )
                    })}
                  </select>
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={task.is_active}
                      onChange={() => handleToggleTaskActive(task.id)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span>Активна задача</span>
                  </label>
                  <p style={{ fontSize: '12px', color: '#718096', marginTop: '4px', marginLeft: '26px' }}>
                    {task.is_active ? 'Задача активна і відображається в календарі' : 'Задача деактивована і не відображається в календарі'}
                  </p>
                </div>

                <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => setEditingTaskId(null)}>
                    Закрити
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
      
      {/* Плеер задачі - відображається при активній задачі */}
      <TaskPlayer />
    </div>
  )
}

