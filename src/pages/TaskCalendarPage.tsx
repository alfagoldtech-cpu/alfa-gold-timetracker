import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getActiveAssignedTasksForTeamLead, updateAssignedTask, createAssignedTask, type AssignedTaskWithDetails } from '../lib/assignedTasks'
import { getUsersByProject, getTeamLeadGroupMembers, getRoleById, getUserDepartments } from '../lib/users'
import { getGroupCompaniesByProject } from '../lib/groupCompanies'
import { getClientWithRelations } from '../lib/clients'
import { useClients, useClientsDepartments } from '../hooks/useClients'
import { createTask } from '../lib/tasks'
import { getTaskCategoriesByProject } from '../lib/tasksCategory'
import { getTaskTimeStats } from '../lib/taskTimeLogs'
import { formatDateToUA, formatMinutesToHoursMinutes, getCurrentWeekMonday, addDays, getWeekDates, getAllDatesInMonth, formatDateKey, isToday, formatMonthYear } from '../utils/date'
import { getStatusBadgeClass, getStatusText, getTaskTypeText, getTaskStatus } from '../utils/status'
import { getActualTaskStatusSync } from '../utils/taskStatus'
import { useActiveTask } from '../contexts/ActiveTaskContext'
import type { User, GroupCompany, Client, Department, TaskCategory } from '../types/database'
import TaskPlayer from '../components/TaskPlayer'
import SkeletonLoader from '../components/SkeletonLoader'
import { List } from 'react-window'
import './AdminPages.css'
import './ManagerDashboard.css'


const formatWeekRange = (startDate: Date): string => {
  const endDate = addDays(startDate, 6)
  const start = formatDateToUA(formatDateKey(startDate))
  const end = formatDateToUA(formatDateKey(endDate))
  return `${start} - ${end}`
}

const getDayName = (date: Date): string => {
  const days = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота']
  return days[date.getDay()]
}

// Функція для сортування задач по назві (алфавітне)
const sortTasksByName = (tasks: AssignedTaskWithDetails[]): AssignedTaskWithDetails[] => {
  return [...tasks].sort((a, b) => {
    const nameA = a.task?.task_name || `Задача #${a.task_id}`
    const nameB = b.task?.task_name || `Задача #${b.task_id}`
    return nameA.localeCompare(nameB, 'uk-UA', { sensitivity: 'base' })
  })
}

