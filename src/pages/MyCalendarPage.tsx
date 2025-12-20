import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getAssignedTasksForExecutor, createAssignedTask, type AssignedTaskWithDetails } from '../lib/assignedTasks'
import { createTask } from '../lib/tasks'
import { getTaskCategoriesByProject } from '../lib/tasksCategory'
import { getClientWithRelations } from '../lib/clients'
import { useClients, useClientsDepartments } from '../hooks/useClients'
import { getRoleById, getUserDepartments } from '../lib/users'
import { startTaskTimeLog, resumeTaskTimeLog, getTaskTimeStats } from '../lib/taskTimeLogs'
import { supabase } from '../lib/supabase'
import type { TaskCategory, Client, Department } from '../types/database'
import { useActiveTask } from '../contexts/ActiveTaskContext'
import TaskPlayer from '../components/TaskPlayer'
import { formatDateToUA, formatMinutesToHoursMinutes, getCurrentWeekMonday, addDays, getWeekDates, getAllDatesInMonth, formatDateKey, isToday } from '../utils/date'
import { getStatusBadgeClass, getStatusText, getTaskTypeText, getTaskStatus } from '../utils/status'
import { getActualTaskStatusSync } from '../utils/taskStatus'
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

export default function MyCalendarPage() {
  const { user } = useAuth()
  
  // Використовуємо React Query хуки для кешування клієнтів
  const { data: allClients = [], isLoading: clientsLoading } = useClients()
  const clientIds = allClients.map(client => client.id)
  const { data: departmentsMap = new Map() } = useClientsDepartments(clientIds)
  
  const [assignedTasks, setAssignedTasks] = useState<AssignedTaskWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Пагінація та відображення
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getCurrentWeekMonday())
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
  const [showFullMonth, setShowFullMonth] = useState(false)
  
  // Фільтри (тільки статус та тип задачі, без виконавця, оскільки всі задачі для поточного користувача)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [taskTypeFilter, setTaskTypeFilter] = useState<string | null>(null)
  
  // Ліміт карток на дату та розгорнуті дати
  const TASKS_PER_DATE_LIMIT = 12
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set()) // Accordion - відкриті дати
  const [showAllTasksForDate, setShowAllTasksForDate] = useState<Set<string>>(new Set()) // Показати всі задачі для дати
  
  // Створення задачі
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [isTeamLead, setIsTeamLead] = useState(false)
  const [newTaskForm, setNewTaskForm] = useState({
    planned_date: '',
    task_name: '',
    category_id: null as number | null,
    description: '',
    client_id: null as number | null
  })

  // Відстеження часу (використовуємо глобальний контекст)
  const { activeTimeLog, activeTaskId, loadActiveTimeLog, handlePauseTask: pauseTaskFromContext, handleStopTask: stopTaskFromContext } = useActiveTask()
  const [taskTimeStats, setTaskTimeStats] = useState<Map<number, { totalMinutes: number; status: string | null; completionDate: string | null }>>(new Map())

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

  const loadData = async (isMounted: { current: boolean } = { current: true }) => {
    if (!user?.id) {
      if (isMounted.current) {
        setError('Користувач не знайдено')
        setLoading(false)
      }
      return
    }

    if (isMounted.current) {
      setLoading(true)
      setError(null)
    }

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
      
      const tasks = await getAssignedTasksForExecutor(user.id, startDate, endDate)
      
      // Діагностичне логування
      console.log('Loaded tasks:', tasks.length)
      const completedTasks = tasks.filter(t => t.task_status === 'completed')
      console.log('Completed tasks:', completedTasks.length)
      if (completedTasks.length > 0) {
        console.log('Sample completed task:', {
          id: completedTasks[0].id,
          task_status: completedTasks[0].task_status,
          completion_date: completedTasks[0].completion_date,
          completion_time_minutes: completedTasks[0].completion_time_minutes
        })
      }
      
      // Перевіряємо монтування перед встановленням стану
      if (!isMounted.current) return
      
      setAssignedTasks(tasks)
      
      // Завантажуємо статистику часу для кожної задачі
      // Тепер tasks вже відфільтровані по періоду на рівні запиту, тому використовуємо всі
      const visibleTasks = tasks
      
      const statsMap = new Map<number, { totalMinutes: number; status: string | null; completionDate: string | null }>()
      
      // Використовуємо Promise.allSettled для обробки помилок
      const statsResults = await Promise.allSettled(
        visibleTasks.map(async (task) => {
          if (!isMounted.current) return null
          
          try {
            const stats = await getTaskTimeStats(task.id)
            return { taskId: task.id, stats }
          } catch (err) {
            console.error(`Error loading stats for task ${task.id}:`, err)
            return { taskId: task.id, stats: null }
          }
        })
      )
      
      // Обробляємо результати
      statsResults.forEach((result) => {
        if (!isMounted.current) return
        if (result.status === 'fulfilled' && result.value) {
          const { taskId, stats } = result.value
          if (stats) {
            statsMap.set(taskId, {
              totalMinutes: stats.totalMinutes,
              status: stats.status,
              completionDate: stats.completionDate
            })
          } else {
            statsMap.set(taskId, {
              totalMinutes: 0,
              status: null,
              completionDate: null
            })
          }
        }
      })
      
      if (isMounted.current) {
        setTaskTimeStats(statsMap)
      }
    } catch (err) {
      console.error('Error loading assigned tasks:', err)
      if (isMounted.current) {
        setError('Не вдалося завантажити задачі')
      }
    } finally {
      if (isMounted.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    const isMounted = { current: true }
    loadData(isMounted)
    
    return () => {
      isMounted.current = false
    }
  }, [user?.id, currentWeekStart, currentMonth, showFullMonth])

  // Зберігаємо попередній activeTaskId для виявлення зупинки
  const prevActiveTaskIdRef = useRef<number | null>(null)

  // Оновлюємо статистику для активної задачі
  useEffect(() => {
    if (!activeTimeLog || !activeTaskId) {
      // Якщо активна задача була зупинена (була активна, а тепер ні)
      if (prevActiveTaskIdRef.current !== null) {
        const stoppedTaskId = prevActiveTaskIdRef.current
        console.log('Task stopped, updating stats for task:', stoppedTaskId)
        
        // Оновлюємо статистику для зупиненої задачі
        const updateStoppedTaskStats = async () => {
          try {
            // Невелика затримка, щоб дати час базі даних оновити лог
            await new Promise(resolve => setTimeout(resolve, 500))
            const stats = await getTaskTimeStats(stoppedTaskId)
            console.log('Stats after stop for task', stoppedTaskId, ':', stats)
            setTaskTimeStats(prev => {
              const newMap = new Map(prev)
              newMap.set(stoppedTaskId, {
                totalMinutes: stats.totalMinutes,
                status: stats.status,
                completionDate: stats.completionDate
              })
              return newMap
            })
          } catch (err) {
            console.error('Error updating stats for stopped task:', err)
          }
        }
        updateStoppedTaskStats()
        prevActiveTaskIdRef.current = null
      }
      return
    }
    
    // Оновлюємо посилання на активну задачу
    prevActiveTaskIdRef.current = activeTaskId
    
    const updateStats = async () => {
      try {
        const stats = await getTaskTimeStats(activeTaskId)
        setTaskTimeStats(prev => {
          const newMap = new Map(prev)
          newMap.set(activeTaskId, {
            totalMinutes: stats.totalMinutes,
            status: 'in_progress',
            completionDate: stats.completionDate
          })
          return newMap
        })
      } catch (err) {
        console.error('Error updating stats for active task:', err)
      }
    }
    
    updateStats()
    const interval = setInterval(updateStats, 1000)
    return () => clearInterval(interval)
  }, [activeTimeLog?.start_time, activeTaskId])

  // Завантажуємо категорії задач та клієнтів
  useEffect(() => {
    const loadFilterData = async () => {
      if (!user?.project_id || !user?.id || !user?.role_id) return
      
      try {
        // Визначаємо роль
        let isTeamLeadRole = false
        try {
          const role = await getRoleById(user.role_id)
          if (role) {
            isTeamLeadRole = role.role_name === 'Тім лід'
            setIsTeamLead(isTeamLeadRole)
          }
        } catch (error) {
          console.error('Error checking user role:', error)
        }

        // Завантажуємо відділи тім ліда, якщо він є тім лідом
        let teamLeadDepts: Department[] = []
        if (isTeamLeadRole) {
          teamLeadDepts = await getUserDepartments(user.id)
        }

        // Завантажуємо категорії (клієнти вже завантажені через React Query хуки)
        const categories = await getTaskCategoriesByProject(user.project_id)
        
        setTaskCategories(categories)
        
        // Для тім ліда фільтруємо клієнтів за відділами (використовуємо дані з кешу)
        let filteredClients = allClients
        if (isTeamLeadRole && teamLeadDepts.length > 0) {
          const teamLeadDeptIds = teamLeadDepts.map(dept => dept.id)
          
          // Додаємо відділи до клієнтів (використовуємо дані з кешу)
          const clientsWithDepartments = allClients.map(client => ({
            ...client,
            departments: departmentsMap.get(client.id) || []
          }))
          
          // Фільтруємо клієнтів за відділами тім ліда
          filteredClients = clientsWithDepartments.filter(client => {
            const clientDeptIds = client.departments?.map((dept: any) => dept.id) || []
            return clientDeptIds.some((deptId: number) => teamLeadDeptIds.includes(deptId))
          }).map(({ departments, ...client }) => client) // Видаляємо departments з результату
        } else if (isTeamLeadRole) {
          // Якщо тім лід не має відділів, показуємо порожній список
          filteredClients = []
        }
        
        setClients(filteredClients)
      } catch (err) {
        console.error('Error loading filter data:', err)
      }
    }
    loadFilterData()
  }, [user?.project_id, user?.id, user?.role_id])

  // Функції для роботи з часом виконання
  const handleStartTask = async (taskId: number) => {
    if (!user?.id) {
      console.error('User ID is missing')
      setError('Помилка: користувач не авторизований')
      return
    }
    
    try {
      console.log('Starting task:', taskId, 'for user:', user.id)
      const log = await startTaskTimeLog(taskId, user.id)
      console.log('Task started, log:', log)
      
      if (log) {
        // Оновлюємо глобальний стан через контекст - завантажуємо активний лог
        await loadActiveTimeLog()
        // Не оновлюємо список задач, щоб не перезавантажувати сторінку
      } else {
        setError('Не вдалося створити лог часу')
      }
    } catch (err: any) {
      console.error('Error starting task:', err)
      setError(err.message || 'Не вдалося запустити задачу')
    }
  }

  const handlePauseTask = async (logId: number) => {
    try {
      console.log('Pausing task with log ID:', logId)
      
      // Отримуємо assigned_task_id перед паузою
      const { data: logData } = await supabase
        .from('task_time_logs')
        .select('assigned_task_id')
        .eq('id', logId)
        .single()
      
      const assignedTaskId = logData?.assigned_task_id
      
      // Викликаємо функцію з контексту
      await pauseTaskFromContext(logId)
      
      // Оновлюємо статистику для цієї задачі
      if (assignedTaskId) {
        try {
          // Невелика затримка, щоб дати час базі даних оновити лог
          await new Promise(resolve => setTimeout(resolve, 200))
          const stats = await getTaskTimeStats(assignedTaskId)
          console.log('Stats after pause for task', assignedTaskId, ':', stats)
          setTaskTimeStats(prev => {
            const newMap = new Map(prev)
            newMap.set(assignedTaskId, {
              totalMinutes: stats.totalMinutes,
              status: stats.status || 'paused', // Якщо статус null, встановлюємо 'paused'
              completionDate: stats.completionDate
            })
            return newMap
          })
        } catch (err) {
          console.error('Error updating task stats:', err)
        }
      }
    } catch (err: any) {
      console.error('Error pausing task:', err)
      setError(err.message || 'Не вдалося призупинити задачу')
    }
  }

  const handleResumeTask = async (taskId: number) => {
    if (!user?.id) return
    
    try {
      const log = await resumeTaskTimeLog(taskId, user.id)
      if (log) {
        // Оновлюємо глобальний стан через контекст - завантажуємо активний лог
        await loadActiveTimeLog()
        // Не оновлюємо список задач, щоб не перезавантажувати сторінку
      }
    } catch (err: any) {
      setError(err.message || 'Не вдалося відновити задачу')
    }
  }

  const handleStopTask = async (logId: number) => {
    try {
      console.log('Stopping task with log ID:', logId)
      
      // Отримуємо assigned_task_id перед завершенням
      const { data: logData } = await supabase
        .from('task_time_logs')
        .select('assigned_task_id')
        .eq('id', logId)
        .single()
      
      const assignedTaskId = logData?.assigned_task_id
      
      // Викликаємо функцію з контексту
      await stopTaskFromContext(logId)
      
      // Оновлюємо статистику для цієї задачі
      if (assignedTaskId) {
        try {
          // Невелика затримка, щоб дати час базі даних оновити лог
          await new Promise(resolve => setTimeout(resolve, 300))
          const stats = await getTaskTimeStats(assignedTaskId)
          console.log('Stats after stop for task', assignedTaskId, ':', stats)
          setTaskTimeStats(prev => {
            const newMap = new Map(prev)
            newMap.set(assignedTaskId, {
              totalMinutes: stats.totalMinutes,
              status: stats.status,
              completionDate: stats.completionDate
            })
            return newMap
          })
        } catch (err) {
          console.error('Error updating task stats:', err)
        }
      }
    } catch (err: any) {
      console.error('Error stopping task:', err)
      setError(err.message || 'Не вдалося завершити задачу')
    }
  }

  // Функція для створення задачі (тім лід створює задачу сам на себе)
  const handleCreateIndividualTask = async () => {
    if (!user?.project_id || !user?.id) {
      setError('Користувач не знайдено')
      return
    }

    if (!newTaskForm.planned_date || !newTaskForm.task_name || !newTaskForm.client_id) {
      setError('Заповніть всі обов\'язкові поля: Дата виконання, Назва задачі, Компанія')
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

      // Створюємо призначену задачу (виконавець - поточний користувач)
      const assignedTask = await createAssignedTask({
        task_id: task.id,
        client_id: newTaskForm.client_id,
        department_id: null,
        group_id: groupId,
        executor_id: user.id, // Автоматично встановлюємо на поточного користувача
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

  // Фільтруємо задачі
  const filteredTasks = useMemo(() => {
    return assignedTasks.filter(task => {
      if (statusFilter) {
        const taskStats = taskTimeStats.get(task.id)
        const taskStatus = getActualTaskStatusSync(task, activeTaskId, taskStats || undefined)
        if (taskStatus !== statusFilter) return false
      }
      if (taskTypeFilter && task.task?.task_type !== taskTypeFilter) return false
      return true
    })
  }, [assignedTasks, statusFilter, taskTypeFilter])

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

  // Навігація
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

  // Отримуємо унікальні статуси для фільтра (включаючи автоматично визначені)
  const uniqueStatuses = useMemo(() => {
    const statuses = new Set<string>()
    assignedTasks.forEach(task => {
      const taskStats = taskTimeStats.get(task.id)
      const status = getActualTaskStatusSync(task, activeTaskId, taskStats || undefined)
      statuses.add(status)
    })
    return Array.from(statuses)
  }, [assignedTasks, activeTaskId, taskTimeStats])

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
    <div className="admin-page" style={{ paddingBottom: activeTaskId && activeTimeLog ? '100px' : '0' }}>
      {/* Заголовок */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#2d3748', marginBottom: '8px' }}>
              Мій календар
            </h1>
            <p style={{ color: '#718096', fontSize: '14px' }}>
              Мої призначені задачі, згруповані по датах
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
            {statusFilter || taskTypeFilter 
              ? 'Спробуйте змінити фільтри'
              : 'Всі призначені вам задачі будуть відображатися тут'
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
                                  <VirtualizedTaskRowMyCalendar
                                    task={tasksToShow[index]}
                                    taskTimeStats={taskTimeStats}
                                    activeTaskId={activeTaskId}
                                    activeTimeLog={activeTimeLog}
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
                            const clientName = task.client?.legal_name || 'Не вказано'
                            const stats = taskTimeStats.get(task.id)
                            
                            // Діагностичне логування для першої задачі
                            if (tasksToShow.indexOf(task) === 0) {
                              console.log('Rendering task:', {
                                id: task.id,
                                task_status: task.task_status,
                                completion_date: task.completion_date,
                                completion_time_minutes: task.completion_time_minutes,
                                stats: stats
                              })
                            }
                            
                            // Пріоритет: completion_date з БД, потім зі статистики
                            const completionDate = task.completion_date
                              ? formatDateToUA(task.completion_date.split('T')[0])
                              : (stats?.completionDate 
                                ? formatDateToUA(stats.completionDate)
                                : '-')
                            // Використовуємо час зі статистики (з логів), якщо він є, інакше з поля задачі
                            // Для активної задачі використовуємо поточний час
                            let totalMinutes = stats?.totalMinutes ?? task.completion_time_minutes ?? 0
                            if (activeTaskId === task.id && activeTimeLog) {
                              // Розраховуємо поточний час для активної задачі
                              const startTime = new Date(activeTimeLog.start_time)
                              const now = new Date()
                              const currentMinutes = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60))
                              // Додаємо час з попередніх сесій
                              const previousMinutes = stats?.totalMinutes ?? 0
                              totalMinutes = previousMinutes + currentMinutes
                            }
                            const timeSpent = formatMinutesToHoursMinutes(totalMinutes)
                            // Використовуємо уніфіковану логіку визначення статусу
                            const status = getActualTaskStatusSync(task, activeTaskId, stats)
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
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span className={`status-badge ${getStatusBadgeClass(status)}`}>
                                      {getStatusText(status)}
                                    </span>
                                    {/* Кнопки управління часом */}
                                    {(() => {
                                      // Використовуємо уніфіковану логіку визначення статусу
                                      const taskStatus = getActualTaskStatusSync(task, activeTaskId, stats)
                                      const isActive = activeTaskId === task.id
                                      const isPaused = taskStatus === 'paused'
                                      const isCompleted = taskStatus === 'completed'
                                      const canStart = !activeTaskId && task.is_active && task.executor_id === user?.id && !isCompleted
                                      const canResume = isPaused && !activeTaskId && task.is_active && task.executor_id === user?.id
                                      
                                      if (isActive && activeTimeLog) {
                                        // Задача в роботі - показуємо паузу та стоп
                                        return (
                                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <button
                                              onClick={() => handlePauseTask(activeTimeLog.id)}
                                              style={{
                                                width: '36px',
                                                height: '36px',
                                                borderRadius: '50%',
                                                background: '#f59e0b',
                                                border: 'none',
                                                color: '#ffffff',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'all 0.2s ease',
                                                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
                                              }}
                                              onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'scale(1.1)'
                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.4)'
                                              }}
                                              onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'scale(1)'
                                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(245, 158, 11, 0.3)'
                                              }}
                                              title="Призупинити"
                                            >
                                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                <rect x="6" y="4" width="4" height="16" rx="1"></rect>
                                                <rect x="14" y="4" width="4" height="16" rx="1"></rect>
                                              </svg>
                                            </button>
                                            <button
                                              onClick={() => handleStopTask(activeTimeLog.id)}
                                              style={{
                                                width: '36px',
                                                height: '36px',
                                                borderRadius: '50%',
                                                background: '#ef4444',
                                                border: 'none',
                                                color: '#ffffff',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'all 0.2s ease',
                                                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)'
                                              }}
                                              onMouseEnter={(e) => {
                                                e.currentTarget.style.transform = 'scale(1.1)'
                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.4)'
                                              }}
                                              onMouseLeave={(e) => {
                                                e.currentTarget.style.transform = 'scale(1)'
                                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(239, 68, 68, 0.3)'
                                              }}
                                              title="Завершити"
                                            >
                                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                                <rect x="6" y="6" width="12" height="12" rx="2"></rect>
                                              </svg>
                                            </button>
                                          </div>
                                        )
                                      } else if (canResume) {
                                        // Задача призупинена - показуємо відновлення
                                        return (
                                          <button
                                            onClick={() => handleResumeTask(task.id)}
                                            style={{
                                              width: '36px',
                                              height: '36px',
                                              borderRadius: '50%',
                                              background: '#10b981',
                                              border: 'none',
                                              color: '#ffffff',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              transition: 'all 0.2s ease',
                                              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                                            }}
                                            onMouseEnter={(e) => {
                                              e.currentTarget.style.transform = 'scale(1.1)'
                                              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)'
                                            }}
                                            onMouseLeave={(e) => {
                                              e.currentTarget.style.transform = 'scale(1)'
                                              e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)'
                                            }}
                                            title="Відновити роботу"
                                          >
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
                                              <polygon points="5 3 19 12 5 21"></polygon>
                                            </svg>
                                          </button>
                                        )
                                      } else if (canStart) {
                                        // Можна запустити - показуємо старт
                                        return (
                                          <button
                                            onClick={() => handleStartTask(task.id)}
                                            disabled={!!activeTaskId}
                                            style={{
                                              width: '36px',
                                              height: '36px',
                                              borderRadius: '50%',
                                              background: activeTaskId ? '#9ca3af' : '#10b981',
                                              border: 'none',
                                              color: '#ffffff',
                                              cursor: activeTaskId ? 'not-allowed' : 'pointer',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              transition: 'all 0.2s ease',
                                              boxShadow: activeTaskId 
                                                ? '0 2px 8px rgba(156, 163, 175, 0.2)' 
                                                : '0 2px 8px rgba(16, 185, 129, 0.3)',
                                              opacity: activeTaskId ? 0.6 : 1
                                            }}
                                            onMouseEnter={(e) => {
                                              if (!activeTaskId) {
                                                e.currentTarget.style.transform = 'scale(1.1)'
                                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)'
                                              }
                                            }}
                                            onMouseLeave={(e) => {
                                              if (!activeTaskId) {
                                                e.currentTarget.style.transform = 'scale(1)'
                                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)'
                                              }
                                            }}
                                            title={activeTaskId ? 'Спочатку завершіть поточну задачу' : 'Почати роботу'}
                                          >
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '2px' }}>
                                              <polygon points="5 3 19 12 5 21"></polygon>
                                            </svg>
                                          </button>
                                        )
                                      }
                                      return null
                                    })()}
                                  </div>
                                </div>

                                <div style={{ 
                                  display: 'grid', 
                                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                                  gap: '12px',
                                  marginTop: '12px'
                                }}>
                                  {(stats?.completionDate || task.completion_date) && (
                                    <div>
                                      <span style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
                                        Дата виконання
                                      </span>
                                      <span style={{ fontSize: '14px', color: '#2d3748', fontWeight: '500' }}>
                                        {completionDate}
                                      </span>
                                    </div>
                                  )}
                                  
                                  {totalMinutes > 0 && (
                                    <div>
                                      <span style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
                                        Час виконання
                                      </span>
                                      <span style={{ fontSize: '14px', color: '#2d3748', fontWeight: '500' }}>
                                        {timeSpent}
                                      </span>
                                    </div>
                                  )}
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

      {/* Модальне вікно створення задачі */}
      {showCreateTaskModal && (
        <div className="modal-overlay" onClick={() => { setShowCreateTaskModal(false); setError(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>Створити задачу</h3>
              <button className="modal-close" onClick={() => { setShowCreateTaskModal(false); setError(null); }}>×</button>
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

      {/* Плеер таймера */}
      <TaskPlayer />
    </div>
  )
}

// Компонент для віртуалізованого рядка задачі в MyCalendarPage
function VirtualizedTaskRowMyCalendar({
  task,
  taskTimeStats,
  activeTaskId,
  activeTimeLog,
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
  activeTimeLog: { id: number; start_time: string } | null
  formatDateToUA: (date: string) => string
  formatMinutesToHoursMinutes: (minutes: number) => string
  getStatusBadgeClass: (status?: string) => string
  getStatusText: (status?: string) => string
  getTaskTypeText: (type?: string) => string
  getActualTaskStatusSync: (task: AssignedTaskWithDetails, activeTaskId: number | null, stats?: { completionDate?: string, totalMinutes?: number }) => string
}) {
  const clientName = task.client?.legal_name || 'Не вказано'
  const stats = taskTimeStats.get(task.id)
  
  const completionDate = task.completion_date
    ? formatDateToUA(task.completion_date.split('T')[0])
    : (stats?.completionDate 
      ? formatDateToUA(stats.completionDate)
      : '-')
  
  let totalMinutes = stats?.totalMinutes ?? task.completion_time_minutes ?? 0
  if (activeTaskId === task.id && activeTimeLog) {
    const startTime = new Date(activeTimeLog.start_time)
    const now = new Date()
    const currentMinutes = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60))
    const previousMinutes = stats?.totalMinutes ?? 0
    totalMinutes = previousMinutes + currentMinutes
  }
  const timeSpent = formatMinutesToHoursMinutes(totalMinutes)
  const status = getActualTaskStatusSync(task, activeTaskId, stats)
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className={`status-badge ${getStatusBadgeClass(status)}`}>
            {getStatusText(status)}
          </span>
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '12px',
        marginTop: '12px'
      }}>
        {(stats?.completionDate || task.completion_date) && (
          <div>
            <span style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
              Дата виконання
            </span>
            <span style={{ fontSize: '14px', color: '#2d3748', fontWeight: '500' }}>
              {completionDate}
            </span>
          </div>
        )}
        
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