// Функції для роботи з місяцями
const addMonths = (date: Date, months: number): Date => {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

// Функція для автоматичного визначення статусу задачі

export default function TaskCalendarPage() {
  const { user } = useAuth()
  const { activeTaskId } = useActiveTask()
  const [assignedTasks, setAssignedTasks] = useState<AssignedTaskWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [taskTimeStats, setTaskTimeStats] = useState<Map<number, { totalMinutes: number; status: string | null; completionDate: string | null }>>(new Map())
  
  // Пагінація та відображення
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getCurrentWeekMonday())
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
  const [showFullMonth, setShowFullMonth] = useState(false)
  
  // Фільтри
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [executorFilter, setExecutorFilter] = useState<number | null>(null)
  const [groupCompanyFilter, setGroupCompanyFilter] = useState<number | null>(null)
  const [clientFilter, setClientFilter] = useState<number | null>(null)
  const [taskTypeFilter, setTaskTypeFilter] = useState<string | null>(null)
  
  // Дані для фільтрів
  const [groupCompanies, setGroupCompanies] = useState<GroupCompany[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [teamLeadDepartments, setTeamLeadDepartments] = useState<Department[]>([])
  
  // Ліміт карток на дату та розгорнуті дати
  const TASKS_PER_DATE_LIMIT = 12
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set()) // Accordion - відкриті дати
  const [showAllTasksForDate, setShowAllTasksForDate] = useState<Set<string>>(new Set()) // Показати всі задачі для дати
  
  // Редагування задачі
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [availableExecutors, setAvailableExecutors] = useState<User[]>([])
  const [isTeamLead, setIsTeamLead] = useState(false)
  
  // Створення індивідуальної задачі
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([])
  const [newTaskForm, setNewTaskForm] = useState({
    executor_id: null as number | null,
    planned_date: '',
    task_name: '',
    category_id: null as number | null,
    description: '',
    client_id: null as number | null
  })

  // Групуємо задачі по датах
  const groupTasksByDate = (tasks: AssignedTaskWithDetails[]): Map<string, AssignedTaskWithDetails[]> => {
    const grouped = new Map<string, AssignedTaskWithDetails[]>()
    
    tasks.forEach(task => {
      const taskDate = task.task?.planned_date
      if (!taskDate) return
      
      let dateKey = taskDate
      if (taskDate.includes('T')) {
        dateKey = taskDate.split('T')[0]
      } else if (taskDate.includes(' ')) {
        dateKey = taskDate.split(' ')[0]
      }
      
      if (!dateKey.match(/^\d{4}-\d{2}-\d{2}$/)) return
      
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, [])
      }
      grouped.get(dateKey)!.push(task)
    })
    
    // Сортуємо задачі всередині кожної дати по назві
    grouped.forEach((tasks, dateKey) => {
      grouped.set(dateKey, sortTasksByName(tasks))
    })
    
    return grouped
  }

  const loadData = async () => {
    if (!user?.id) {
      setError('Користувач не знайдено')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Визначаємо діапазон дат для фільтрації
      let startDate: Date | undefined
      let endDate: Date | undefined
      
      if (showFullMonth) {
        // Для місяця: перший і останній день місяця
        startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
        endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
      } else {
        // Для тижня: понеділок і неділя
        startDate = currentWeekStart
        endDate = addDays(currentWeekStart, 6)
      }
      
      const tasks = await getActiveAssignedTasksForTeamLead(user.id, startDate, endDate)
      console.log('Loaded tasks:', tasks.length)
      const tasksWithoutExecutor = tasks.filter(t => !t.executor_id)
      console.log('Tasks without executor:', tasksWithoutExecutor.length)
      tasksWithoutExecutor.forEach(task => {
        console.log('Task without executor:', {
          id: task.id,
          task_id: task.task_id,
          group_id: task.group_id,
          executor_id: task.executor_id,
          planned_date: task.task?.planned_date,
          task_name: task.task?.task_name
        })
      })
      setAssignedTasks(tasks) // Завантажуємо задачі для поточного періоду (вже відфільтровані)
      
      // Завантажуємо статистику часу для задач поточного періоду
      const statsPromises = tasks.map(async (task) => {
        try {
          const stats = await getTaskTimeStats(task.id)
          return { taskId: task.id, stats }
        } catch (err) {
          console.error(`Error loading stats for task ${task.id}:`, err)
          return { taskId: task.id, stats: null }
        }
      })
      
      const statsResults = await Promise.allSettled(statsPromises)
      const statsMap = new Map<number, { totalMinutes: number; status: string | null; completionDate: string | null }>()
      
      statsResults.forEach((result) => {
        if (result.status === 'fulfilled' && result.value.stats) {
          statsMap.set(result.value.taskId, result.value.stats)
        }
      })
      
      setTaskTimeStats(statsMap)
    } catch (err) {
      console.error('Error loading assigned tasks:', err)
      setError('Не вдалося завантажити задачі')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user?.id, currentWeekStart, currentMonth, showFullMonth])

  // Завантажуємо категорії задач
  useEffect(() => {
    const loadCategories = async () => {
      if (!user?.project_id) return
      try {
        const categories = await getTaskCategoriesByProject(user.project_id)
        setTaskCategories(categories)
      } catch (err) {
        console.error('Error loading task categories:', err)
      }
    }
    loadCategories()
  }, [user?.project_id])

  // Завантажуємо групи компаній та клієнтів для фільтрів
  useEffect(() => {
    const loadFilterData = async () => {
      if (!user?.project_id || !user?.id || !user?.role_id) return

      try {
        // Спочатку визначаємо роль
        let isTeamLeadRole = false
        try {
          const role = await getRoleById(user.role_id)
          if (role) {
            isTeamLeadRole = role.role_name === 'Тім лід'
          }
        } catch (error) {
          console.error('Error checking user role:', error)
        }

        // Завантажуємо відділи тім ліда, якщо він є тім лідом
        let teamLeadDepts: Department[] = []
        if (isTeamLeadRole) {
          teamLeadDepts = await getUserDepartments(user.id)
          setTeamLeadDepartments(teamLeadDepts)
        }

        // Використовуємо дані з React Query кешу (allClients та departmentsMap вже завантажені через хуки)
        // Для тім ліда фільтруємо клієнтів за відділами
        let filteredClients = allClients
        if (isTeamLeadRole && teamLeadDepts.length > 0) {
          const teamLeadDeptIds = teamLeadDepts.map(dept => dept.id)
          
          // Додаємо відділи до клієнтів (використовуємо дані з кешу)
          const clientsWithDepartments = allClients.map((client: Client) => ({
            ...client,
            departments: departmentsMap.get(client.id) || []
          }))
          
          // Фільтруємо клієнтів за відділами тім ліда
          filteredClients = clientsWithDepartments.filter((client: Client & { departments?: Department[] }) => {
            const clientDeptIds = client.departments?.map((dept: Department) => dept.id) || []
            return clientDeptIds.some((deptId: number) => teamLeadDeptIds.includes(deptId))
          }).map(({ departments, ...client }: { departments?: Department[] }) => client) // Видаляємо departments з результату
        } else if (isTeamLeadRole) {
          // Якщо тім лід не має відділів, показуємо порожній список
          filteredClients = []
        }
        
        setClients(filteredClients)
        
        // Фільтруємо групи компаній - тільки ті, які належать до відфільтрованих клієнтів
        const filteredClientGroupIds = new Set(filteredClients.map(c => c.group_company_id).filter(Boolean))
        const allGroupCompanies = await getGroupCompaniesByProject(user.project_id)
        const filteredGroupCompanies = allGroupCompanies.filter(group => 
          filteredClientGroupIds.has(group.id)
        )
        setGroupCompanies(filteredGroupCompanies)
      } catch (err) {
        console.error('Error loading filter data:', err)
      }
    }
    loadFilterData()
  }, [user?.project_id, user?.id, user?.role_id])

  // Завантажуємо виконавців для редагування
  useEffect(() => {
    const loadExecutors = async () => {
      if (!user?.project_id || !user?.id || !user?.role_id) return

      try {
        // Спочатку визначаємо роль користувача
        let isTeamLeadRole = false
        try {
          const role = await getRoleById(user.role_id)
          if (role) {
            isTeamLeadRole = role.role_name === 'Тім лід'
            setIsTeamLead(isTeamLeadRole)
          }
        } catch (error) {
          console.error('Error checking user role:', error)
          setIsTeamLead(false)
        }

        let executors: User[] = []

        if (isTeamLeadRole) {
          // Для тім ліда - тільки співробітники його групи
          executors = await getTeamLeadGroupMembers(user.id)
        } else {
          // Для інших ролей - всі виконавці з проекту (виключаємо адміністраторів та керівників виробництва)
          const allExecutors = await getUsersByProject(user.project_id)
          executors = allExecutors.filter(u => u.role_id !== 1 && u.role_id !== 2)
        }

        setAvailableExecutors(executors)
      } catch (err) {
        console.error('Error loading executors:', err)
      }
    }
    loadExecutors()
  }, [user?.project_id, user?.id, user?.role_id])

  // Фільтруємо задачі
  const filteredTasks = useMemo(() => {
    return assignedTasks.filter(task => {
      if (statusFilter) {
        const taskStatus = getActualTaskStatusSync(task, activeTaskId)
        if (taskStatus !== statusFilter) return false
      }
      if (executorFilter && task.executor_id !== executorFilter) return false
      if (groupCompanyFilter && task.client?.group_company_id !== groupCompanyFilter) return false
      if (clientFilter && task.client_id !== clientFilter) return false
      if (taskTypeFilter && task.task?.task_type !== taskTypeFilter) return false
      return true
    })
  }, [assignedTasks, statusFilter, executorFilter, groupCompanyFilter, clientFilter, taskTypeFilter])

  // Групуємо по датах
  const groupedByDate = useMemo(() => {
    return groupTasksByDate(filteredTasks)
  }, [filteredTasks])

  // Отримуємо дати для відображення
  const datesToShow = useMemo(() => {
    if (showFullMonth) {
      return getAllDatesInMonth(currentMonth)
    }
    return getWeekDates(currentWeekStart)
  }, [showFullMonth, currentWeekStart, currentMonth])

  // Навігація - змінюємо логіку
  const handlePrev = () => {
    if (showFullMonth) {
      setCurrentMonth(prev => addMonths(prev, -1))
    } else {
      setCurrentWeekStart(prev => addDays(prev, -7))
    }
  }

  const handleNext = () => {
    if (showFullMonth) {
      setCurrentMonth(prev => addMonths(prev, 1))
    } else {
      setCurrentWeekStart(prev => addDays(prev, 7))
    }
  }

  const handleToday = () => {
    setCurrentWeekStart(getCurrentWeekMonday())
    setCurrentMonth(new Date())
    setShowFullMonth(false)
  }

  // Функція для перемикання відкриття/закриття дати (accordion)
  const toggleDateGroup = (dateKey: string) => {
    setExpandedDates(prev => {
      const newSet = new Set(prev)
      if (newSet.has(dateKey)) {
        newSet.delete(dateKey)
        // Також закриваємо "показати всі" при закритті дати
        setShowAllTasksForDate(prevAll => {
          const newAllSet = new Set(prevAll)
          newAllSet.delete(dateKey)
          return newAllSet
        })
      } else {
        newSet.add(dateKey)
      }
      return newSet
    })
  }

  // Функція для перемикання "показати всі задачі"
  const toggleShowAllTasks = (dateKey: string, e: React.MouseEvent) => {
    e.stopPropagation() // Зупиняємо вспливання події до toggleDateGroup
    setShowAllTasksForDate(prev => {
      const newSet = new Set(prev)
      if (newSet.has(dateKey)) {
        newSet.delete(dateKey)
      } else {
        newSet.add(dateKey)
      }
      return newSet
    })
  }

  // Отримуємо унікальних виконавців для фільтра
  const uniqueExecutors = useMemo(() => {
    const executorsMap = new Map<number, AssignedTaskWithDetails['executor']>()
    assignedTasks.forEach(task => {
      if (task.executor && task.executor_id) {
        executorsMap.set(task.executor_id, task.executor)
      }
    })
    return Array.from(executorsMap.entries()).map(([id, executor]) => ({ id, executor: executor! }))
  }, [assignedTasks])

  // Отримуємо унікальні статуси для фільтра (включаючи автоматично визначені)
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set<string>()
    assignedTasks.forEach(task => {
      const status = getActualTaskStatusSync(task, activeTaskId)
      statuses.add(status)
    })
    return Array.from(statuses)
  }, [assignedTasks, activeTaskId])

  // Отримуємо унікальні типи задач для фільтра
  const uniqueTaskTypes = useMemo(() => {
    const types = new Set<string>()
    assignedTasks.forEach(task => {
      const taskType = task.task?.task_type || 'Планова задача'
      types.add(taskType)
    })
    return Array.from(types).sort()
  }, [assignedTasks])

  // Функція для відображення назви періоду
  const getPeriodLabel = () => {
    if (showFullMonth) {
      return currentMonth.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })
    }
    return formatWeekRange(currentWeekStart)
  }

  // Функція для створення індивідуальної задачі
  const handleCreateIndividualTask = async () => {
    if (!user?.project_id || !user?.id) {
      setError('Користувач не знайдено')
      return
    }

    if (!newTaskForm.executor_id || !newTaskForm.planned_date || !newTaskForm.task_name || !newTaskForm.client_id) {
      setError('Заповніть всі обов\'язкові поля: Виконавець, Дата виконання, Назва задачі, Компанія')
      return
    }

    setError(null)

    try {
      // Визначаємо group_id
      const groupId = isTeamLead ? user.id : (user.group_id || null)
      
      // Створюємо задачу
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

      // Створюємо призначену задачу
      const assignedTask = await createAssignedTask({
        task_id: task.id,
        client_id: newTaskForm.client_id,
        department_id: null,
        group_id: groupId,
        executor_id: newTaskForm.executor_id,
        is_active: true
      })

      if (!assignedTask) {
        setError('Не вдалося призначити задачу')
        return
      }

      // Оновлюємо список задач
      await loadData()

      // Закриваємо модальне вікно та очищаємо форму
      setShowCreateTaskModal(false)
      setNewTaskForm({
        executor_id: null,
        planned_date: '',
        task_name: '',
        category_id: null,
        description: '',
        client_id: null
      })
    } catch (err: any) {
      console.error('Error creating individual task:', err)
      setError(err.message || 'Помилка створення задачі')
    }
  }

  // Функція для оновлення виконавця задачі
  const handleUpdateExecutor = async (taskId: number, executorId: number | null) => {
    const task = assignedTasks.find(t => t.id === taskId)
    if (!task) return

    const originalExecutorId = task.executor_id
    let executorGroupId: number | null = null

    if (executorId) {
      const executor = availableExecutors.find(e => e.id === executorId)
      if (executor) {
        executorGroupId = executor.group_id || null
      }
    }

    // Оптимістичне оновлення
    setAssignedTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const newExecutor = executorId 
          ? availableExecutors.find(e => e.id === executorId) || undefined
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

    // Оновлюємо в БД
    const updateData: { executor_id: number | null; group_id?: number | null } = { 
      executor_id: executorId,
      group_id: executorGroupId
    }
    
    const success = await updateAssignedTask(taskId, updateData)
    
    if (!success) {
      // Відкат змін при помилці
      setAssignedTasks(prev => prev.map(t => {
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

  // Функція для деактивації/активації задачі
  const handleToggleTaskActive = async (taskId: number) => {
    const task = assignedTasks.find(t => t.id === taskId)
    if (!task) return

    const currentStatus = task.is_active
    const newStatus = !currentStatus

    // Оптимістичне оновлення
    setAssignedTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return { ...t, is_active: newStatus }
      }
      return t
    }))

    const success = await updateAssignedTask(taskId, { is_active: newStatus })
    
    if (!success) {
      // Відкат змін при помилці
      setAssignedTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          return { ...t, is_active: currentStatus }
        }
        return t
      }))
      setError('Не вдалося змінити статус задачі')
    } else {
      // Якщо задача деактивована, закриваємо модальне вікно
      if (!newStatus) {
        setEditingTaskId(null)
      }
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div style={{ padding: '24px' }}>
          <SkeletonLoader type="card" />
          <div style={{ marginTop: '24px' }}>
            <SkeletonLoader type="list" rows={5} />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-page">
        <div className="error-message">{error}</div>
      </div>
    )
  }

  return (
    <div className="admin-page">
      {/* Заголовок */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#2d3748', marginBottom: '8px' }}>
              Календар задач
            </h1>
            <p style={{ color: '#718096', fontSize: '14px' }}>
              Активні призначені задачі, згруповані по датах
            </p>
          </div>
          <button
            onClick={() => setShowCreateTaskModal(true)}
            style={{
              padding: '10px 20px',
              background: '#4299e1',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(66, 153, 225, 0.2)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#3182ce'
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(66, 153, 225, 0.3)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#4299e1'
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(66, 153, 225, 0.2)'
            }}
          >
            <span style={{ fontSize: '18px' }}>➕</span>
            Створити задачу
          </button>
        </div>
      </div>

      {/* Навігація */}
        <div style={{ 
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        padding: '16px',
        background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handlePrev}
            style={{
              padding: '8px 16px',
              background: '#f7fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              color: '#2d3748',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#edf2f7'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f7fafc'
            }}
          >
            ← {showFullMonth ? 'Попередній місяць' : 'Попередній'}
          </button>
          
          <button
            onClick={handleToday}
            style={{
              padding: '8px 16px',
              background: '#4299e1',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              color: '#ffffff',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#3182ce'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#4299e1'
            }}
          >
            Сьогодні
          </button>
          
          <button
            onClick={handleNext}
            style={{
              padding: '8px 16px',
              background: '#f7fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              color: '#2d3748',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#edf2f7'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#f7fafc'
            }}
          >
            {showFullMonth ? 'Наступний місяць' : 'Наступний'} →
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '16px', fontWeight: '600', color: '#2d3748' }}>
            {showFullMonth 
              ? `Місяць: ${getPeriodLabel()}`
              : getPeriodLabel()
            }
          </span>
          
          <button
            onClick={() => {
              setShowFullMonth(!showFullMonth)
              if (!showFullMonth) {
                setCurrentMonth(new Date())
              }
            }}
            style={{
              padding: '8px 16px',
              background: showFullMonth ? '#4299e1' : '#f7fafc',
              border: `1px solid ${showFullMonth ? '#4299e1' : '#e2e8f0'}`,
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              color: showFullMonth ? '#ffffff' : '#2d3748',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!showFullMonth) {
                e.currentTarget.style.background = '#edf2f7'
              }
            }}
            onMouseLeave={(e) => {
              if (!showFullMonth) {
                e.currentTarget.style.background = '#f7fafc'
              }
            }}
          >
            {showFullMonth ? 'Показати тиждень' : 'Показати весь місяць'}
          </button>
        </div>
      </div>

      {/* Фільтри */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '20px',
        padding: '16px',
        background: '#ffffff',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', color: '#4a5568' }}>
            Статус:
          </label>
          <select
            value={statusFilter || ''}
            onChange={(e) => setStatusFilter(e.target.value || null)}
            style={{
              padding: '6px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
              background: '#ffffff',
              cursor: 'pointer'
            }}
          >
            <option value="">Всі статуси</option>
            {uniqueStatuses.map(status => (
              <option key={status} value={status}>
                {getStatusText(status)}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', color: '#4a5568' }}>
            Тип задачі:
          </label>
          <select
            value={taskTypeFilter || ''}
            onChange={(e) => setTaskTypeFilter(e.target.value || null)}
            style={{
              padding: '6px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
              background: '#ffffff',
              cursor: 'pointer'
            }}
          >
            <option value="">Всі типи</option>
            {uniqueTaskTypes.map(taskType => (
              <option key={taskType} value={taskType}>
                {getTaskTypeText(taskType)}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', color: '#4a5568' }}>
            Виконавець:
          </label>
          <select
            value={executorFilter || ''}
            onChange={(e) => setExecutorFilter(e.target.value ? Number(e.target.value) : null)}
            style={{
              padding: '6px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
              background: '#ffffff',
              cursor: 'pointer',
              minWidth: '200px'
            }}
          >
            <option value="">Всі виконавці</option>
            {uniqueExecutors.map(({ id, executor }) => {
              const fullName = [executor.surname, executor.name, executor.middle_name]
                .filter(Boolean)
                .join(' ') || executor.email
              return (
                <option key={id} value={id}>
                  {fullName}
                </option>
              )
            })}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', color: '#4a5568' }}>
            Група компаній:
          </label>
          <select
            value={groupCompanyFilter || ''}
            onChange={(e) => {
              const value = e.target.value ? Number(e.target.value) : null
              setGroupCompanyFilter(value)
              // Якщо змінюється група компаній, скидаємо фільтр по клієнту
              if (value) {
                setClientFilter(null)
              }
            }}
            style={{
              padding: '6px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
              background: '#ffffff',
              cursor: 'pointer',
              minWidth: '200px'
            }}
          >
            <option value="">Всі групи компаній</option>
            {groupCompanies.map((group) => (
              <option key={group.id} value={group.id}>
                {group.group_name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '14px', fontWeight: '500', color: '#4a5568' }}>
            Компанія:
          </label>
          <select
            value={clientFilter || ''}
            onChange={(e) => setClientFilter(e.target.value ? Number(e.target.value) : null)}
            style={{
              padding: '6px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
              background: '#ffffff',
              cursor: 'pointer',
              minWidth: '250px'
            }}
            disabled={!!groupCompanyFilter}
          >
            <option value="">Всі компанії</option>
            {(() => {
              // Якщо обрано групу компаній, фільтруємо клієнтів
              const filteredClients = groupCompanyFilter
                ? clients.filter(c => c.group_company_id === groupCompanyFilter)
                : clients
              
              return filteredClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.legal_name}
                </option>
              ))
            })()}
          </select>
        </div>
      </div>

      {/* Відображення задач */}
      {filteredTasks.length === 0 ? (
        <div style={{ 
          padding: '48px', 
          textAlign: 'center', 
          color: '#718096',
          background: '#f7fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
          <p style={{ fontSize: '16px', marginBottom: '8px' }}>Немає задач</p>
          <p style={{ fontSize: '14px' }}>
            {statusFilter || executorFilter 
              ? 'Спробуйте змінити фільтри'
              : 'Всі призначені задачі будуть відображатися тут'
            }
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {datesToShow.map(date => {
            const dateKey = formatDateKey(date)
            const tasksForDate = groupedByDate.get(dateKey) || []
            const isExpanded = expandedDates.has(dateKey) // Accordion стан
            const showAllTasks = showAllTasksForDate.has(dateKey)
            const isTodayDate = isToday(date)
            const dayName = getDayName(date)
            const formattedDate = formatDateToUA(dateKey)
            
            // Визначаємо скільки задач показувати
            const tasksToShow = showAllTasks || tasksForDate.length <= TASKS_PER_DATE_LIMIT
              ? tasksForDate
              : tasksForDate.slice(0, TASKS_PER_DATE_LIMIT)
            const hasMoreTasks = tasksForDate.length > TASKS_PER_DATE_LIMIT

            return (
              <div
                key={dateKey}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  background: '#ffffff',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Заголовок дати (accordion) */}
                <div
                  onClick={() => toggleDateGroup(dateKey)}
                  style={{
                    padding: '16px 20px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isExpanded ? '#f7fafc' : '#ffffff',
                    borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                    transition: 'background 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isExpanded) {
                      e.currentTarget.style.background = '#f7fafc'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded) {
                      e.currentTarget.style.background = '#ffffff'
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ 
                      fontSize: '18px', 
                      fontWeight: '600', 
                      color: isTodayDate ? '#4299e1' : '#2d3748'
                    }}>
                      {dayName}, {formattedDate}
                    </span>
                    {isTodayDate && (
                      <span style={{
                        background: '#4299e1',
                        color: '#ffffff',
                        padding: '4px 12px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        textTransform: 'uppercase'
                      }}>
                        Сьогодні
                      </span>
                    )}
                    <span style={{
                      background: '#4299e1',
                      color: '#ffffff',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {tasksForDate.length} {tasksForDate.length === 1 ? 'задача' : tasksForDate.length < 5 ? 'задачі' : 'задач'}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '20px',
                    color: '#718096',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }}>
                    ▼
                  </span>
                </div>

                {/* Розгорнутий список задач (тільки якщо isExpanded) */}
                {isExpanded && (
                  <div style={{ padding: '16px 20px' }}>
                    {tasksForDate.length === 0 ? (
                      <div style={{ 
                        padding: '32px', 
                        textAlign: 'center', 
                        color: '#a0aec0',
                        fontSize: '14px'
                      }}>
                        Немає задач на цю дату
                      </div>
                    ) : (
                      <>
                    {tasksToShow.length > 50 ? (
                      // Використовуємо віртуалізацію для великих списків (>50 записів)
                      <div style={{ width: '100%' }}>
                        <List
                          height={Math.min(600, tasksToShow.length * 200)} // Максимальна висота 600px або висота всіх рядків
                          itemCount={tasksToShow.length}
                          itemSize={200} // Орієнтовна висота однієї картки задачі
                          width="100%"
                        >
                          {({ index, style }: { index: number; style: React.CSSProperties }) => (
                            <div style={style}>
                              <VirtualizedTaskRow
                                task={tasksToShow[index]}
                                taskTimeStats={taskTimeStats}
                                activeTaskId={activeTaskId}
                                setEditingTaskId={setEditingTaskId}
                                formatDateToUA={formatDateToUA}
                                formatMinutesToHoursMinutes={formatMinutesToHoursMinutes}
                                getStatusBadgeClass={getStatusBadgeClass}
                                getStatusText={getStatusText}
                                getTaskTypeText={getTaskTypeText}
                                getActualTaskStatusSync={getActualTaskStatusSync}
                              />
                            </div>
                          )}
                        </List>
                      </div>
                    ) : (
                      // Для малих списків використовуємо звичайний рендеринг
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {tasksToShow.map(task => {
                            const executorName = task.executor
                              ? [task.executor.surname, task.executor.name, task.executor.middle_name]
                                  .filter(Boolean)
                                  .join(' ') || task.executor.email
                              : 'Не призначено'
                            
                            const clientName = task.client?.legal_name || 'Не вказано'
                            
                            // Використовуємо уніфіковану логіку визначення статусу
                            const stats = taskTimeStats.get(task.id)
                            const status = getActualTaskStatusSync(task, activeTaskId, stats || undefined)
                            
                            // Визначаємо дату виконання та час
                            const completionDate = task.completion_date 
                              ? formatDateToUA(task.completion_date.split('T')[0])
                              : (stats?.completionDate 
                                ? formatDateToUA(stats.completionDate)
                                : '-')
                            
                            // Використовуємо час зі статистики (з логів), якщо він є, інакше з поля задачі
                            let totalMinutes = stats?.totalMinutes ?? task.completion_time_minutes ?? 0
                            const timeSpent = formatMinutesToHoursMinutes(totalMinutes)
                            const taskName = task.task?.task_name || `Задача #${task.task_id}`
                            const taskType = task.task?.task_type || 'Планова задача'

                            return (
                        <div
                          key={task.id}
                          style={{
                            padding: '16px',
                                  background: task.is_active ? '#f7fafc' : '#f0f0f0',
                            borderRadius: '6px',
                                  border: `1px solid ${task.is_active ? '#e2e8f0' : '#d0d0d0'}`,
                                  opacity: task.is_active ? 1 : 0.7
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                              <h4 style={{ 
                                fontSize: '16px', 
                                fontWeight: '600', 
                                  color: task.is_active ? '#2d3748' : '#a0aec0',
                                  margin: 0
                              }}>
                                  {taskName}
                              </h4>
                                <span style={{
                                  padding: '4px 10px',
                                  borderRadius: '12px',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  background: '#e6f3ff',
                                  color: '#2c5282',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px'
                                }}>
                                  {getTaskTypeText(taskType)}
                                </span>
                              </div>
                                <p style={{ 
                                  fontSize: '14px', 
                                color: task.is_active ? '#718096' : '#a0aec0',
                                  marginBottom: '4px'
                                }}>
                                Клієнт: <span style={{ fontWeight: '500', color: task.is_active ? '#4a5568' : '#a0aec0' }}>{clientName}</span>
                                </p>
                            </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className={`status-badge ${getStatusBadgeClass(status)}`}>
                                      {getStatusText(status)}
                              </span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setEditingTaskId(task.id)
                                      }}
                                      style={{
                                        padding: '6px 12px',
                                        background: '#4299e1',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        fontWeight: '500',
                                        color: '#ffffff',
                                        transition: 'all 0.2s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = '#3182ce'
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = '#4299e1'
                                      }}
                                      title="Редагувати задачу"
                                    >
                                      ✏️ Редагувати
                                    </button>
                                  </div>
                          </div>

                          <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                            gap: '12px',
                            marginTop: '12px'
                          }}>
                            {task.executor && (
                              <div>
                                <span style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
                                  Виконавець
                                </span>
                                <span style={{ fontSize: '14px', color: '#2d3748', fontWeight: '500' }}>
                                        {executorName}
                                </span>
                              </div>
                            )}
                            
                            <div>
                              <span style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
                                Дата виконання
                              </span>
                              <span style={{ fontSize: '14px', color: '#2d3748', fontWeight: '500' }}>
                                {completionDate}
                              </span>
                            </div>
                            
                            <div>
                              <span style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
                                Час виконання
                              </span>
                              <span style={{ fontSize: '14px', color: '#2d3748', fontWeight: '500' }}>
                                      {timeSpent}
                              </span>
                            </div>
                          </div>

                          {task.task?.description && (
                            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                              <span style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
                                Опис
                              </span>
                              <p style={{ fontSize: '14px', color: '#4a5568', lineHeight: '1.5' }}>
                                {task.task.description}
                              </p>
                            </div>
                          )}
                        </div>
                            )
                          })}
                    </div>
                    )}

                        {/* Кнопка "Показати всі задачі" */}
                        {hasMoreTasks && (
                          <div style={{
                            marginTop: '16px',
                            display: 'flex',
                            justifyContent: 'center'
                          }}>
                            <button
                              onClick={(e) => toggleShowAllTasks(dateKey, e)}
                              style={{
                                padding: '10px 24px',
                                background: '#ffffff',
                                border: '1px solid #4299e1',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '500',
                                color: '#4299e1',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = '#e6f3ff'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#ffffff'
                              }}
                            >
                              {showAllTasks 
                                ? `Показати менше (показано всі ${tasksForDate.length})`
                                : `Показати всі задачі (показано ${TASKS_PER_DATE_LIMIT} з ${tasksForDate.length})`
                              }
                            </button>
                  </div>
                        )}
                      </>
                )}
                  </div>
                )}

              </div>
            )
          })}
        </div>
      )}

      {/* Модальне вікно для редагування задачі */}
      {editingTaskId && (() => {
        // Завжди отримуємо поточний стан задачі зі стану
        const task = assignedTasks.find(t => t.id === editingTaskId)
        if (!task) {
          // Якщо задача не знайдена, закриваємо модальне вікно
          setTimeout(() => setEditingTaskId(null), 0)
          return null
        }

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
                      {task.task?.task_name || `Задача #${task.task_id}`}
                    </h4>
                    {task.task?.task_type && (
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        background: '#e6f3ff',
                        color: '#2c5282',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        {getTaskTypeText(task.task.task_type)}
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
                    style={{
                      padding: '12px 16px',
                      border: '2px solid #e2e8f0',
                      borderRadius: '10px',
                      fontSize: '15px',
                      background: 'white',
                      color: '#2d3748',
                      fontWeight: '500',
                      width: '100%',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="">Не призначено</option>
                    {availableExecutors.map((executor) => {
                      const fullName = [executor.surname, executor.name, executor.middle_name]
                        .filter(Boolean)
                        .join(' ') || executor.email
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
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer'
                      }}
                    />
                    <span>Активна задача</span>
                  </label>
                  <p style={{ fontSize: '12px', color: '#718096', marginTop: '4px', marginLeft: '26px' }}>
                    {task.is_active 
                      ? 'Задача активна і відображається в календарі'
                      : 'Задача деактивована і не відображається в календарі'
                    }
                  </p>
                </div>

                <div className="modal-actions">
                  <button
                    className="btn-secondary"
                    onClick={() => setEditingTaskId(null)}
                  >
                    Закрити
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Модальне вікно створення індивідуальної задачі */}
      {showCreateTaskModal && (
        <div className="modal-overlay" onClick={() => setShowCreateTaskModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>Створити індивідуальну задачу</h3>
              <button className="modal-close" onClick={() => setShowCreateTaskModal(false)}>×</button>
            </div>
            <div style={{ padding: '24px' }}>
              {error && (
                <div style={{ 
                  padding: '12px', 
                  background: '#fed7d7', 
                  color: '#c53030', 
                  borderRadius: '6px', 
                  marginBottom: '16px' 
                }}>
                  {error}
                </div>
              )}

              <div className="form-group">
                <label>Виконавець *</label>
                <select
                  value={newTaskForm.executor_id || ''}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, executor_id: e.target.value ? Number(e.target.value) : null })}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    width: '100%'
                  }}
                >
                  <option value="">Оберіть виконавця</option>
                  {availableExecutors.map(executor => {
                    const fullName = [executor.surname, executor.name, executor.middle_name]
                      .filter(Boolean)
                      .join(' ') || executor.email
                    return (
                      <option key={executor.id} value={executor.id}>
                        {fullName}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div className="form-group">
                <label>Дата виконання *</label>
                <input
                  type="date"
                  value={newTaskForm.planned_date}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, planned_date: e.target.value })}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    width: '100%'
                  }}
                />
              </div>

              <div className="form-group">
                <label>Назва задачі *</label>
                <input
                  type="text"
                  value={newTaskForm.task_name}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, task_name: e.target.value })}
                  placeholder="Введіть назву задачі"
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    width: '100%'
                  }}
                />
              </div>

              <div className="form-group">
                <label>Категорія</label>
                <select
                  value={newTaskForm.category_id || ''}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, category_id: e.target.value ? Number(e.target.value) : null })}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    width: '100%'
                  }}
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
                <label>Компанія *</label>
                <select
                  value={newTaskForm.client_id || ''}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, client_id: e.target.value ? Number(e.target.value) : null })}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    width: '100%'
                  }}
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
                <label>Опис</label>
                <textarea
                  value={newTaskForm.description}
                  onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })}
                  placeholder="Введіть опис задачі (необов'язково)"
                  rows={4}
                  style={{
                    padding: '8px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    fontSize: '14px',
                    width: '100%',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              <div className="modal-actions">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setShowCreateTaskModal(false)
                    setNewTaskForm({
                      executor_id: null,
                      planned_date: '',
                      task_name: '',
                      category_id: null,
                      description: '',
                      client_id: null
                    })
                    setError(null)
                  }}
                >
                  Скасувати
                </button>
                <button
                  className="btn-primary"
                  onClick={handleCreateIndividualTask}
                  style={{
                    background: '#4299e1',
                    color: '#ffffff'
                  }}
                >
                  Створити задачу
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

// Компонент для віртуалізованого рядка задачі
function VirtualizedTaskRow({
  task,
  taskTimeStats,
  activeTaskId,
  setEditingTaskId,
  formatDateToUA,
  formatMinutesToHoursMinutes,
  getStatusBadgeClass,
  getStatusText,
  getTaskTypeText,
  getActualTaskStatusSync
}: {
  task: AssignedTaskWithDetails
  taskTimeStats: Map<number, { totalMinutes: number; status: string | null; completionDate: string | null }>
  activeTaskId: number | null
  setEditingTaskId: (id: number) => void
  formatDateToUA: (date: string) => string
  formatMinutesToHoursMinutes: (minutes: number) => string
  getStatusBadgeClass: (status?: string) => string
  getStatusText: (status?: string) => string
  getTaskTypeText: (type?: string) => string
  getActualTaskStatusSync: (task: AssignedTaskWithDetails, activeTaskId: number | null, stats?: { completionDate?: string, totalMinutes?: number }) => string
}) {
  const executorName = task.executor
    ? [task.executor.surname, task.executor.name, task.executor.middle_name]
        .filter(Boolean)
        .join(' ') || task.executor.email
    : 'Не призначено'
  
  const clientName = task.client?.legal_name || 'Не вказано'
  
  const stats = taskTimeStats.get(task.id)
  const status = getActualTaskStatusSync(task, activeTaskId, stats || undefined)
  
  const completionDate = task.completion_date 
    ? formatDateToUA(task.completion_date.split('T')[0])
    : (stats?.completionDate 
      ? formatDateToUA(stats.completionDate)
      : '-')
  
  let totalMinutes = stats?.totalMinutes ?? task.completion_time_minutes ?? 0
  const timeSpent = formatMinutesToHoursMinutes(totalMinutes)
  const taskName = task.task?.task_name || `Задача #${task.task_id}`
  const taskType = task.task?.task_type || 'Планова задача'

  return (
    <div
      style={{
        padding: '16px',
        marginBottom: '12px',
        background: task.is_active ? '#f7fafc' : '#f0f0f0',
        borderRadius: '6px',
        border: `1px solid ${task.is_active ? '#e2e8f0' : '#d0d0d0'}`,
        opacity: task.is_active ? 1 : 0.7
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
            <h4 style={{ 
              fontSize: '16px', 
              fontWeight: '600', 
              color: task.is_active ? '#2d3748' : '#a0aec0',
              margin: 0
            }}>
              {taskName}
            </h4>
            <span style={{
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: '600',
              background: '#e6f3ff',
              color: '#2c5282',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {getTaskTypeText(taskType)}
            </span>
          </div>
          <p style={{ 
            fontSize: '14px', 
            color: task.is_active ? '#718096' : '#a0aec0',
            marginBottom: '4px'
          }}>
            Клієнт: <span style={{ fontWeight: '500', color: task.is_active ? '#4a5568' : '#a0aec0' }}>{clientName}</span>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={`status-badge ${getStatusBadgeClass(status)}`}>
            {getStatusText(status)}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setEditingTaskId(task.id)
            }}
            style={{
              padding: '6px 12px',
              background: '#4299e1',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              color: '#ffffff',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#3182ce'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#4299e1'
            }}
            title="Редагувати задачу"
          >
            ✏️ Редагувати
          </button>
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '12px',
        marginTop: '12px'
      }}>
        {task.executor && (
          <div>
            <span style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
              Виконавець
            </span>
            <span style={{ fontSize: '14px', color: '#2d3748', fontWeight: '500' }}>
              {executorName}
            </span>
          </div>
        )}
        
        <div>
          <span style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
            Дата виконання
          </span>
          <span style={{ fontSize: '14px', color: '#2d3748', fontWeight: '500' }}>
            {completionDate}
          </span>
        </div>
        
        <div>
          <span style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
            Час виконання
          </span>
          <span style={{ fontSize: '14px', color: '#2d3748', fontWeight: '500' }}>
            {timeSpent}
          </span>
        </div>
      </div>

      {task.task?.description && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
            Опис
          </span>
          <p style={{ fontSize: '14px', color: '#4a5568', lineHeight: '1.5' }}>
            {task.task.description}
          </p>
        </div>
      )}
    </div>
  )
}
