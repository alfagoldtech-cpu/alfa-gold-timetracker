import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { 
  getAllClients, 
  createClient, 
  updateClient,
  updateClientStatus,
  getAllKveds,
  getClientWithRelations
} from '../lib/clients'
import { getDepartmentsByProject, getUserDepartments, getRoleById, getAllRoles } from '../lib/users'
import { searchGroupCompanies, createGroupCompany, getGroupCompaniesByProject, updateGroupCompany } from '../lib/groupCompanies'
import { 
  getActiveAssignedTasksCountForClients,
  getAssignedTasksByClient,
  getAssignedTasksByClientAndGroup,
  createMultipleAssignedTasks,
  createAssignedTask,
  updateAssignedTask,
  type AssignedTaskWithDetails
} from '../lib/assignedTasks'
import { getTasksByProject, createTask, updateTask } from '../lib/tasks'
import { getUsersByProject, getTeamLeadGroupMembers } from '../lib/users'
import { getTaskCategoriesByProject } from '../lib/tasksCategory'
import { getTaskTimeStats } from '../lib/taskTimeLogs'
import type { TaskCategory } from '../types/database'
import { supabase } from '../lib/supabase'
import type { Client, Kved, Department, GroupCompany, Task, User } from '../types/database'
import { formatDate, formatCurrency, formatDateToUA, parseDateToISO, formatMinutesToHoursMinutes } from '../utils/date'
import { getStatusBadgeClass, getStatusText, getTaskStatus, getTaskTypeText } from '../utils/status'

interface ClientWithDepartments extends Client {
  departments?: Department[]
  activeTasksCount?: number
}
import './AdminPages.css'
import './ManagerDashboard.css'

export default function ClientsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [clients, setClients] = useState<ClientWithDepartments[]>([])
  const [kveds, setKveds] = useState<Kved[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [isTeamLead, setIsTeamLead] = useState(false)
  const [teamLeadDepartments, setTeamLeadDepartments] = useState<Department[]>([])
  const [groupCompanies, setGroupCompanies] = useState<GroupCompany[]>([])
  const [filteredGroupCompanies, setFilteredGroupCompanies] = useState<GroupCompany[]>([])
  const [groupCompanySearch, setGroupCompanySearch] = useState('')
  const [showGroupCompanyDropdown, setShowGroupCompanyDropdown] = useState(false)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [showAllGroupsModal, setShowAllGroupsModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [editingGroupName, setEditingGroupName] = useState<string>('')
  const groupCompanyInputRef = useRef<HTMLInputElement>(null)
  const groupCompanyDropdownRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [clientToToggle, setClientToToggle] = useState<Client | null>(null)
  const [editingClientId, setEditingClientId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [expandedClientGroups, setExpandedClientGroups] = useState<Set<number | 'no-group'>>(new Set())
  const [expandedClientsWithTasks, setExpandedClientsWithTasks] = useState<Set<number>>(new Set())
  const [clientTasks, setClientTasks] = useState<Map<number, AssignedTaskWithDetails[]>>(new Map())
  const [clientTasksLoading, setClientTasksLoading] = useState<Set<number>>(new Set())
  const [clientTasksPeriod, setClientTasksPeriod] = useState<Map<number, { type: 'week' | 'month', startDate: Date }>>(new Map())
  const [clientTasksPage, setClientTasksPage] = useState<Map<number, number>>(new Map())
  const [clientTaskTimeStats, setClientTaskTimeStats] = useState<Map<number, { totalMinutes: number; status: string | null; completionDate: string | null }>>(new Map())
  
  // Створення індивідуальної задачі для клієнта
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false)
  const [selectedClientForCreateTask, setSelectedClientForCreateTask] = useState<number | null>(null)
  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([])
  const [availableExecutorsForCreate, setAvailableExecutorsForCreate] = useState<User[]>([])
  const [newTaskForm, setNewTaskForm] = useState({
    executor_id: null as number | null,
    planned_date: '',
    task_name: '',
    category_id: null as number | null,
    description: ''
  })

  // Редагування задачі клієнта
  const [editingClientTaskId, setEditingClientTaskId] = useState<number | null>(null)

  // Допоміжні функції для роботи з датами
  const getCurrentWeekMonday = (): Date => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
    const monday = new Date(today)
    monday.setDate(today.getDate() + (dayOfWeek === 0 ? -6 : 1) - dayOfWeek)
    monday.setHours(0, 0, 0, 0)
    return monday
  }

  const getWeekDates = (startDate: Date): Date[] => {
    const dates: Date[] = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + i)
      dates.push(date)
    }
    return dates
  }

  const addDays = (date: Date, days: number): Date => {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
  }

  const addMonths = (date: Date, months: number): Date => {
    const result = new Date(date)
    result.setMonth(result.getMonth() + months)
    return result
  }

  const getAllDatesInMonth = (date: Date): Date[] => {
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

  // Функція для завантаження задач клієнта
  const loadClientTasks = async (clientId: number) => {
    const period = clientTasksPeriod.get(clientId) || { type: 'week' as const, startDate: getCurrentWeekMonday() }
    await loadClientTasksWithPeriod(clientId, period)
  }

  // Функція для перемикання розгорнутого стану клієнта з задачами
  const toggleClientTasks = async (clientId: number) => {
    const isExpanded = expandedClientsWithTasks.has(clientId)
    
    if (isExpanded) {
      setExpandedClientsWithTasks(prev => {
        const newSet = new Set(prev)
        newSet.delete(clientId)
        return newSet
      })
    } else {
      setExpandedClientsWithTasks(prev => new Set(prev).add(clientId))
      // Встановлюємо початковий період (цей тиждень)
      const initialPeriod = { type: 'week' as const, startDate: getCurrentWeekMonday() }
      if (!clientTasksPeriod.has(clientId)) {
        setClientTasksPeriod(prev => {
          const newMap = new Map(prev)
          newMap.set(clientId, initialPeriod)
          return newMap
        })
      }
      // Завантажуємо задачі з початковим періодом
      loadClientTasksWithPeriod(clientId, clientTasksPeriod.get(clientId) || initialPeriod)
    }
  }

  // Допоміжна функція для завантаження задач з явним періодом
  const loadClientTasksWithPeriod = async (clientId: number, period: { type: 'week' | 'month', startDate: Date }) => {
    if (!user?.id) {
      console.error('User ID not found')
      return
    }

    console.log('Loading tasks for client:', clientId, 'team lead group id:', user.id, 'period:', period)
    setClientTasksLoading(prev => new Set(prev).add(clientId))

    try {
      const tasks = await getAssignedTasksByClientAndGroup(clientId, user.id)
      console.log('Loaded tasks for client:', clientId, 'count:', tasks.length)
      
      // Фільтруємо задачі за періодом (тиждень або місяць)
      let filteredTasks = tasks

      if (period.type === 'week') {
        const weekDates = getWeekDates(period.startDate)
        const weekDateStrings = weekDates.map(d => d.toISOString().split('T')[0])
        console.log('Filtering by week:', weekDateStrings)
        filteredTasks = tasks.filter(task => {
          const taskDate = task.task?.planned_date
          if (!taskDate) return false
          const taskDateStr = taskDate.split('T')[0]
          return weekDateStrings.includes(taskDateStr)
        })
        console.log('Filtered tasks count:', filteredTasks.length)
      } else {
        const monthDates = getAllDatesInMonth(period.startDate)
        const monthDateStrings = monthDates.map(d => d.toISOString().split('T')[0])
        console.log('Filtering by month:', monthDateStrings.length, 'dates')
        filteredTasks = tasks.filter(task => {
          const taskDate = task.task?.planned_date
          if (!taskDate) return false
          const taskDateStr = taskDate.split('T')[0]
          return monthDateStrings.includes(taskDateStr)
        })
        console.log('Filtered tasks count:', filteredTasks.length)
      }

      // Сортуємо по датах від меншої до більшої
      filteredTasks.sort((a, b) => {
        const dateA = a.task?.planned_date || ''
        const dateB = b.task?.planned_date || ''
        return dateA.localeCompare(dateB)
      })

      console.log('Setting tasks for client:', clientId, 'filtered count:', filteredTasks.length)
      setClientTasks(prev => {
        const newMap = new Map(prev)
        newMap.set(clientId, filteredTasks)
        return newMap
      })

      // Завантажуємо статистику часу для всіх задач клієнта
      const statsPromises = filteredTasks.map(async (task) => {
        try {
          const stats = await getTaskTimeStats(task.id)
          return { taskId: task.id, stats }
        } catch (err) {
          console.error(`Error loading stats for task ${task.id}:`, err)
          return null
        }
      })
      
      const statsResults = await Promise.all(statsPromises)
      setClientTaskTimeStats(prev => {
        const newMap = new Map(prev)
        statsResults.forEach(result => {
          if (result) {
            newMap.set(result.taskId, {
              totalMinutes: result.stats.totalMinutes,
              status: result.stats.status,
              completionDate: result.stats.completionDate
            })
          }
        })
        return newMap
      })
    } catch (err) {
      console.error('Error loading client tasks:', err)
    } finally {
      setClientTasksLoading(prev => {
        const newSet = new Set(prev)
        newSet.delete(clientId)
        return newSet
      })
    }
  }

  // Функція для створення індивідуальної задачі для клієнта
  const handleCreateIndividualTask = async () => {
    if (!user?.project_id || !user?.id || !selectedClientForCreateTask) {
      setError('Користувач або клієнт не знайдено')
      return
    }

    if (!newTaskForm.executor_id || !newTaskForm.planned_date || !newTaskForm.task_name) {
      setError('Заповніть всі обов\'язкові поля: Виконавець, Дата виконання, Назва задачі')
      return
    }

    setError(null)

    try {
      // Визначаємо group_id
      const role = await getRoleById(user.role_id!)
      const isTeamLeadRole = role?.role_name === 'Тім лід'
      const groupId = isTeamLeadRole ? user.id : (user.group_id || null)
      
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
        client_id: selectedClientForCreateTask,
        department_id: null,
        group_id: groupId,
        executor_id: newTaskForm.executor_id,
        is_active: true
      })

      if (!assignedTask) {
        setError('Не вдалося призначити задачу')
        return
      }

      // Оновлюємо список задач клієнта
      await loadClientTasksWithPeriod(selectedClientForCreateTask, clientTasksPeriod.get(selectedClientForCreateTask) || { type: 'week' as const, startDate: getCurrentWeekMonday() })

      // Закриваємо модальне вікно та очищаємо форму
      setShowCreateTaskModal(false)
      setSelectedClientForCreateTask(null)
      setNewTaskForm({
        executor_id: null,
        planned_date: '',
        task_name: '',
        category_id: null,
        description: ''
      })
      setSuccess('Задачу успішно створено')
    } catch (err: any) {
      console.error('Error creating individual task:', err)
      setError(err.message || 'Помилка створення задачі')
    }
  }

  // Функція для оновлення виконавця задачі клієнта
  const handleUpdateClientTaskExecutor = async (taskId: number, executorId: number | null, clientId: number) => {
    const tasks = clientTasks.get(clientId) || []
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    const originalExecutorId = task.executor_id
    let executorGroupId: number | null = null

    if (executorId) {
      const executor = availableExecutorsForCreate.find(e => e.id === executorId)
      if (executor) {
        executorGroupId = executor.group_id || null
      }
    }

    // Оптимістичне оновлення
    setClientTasks(prev => {
      const newMap = new Map(prev)
      const clientTasksList = newMap.get(clientId) || []
      newMap.set(clientId, clientTasksList.map(t => {
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
      return newMap
    })

    // Оновлюємо в БД
    const updateData: { executor_id: number | null; group_id?: number | null } = { 
      executor_id: executorId,
      group_id: executorGroupId
    }
    
    const success = await updateAssignedTask(taskId, updateData)
    
    if (!success) {
      // Відкат змін при помилці
      setClientTasks(prev => {
        const newMap = new Map(prev)
        const clientTasksList = newMap.get(clientId) || []
        newMap.set(clientId, clientTasksList.map(t => {
          if (t.id === taskId) {
            return { 
              ...t, 
              executor_id: originalExecutorId,
              executor: task.executor
            }
          }
          return t
        }))
        return newMap
      })
      setError('Не вдалося оновити виконавця')
    } else {
      // Оновлюємо статистику для цієї задачі
      try {
        await new Promise(resolve => setTimeout(resolve, 300))
        const stats = await getTaskTimeStats(taskId)
        setClientTaskTimeStats(prev => {
          const newMap = new Map(prev)
          newMap.set(taskId, {
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
  }

  // Функція для деактивації/активації задачі клієнта
  const handleToggleClientTaskActive = async (taskId: number, clientId: number) => {
    const tasks = clientTasks.get(clientId) || []
    const task = tasks.find(t => t.id === taskId)
    if (!task) return

    const currentStatus = task.is_active
    const newStatus = !currentStatus

    // Оптимістичне оновлення
      setClientTasks(prev => {
        const newMap = new Map(prev)
        const clientTasksList = newMap.get(clientId) || []
        newMap.set(clientId, clientTasksList.map(t => {
          if (t.id === taskId) {
            return { ...t, is_active: newStatus }
          }
          return t
        }))
        return newMap
      })

    // Оновлюємо в БД
    const success = await updateAssignedTask(taskId, { is_active: newStatus })
    
    if (success) {
      // Оновлюємо статистику для цієї задачі
      try {
        await new Promise(resolve => setTimeout(resolve, 300))
        const stats = await getTaskTimeStats(taskId)
        setClientTaskTimeStats(prev => {
          const newMap = new Map(prev)
          newMap.set(taskId, {
            totalMinutes: stats.totalMinutes,
            status: stats.status,
            completionDate: stats.completionDate
          })
          return newMap
        })
      } catch (err) {
        console.error('Error updating task stats:', err)
      }
    } else {
      // Відкат змін при помилці
      setClientTasks(prev => {
        const newMap = new Map(prev)
        const clientTasksList = newMap.get(clientId) || []
        newMap.set(clientId, clientTasksList.map(t => {
          if (t.id === taskId) {
            return { ...t, is_active: currentStatus }
          }
          return t
        }))
        return newMap
      })
      setError('Не вдалося змінити статус задачі')
    }
    
    // Якщо задача деактивована, закриваємо модальне вікно
    if (!newStatus) {
      setEditingClientTaskId(null)
    }
  }
  
  // Стани для модального вікна призначення задач
  const [showAssignTasksModal, setShowAssignTasksModal] = useState(false)
  const [selectedClientForTasks, setSelectedClientForTasks] = useState<ClientWithDepartments | null>(null)
  const [assignedTasks, setAssignedTasks] = useState<AssignedTaskWithDetails[]>([])
  const [allAssignedTasksForClient, setAllAssignedTasksForClient] = useState<AssignedTaskWithDetails[]>([]) // Всі призначені задачі для клієнта (для фільтрації)
  const [availableTasks, setAvailableTasks] = useState<Task[]>([])
  const [availableExecutors, setAvailableExecutors] = useState<User[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<number>(0)
  const [selectedTaskDates, setSelectedTaskDates] = useState<Array<{ month: number; date: string; executorId: number; isActive: boolean }>>([])
  const [expandedAssignedTaskGroups, setExpandedAssignedTaskGroups] = useState<Set<string>>(new Set())
  const [editingAssignedTaskId, setEditingAssignedTaskId] = useState<number | null>(null)
  const isUpdatingRef = useRef<boolean>(false)
  const previousExecutorValuesRef = useRef<Map<number, number>>(new Map())
  const editingTaskIdRef = useRef<number | null>(null)

  const [clientForm, setClientForm] = useState({
    edrpou: '',
    legal_name: '',
    phone: '',
    status: 'active',
    company_group: '',
    group_company_id: 0,
    service_cost: '',
    company_folder: '',
    client_card: '',
    address: '',
    city: '',
    kved_id: 0,
    activity_type: '',
    email: '',
    type: '',
    director_full_name: '',
    gender: '',
    iban: '',
    bank_name: '',
    department_ids: [] as number[]
  })

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

  // Завантажуємо виконавців для створення задач
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
          const allExecutors = await getUsersByProject(user.project_id)
          executors = allExecutors.filter(u => u.role_id !== 1 && u.role_id !== 2)
        }
        setAvailableExecutorsForCreate(executors)
      } catch (err) {
        console.error('Error loading executors:', err)
      }
    }
    loadExecutors()
  }, [user?.project_id, user?.id, user?.role_id])

  useEffect(() => {
    if (user?.project_id && user?.role_id) {
      const initializeData = async () => {
        // Спочатку визначаємо роль
        let isTeamLeadRole = false
        if (user.role_id) {
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
        }
        
        // Після визначення ролі завантажуємо дані
        await loadData(isTeamLeadRole)
      }
      initializeData()
    }
  }, [user?.project_id, user?.role_id])

  // Обробка пошуку груп компаній
  useEffect(() => {
    if (!user?.project_id) return

    if (groupCompanySearch.trim() === '') {
      setFilteredGroupCompanies(groupCompanies)
    } else {
      const searchGroups = async () => {
        const results = await searchGroupCompanies(user.project_id!, groupCompanySearch)
        setFilteredGroupCompanies(results)
      }
      const timeoutId = setTimeout(searchGroups, 300)
      return () => clearTimeout(timeoutId)
    }
  }, [groupCompanySearch, groupCompanies, user?.project_id])

  // Закриваємо dropdown при кліку поза ним
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        groupCompanyInputRef.current &&
        !groupCompanyInputRef.current.contains(event.target as Node) &&
        groupCompanyDropdownRef.current &&
        !groupCompanyDropdownRef.current.contains(event.target as Node)
      ) {
        setShowGroupCompanyDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadData = async (isTeamLeadRole?: boolean) => {
    if (!user?.project_id) return

    setLoading(true)
    setError(null)
    setSuccess(null)
    
    try {
      const isTeamLeadValue = isTeamLeadRole !== undefined ? isTeamLeadRole : isTeamLead
      
      // Для тім ліда спочатку отримуємо його відділи
      let teamLeadDepts: Department[] = []
      if (isTeamLeadValue && user?.id) {
        teamLeadDepts = await getUserDepartments(user.id)
        setTeamLeadDepartments(teamLeadDepts)
      }
      
      // Завантажуємо дані паралельно, але обробляємо помилки окремо
      const results = await Promise.allSettled([
        getAllClients(),
        getAllKveds(),
        isTeamLeadValue ? Promise.resolve(teamLeadDepts) : getDepartmentsByProject(user.project_id),
        getGroupCompaniesByProject(user.project_id)
      ])
      
      const clientsData = results[0].status === 'fulfilled' ? results[0].value : []
      const kvedsData = results[1].status === 'fulfilled' ? results[1].value : []
      const departmentsData = results[2].status === 'fulfilled' ? results[2].value : []
      const groupCompaniesData = results[3].status === 'fulfilled' ? results[3].value : []
      
      // Логуємо помилки окремо
      if (results[0].status === 'rejected') {
        console.error('Помилка завантаження клієнтів:', results[0].reason)
      }
      if (results[1].status === 'rejected') {
        console.error('Помилка завантаження КВЕДів:', results[1].reason)
      }
      if (results[2].status === 'rejected') {
        console.error('Помилка завантаження відділів:', results[2].reason)
      }
      if (results[3].status === 'rejected') {
        console.error('Помилка завантаження груп компаній:', results[3].reason)
      }
      
      // Завантажуємо відділи для кожного клієнта (з обробкою помилок)
      const clientsWithDepartments = await Promise.all(
        clientsData.map(async (client) => {
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
      
      // Для тім ліда фільтруємо клієнтів за відділами
      let filteredClients = clientsWithDepartments
      if (isTeamLeadValue && teamLeadDepts.length > 0) {
        const teamLeadDeptIds = teamLeadDepts.map(dept => dept.id)
        filteredClients = clientsWithDepartments.filter(client => {
          // Перевіряємо, чи є хоча б один відділ клієнта, який збігається з відділами тім ліда
          const clientDeptIds = client.departments?.map(dept => dept.id) || []
          return clientDeptIds.some(deptId => teamLeadDeptIds.includes(deptId))
        })
      } else if (isTeamLeadValue) {
        // Якщо тім лід не має відділів, показуємо порожній список
        filteredClients = []
      }
      
      // Завантажуємо кількість активних призначених задач для всіх клієнтів
      if (filteredClients.length > 0) {
        const clientIds = filteredClients.map(client => client.id)
        const tasksCounts = await getActiveAssignedTasksCountForClients(clientIds)
        
        // Додаємо кількість задач до кожного клієнта
        filteredClients = filteredClients.map(client => ({
          ...client,
          activeTasksCount: tasksCounts.get(client.id) || 0
        }))
      }
      
      setClients(filteredClients)
      setKveds(kvedsData)
      setDepartments(departmentsData)
      setGroupCompanies(groupCompaniesData)
      setFilteredGroupCompanies(groupCompaniesData)
      
      // Формуємо повідомлення про помилки
      const errors: string[] = []
      
      if (results[0].status === 'rejected') {
        errors.push('Не вдалося завантажити клієнтів')
      }
      
      if (kvedsData.length === 0) {
        console.warn('КВЕДи не знайдено.')
        console.warn('Переконайтеся, що виконано міграції:')
        console.warn('1. 003_create_kveds.sql - створення таблиці')
        console.warn('2. 005_insert_kveds.sql - вставка даних')
        errors.push('КВЕДи не знайдено. Переконайтеся, що міграція виконана в Supabase.')
      }
      
      if (results[2].status === 'rejected') {
        errors.push('Не вдалося завантажити відділи')
      }
      
      if (results[3].status === 'rejected') {
        errors.push('Не вдалося завантажити групи компаній')
      }
      
      // Показуємо помилки, якщо є критичні
      if (errors.length > 0) {
        setError(errors.join('. '))
      }
    } catch (err: any) {
      console.error('Неочікувана помилка при завантаженні даних:', err)
      setError(`Не вдалося завантажити дані: ${err.message || 'Невідома помилка'}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGroupCompany = async () => {
    if (!newGroupName.trim()) {
      setError('Введіть назву групи компаній')
      return
    }

    if (!user?.project_id) {
      setError('Не вдалося визначити проект')
      return
    }

    try {
      const newGroup = await createGroupCompany(newGroupName.trim(), user.project_id)
      if (newGroup) {
        setGroupCompanies([...groupCompanies, newGroup])
        setFilteredGroupCompanies([...groupCompanies, newGroup])
        setClientForm({ ...clientForm, group_company_id: newGroup.id })
        setGroupCompanySearch(newGroup.group_name)
        setShowCreateGroupModal(false)
        setNewGroupName('')
        setSuccess(`Групу компаній "${newGroup.group_name}" успішно створено`)
      } else {
        setError('Не вдалося створити групу компаній')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка створення групи компаній')
    }
  }

  const handleSelectGroupCompany = (group: GroupCompany) => {
    setClientForm({ ...clientForm, group_company_id: group.id })
    setGroupCompanySearch(group.group_name)
    setShowGroupCompanyDropdown(false)
  }

  const handleEditGroupName = (group: GroupCompany) => {
    setEditingGroupId(group.id)
    setEditingGroupName(group.group_name)
  }

  const handleSaveGroupName = async (groupId: number) => {
    if (!editingGroupName.trim()) {
      setError('Назва групи компаній не може бути порожньою')
      return
    }

    setError(null)
    setSuccess(null)

    try {
      const success = await updateGroupCompany(groupId, editingGroupName.trim())

      if (success) {
        setSuccess('Назву групи компаній успішно оновлено')
        setEditingGroupId(null)
        setEditingGroupName('')
        await loadData() // Перезавантажуємо дані
      } else {
        setError('Не вдалося оновити назву групи компаній')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка оновлення назви групи компаній')
    }
  }

  const handleCancelEditGroup = () => {
    setEditingGroupId(null)
    setEditingGroupName('')
  }

  const handleCreateGroupInModal = async () => {
    if (!newGroupName.trim()) {
      setError('Введіть назву групи компаній')
      return
    }

    if (!user?.project_id) {
      setError('Не вдалося визначити проект')
      return
    }

    setError(null)
    setSuccess(null)

    try {
      const newGroup = await createGroupCompany(newGroupName.trim(), user.project_id)
      if (newGroup) {
        setSuccess(`Групу компаній "${newGroup.group_name}" успішно створено`)
        setNewGroupName('')
        await loadData() // Перезавантажуємо дані
      } else {
        setError('Не вдалося створити групу компаній')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка створення групи компаній')
    }
  }

  const handleEditClient = async (client: ClientWithDepartments) => {
    try {
      // Завантажуємо повну інформацію про клієнта з відділами
      const clientWithRelations = await getClientWithRelations(client.id)
      
      if (!clientWithRelations) {
        setError('Не вдалося завантажити дані клієнта')
        return
      }

      // Заповнюємо форму даними клієнта
      setClientForm({
        edrpou: clientWithRelations.edrpou || '',
        legal_name: clientWithRelations.legal_name,
        phone: clientWithRelations.phone || '',
        status: clientWithRelations.status || 'active',
        company_group: clientWithRelations.company_group || '',
        group_company_id: clientWithRelations.group_company_id || 0,
        service_cost: clientWithRelations.service_cost?.toString() || '',
        company_folder: clientWithRelations.company_folder || '',
        client_card: clientWithRelations.client_card || '',
        address: clientWithRelations.address || '',
        city: clientWithRelations.city || '',
        kved_id: clientWithRelations.kved_id || 0,
        activity_type: clientWithRelations.activity_type || '',
        email: clientWithRelations.email || '',
        type: clientWithRelations.type || '',
        director_full_name: clientWithRelations.director_full_name || '',
        gender: clientWithRelations.gender || '',
        iban: clientWithRelations.iban || '',
        bank_name: clientWithRelations.bank_name || '',
        department_ids: clientWithRelations.departments?.map(d => d.id) || []
      })

      // Встановлюємо пошук групи компаній, якщо вона є
      if (clientWithRelations.group_company) {
        setGroupCompanySearch(clientWithRelations.group_company.group_name)
      } else {
        setGroupCompanySearch('')
      }

      setEditingClientId(client.id)
      setShowCreateModal(true)
      setError(null)
      setSuccess(null)
    } catch (err: any) {
      console.error('Помилка при завантаженні клієнта для редагування:', err)
      setError('Не вдалося завантажити дані клієнта')
    }
  }

  const resetForm = () => {
    // Для тім ліда автоматично встановлюємо його відділи
    const defaultDepartmentIds = isTeamLead && teamLeadDepartments.length > 0
      ? teamLeadDepartments.map(dept => dept.id)
      : []
    
    setClientForm({
      edrpou: '',
      legal_name: '',
      phone: '',
      status: 'active',
      company_group: '',
      group_company_id: 0,
      service_cost: '',
      company_folder: '',
      client_card: '',
      address: '',
      city: '',
      kved_id: 0,
      activity_type: '',
      email: '',
      type: '',
      director_full_name: '',
      gender: '',
      iban: '',
      bank_name: '',
      department_ids: defaultDepartmentIds
    })
    setGroupCompanySearch('')
    setShowGroupCompanyDropdown(false)
    setEditingClientId(null)
  }

  const updateClientDepartments = async (clientId: number, departmentIds: number[]) => {
    try {
      // Видаляємо всі поточні відділи клієнта
      const { error: deleteError } = await supabase
        .from('client_departments')
        .delete()
        .eq('client_id', clientId)

      if (deleteError) {
        console.error('Помилка при видаленні відділів:', deleteError)
        return false
      }

      // Додаємо нові відділи, якщо вони є
      if (departmentIds.length > 0) {
        const departmentResults = await Promise.all(
          departmentIds.map(deptId =>
            supabase.from('client_departments').insert({
              client_id: clientId,
              department_id: deptId
            })
          )
        )
        
        // Перевіряємо чи є помилки
        const errors = departmentResults.filter(result => result.error)
        if (errors.length > 0) {
          console.error('Помилки при збереженні відділів:', errors)
          return false
        }
      }

      return true
    } catch (err) {
      console.error('Помилка при оновленні відділів:', err)
      return false
    }
  }

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!clientForm.legal_name.trim()) {
      setError('Введіть юридичну назву')
      return
    }

    setError(null)
    setSuccess(null)

    try {
      const clientData = {
        edrpou: clientForm.edrpou || undefined,
        legal_name: clientForm.legal_name,
        phone: clientForm.phone || undefined,
        status: clientForm.status,
        company_group: clientForm.company_group || undefined,
        group_company_id: clientForm.group_company_id > 0 ? clientForm.group_company_id : undefined,
        service_cost: clientForm.service_cost ? parseFloat(clientForm.service_cost) : undefined,
        company_folder: clientForm.company_folder || undefined,
        client_card: clientForm.client_card || undefined,
        address: clientForm.address || undefined,
        city: clientForm.city || undefined,
        kved_id: clientForm.kved_id > 0 ? clientForm.kved_id : undefined,
        activity_type: clientForm.activity_type || undefined,
        email: clientForm.email || undefined,
        type: clientForm.type || undefined,
        director_full_name: clientForm.director_full_name || undefined,
        gender: clientForm.gender || undefined,
        iban: clientForm.iban || undefined,
        bank_name: clientForm.bank_name || undefined,
      }

      if (editingClientId) {
        // Редагування існуючого клієнта
        const success = await updateClient(editingClientId, clientData)
        
        if (success) {
          // Оновлюємо відділи
          const deptSuccess = await updateClientDepartments(editingClientId, clientForm.department_ids)
          
          if (!deptSuccess) {
            setError('Клієнт оновлено, але не вдалося зберегти відділи')
          } else {
            setSuccess(`Клієнт "${clientForm.legal_name}" успішно оновлено`)
          }
          
          resetForm()
          setShowCreateModal(false)
          await loadData()
        } else {
          setError('Не вдалося оновити клієнта')
        }
      } else {
        // Створення нового клієнта
        const newClient = await createClient(clientData)

      if (newClient) {
        // Якщо є відділи, призначаємо їх
        if (clientForm.department_ids.length > 0 && newClient.id) {
            const deptSuccess = await updateClientDepartments(newClient.id, clientForm.department_ids)
            
            if (!deptSuccess) {
            setError('Клієнт створено, але не вдалося зберегти відділи')
          }
        }

        setSuccess(`Клієнт "${clientForm.legal_name}" успішно створено`)
          resetForm()
        setShowCreateModal(false)
        await loadData()
      } else {
        setError('Не вдалося створити клієнта')
        }
      }
    } catch (err: any) {
      console.error('Помилка при збереженні клієнта:', err)
      setError(err.message || (editingClientId ? 'Помилка оновлення клієнта' : 'Помилка створення клієнта'))
    }
  }

  const handleViewClient = (client: Client) => {
    navigate(`/clients/${client.id}`)
  }

  const handleToggleStatusClick = (client: Client) => {
    setClientToToggle(client)
    setShowConfirmModal(true)
  }

  const handleConfirmToggleStatus = async () => {
    if (!clientToToggle) return

    const newStatus = clientToToggle.status === 'active' ? 'inactive' : 'active'
    
    setError(null)
    setSuccess(null)

    try {
      const success = await updateClientStatus(clientToToggle.id, newStatus)
      
      if (success) {
        setSuccess(`Клієнт "${clientToToggle.legal_name}" ${newStatus === 'active' ? 'активовано' : 'деактивовано'}`)
        setShowConfirmModal(false)
        setClientToToggle(null)
        await loadData()
      } else {
        setError('Не вдалося змінити статус клієнта')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка зміни статусу клієнта')
    }
  }

  const toggleDepartment = (departmentId: number) => {
    setClientForm(prev => ({
      ...prev,
      department_ids: prev.department_ids.includes(departmentId)
        ? prev.department_ids.filter(id => id !== departmentId)
        : [...prev.department_ids, departmentId]
    }))
  }

  // Групування клієнтів за групою компаній
  const groupClientsByCompanyGroup = (clients: ClientWithDepartments[]): Map<number | 'no-group', ClientWithDepartments[]> => {
    const grouped = new Map<number | 'no-group', ClientWithDepartments[]>()
    
    clients.forEach(client => {
      const groupId = client.group_company_id || 'no-group'
      if (!grouped.has(groupId)) {
        grouped.set(groupId, [])
      }
      grouped.get(groupId)!.push(client)
    })
    
    return grouped
  }

  const toggleClientGroup = (groupId: number | 'no-group') => {
    setExpandedClientGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(groupId)) {
        newSet.delete(groupId)
      } else {
        newSet.add(groupId)
      }
      return newSet
    })
  }

  // Функції для роботи з призначенням задач
  const handleAssignTasksClick = async (client: ClientWithDepartments) => {
    setSelectedClientForTasks(client)
    setError(null)
    setSuccess(null)
    
    try {
      // Завантажуємо ВСІ призначені задачі для клієнта (для фільтрації)
      const allAssigned = await getAssignedTasksByClient(client.id)
      setAllAssignedTasksForClient(allAssigned)
      
      // Завантажуємо призначені задачі для відображення (фільтровані по group_id для тім ліда)
      const assigned = isTeamLead && user?.id
        ? await getAssignedTasksByClientAndGroup(client.id, user.id)
        : allAssigned
      setAssignedTasks(assigned)
      
      // Завантажуємо доступні задачі та виконавців
      if (user?.project_id) {
        const [tasks, executors, roles] = await Promise.all([
          getTasksByProject(user.project_id),
          getUsersByProject(user.project_id),
          getAllRoles()
        ])
        setAvailableTasks(tasks)
        
        // Знаходимо роль "Бухгалтер"
        const accountantRole = roles.find(r => r.role_name === 'Бухгалтер')
        const accountantRoleId = accountantRole?.id
        
        // Фільтруємо виконавців
        let filteredExecutors: User[] = []
        
        if (isTeamLead && user?.id && accountantRoleId) {
          // Для тім ліда: лише бухгалтери з його групи
          filteredExecutors = executors.filter(u => 
            u.role_id === accountantRoleId && u.group_id === user.id
          )
        } else {
          // Для інших ролей: виключаємо адміністраторів та керівників виробництва
          filteredExecutors = executors.filter(u => u.role_id !== 1 && u.role_id !== 2)
        }
        
        setAvailableExecutors(filteredExecutors)
      }
      
      setShowAssignTasksModal(true)
    } catch (err: any) {
      setError('Не вдалося завантажити дані для призначення задач')
      console.error(err)
    }
  }

  // Функція для отримання назви місяця
  const getMonthName = (month: number) => {
    const months = [
      'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
      'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
    ]
    return months[month - 1]
  }

  // Функція для витягування базової назви задачі (без суфіксів типу " - Січень")
  const getBaseTaskName = (taskName: string): string => {
    if (!taskName) return ''
    // Видаляємо суфікси типу " - Січень", " - 1 квартал" тощо
    const monthPattern = / - (Січень|Лютий|Березень|Квітень|Травень|Червень|Липень|Серпень|Вересень|Жовтень|Листопад|Грудень)$/
    const quarterPattern = / - \d+ квартал$/
    
    let baseName = taskName
    baseName = baseName.replace(monthPattern, '')
    baseName = baseName.replace(quarterPattern, '')
    
    return baseName.trim()
  }

  // Функція для отримання доступних задач для вибору
  const getAvailableTasksForSelect = (): Task[] => {
    if (!availableTasks || availableTasks.length === 0) {
      return []
    }
    
    try {
      // Отримуємо ID задач, які вже призначені цьому клієнту
      // Важливо: використовуємо allAssignedTasksForClient для фільтрації,
      // щоб перевірити ВСІ призначені задачі для клієнта, незалежно від group_id
      // Це запобігає дублюванню призначень
      const assignedTaskIds = new Set((allAssignedTasksForClient.length > 0 ? allAssignedTasksForClient : assignedTasks).map(at => at.task_id))
      
      // Фільтруємо задачі, які ще не призначені цьому клієнту
      const unassignedTasks = availableTasks.filter(task => !assignedTaskIds.has(task.id))
      
      // Групуємо за базовою назвою та повертаємо унікальні групи
      return Array.from(new Map(unassignedTasks
        .filter(t => t.task_name) // Фільтруємо задачі без назви
        .map(t => {
          const baseName = getBaseTaskName(t.task_name || '')
          return [baseName, t]
        })).values())
    } catch (error) {
      console.error('Помилка фільтрації задач:', error)
      return availableTasks || []
    }
  }

  // Групуємо призначені задачі по базовій назві та сортуємо за planned_date
  const groupedTasks = useMemo(() => {
    const grouped = new Map<string, AssignedTaskWithDetails[]>()
    
    if (!assignedTasks || assignedTasks.length === 0) {
      return grouped
    }
    
    // Спочатку групуємо задачі
    assignedTasks.forEach(task => {
      const baseName = task.task ? getBaseTaskName(task.task.task_name) : `Задача #${task.task_id}`
      if (!grouped.has(baseName)) {
        grouped.set(baseName, [])
      }
      grouped.get(baseName)!.push(task)
    })
    
    // Потім сортуємо задачі всередині кожної групи за planned_date (від першого до останнього місяця)
    // Створюємо нові масиви замість мутації існуючих
    grouped.forEach((groupTasks, baseName) => {
      const sorted = [...groupTasks].sort((a, b) => {
        const dateA = a.task?.planned_date
        const dateB = b.task?.planned_date
        
        // Якщо немає дати, ставимо в кінець
        if (!dateA && !dateB) return 0
        if (!dateA) return 1
        if (!dateB) return -1
        
        // Порівнюємо дати
        const parsedDateA = new Date(dateA)
        const parsedDateB = new Date(dateB)
        
        return parsedDateA.getTime() - parsedDateB.getTime()
      })
      grouped.set(baseName, sorted)
    })
    
    return grouped
  }, [assignedTasks])

  const toggleAssignedTaskGroup = (baseName: string) => {
    setExpandedAssignedTaskGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(baseName)) {
        newSet.delete(baseName)
      } else {
        newSet.add(baseName)
      }
      return newSet
    })
  }

  const handleUpdateExecutor = async (taskId: number, executorId: number | null) => {
    if (!selectedClientForTasks) return
    
    // Якщо вже виконується оновлення, ігноруємо повторні виклики
    if (isUpdatingRef.current) {
      console.log('Оновлення вже виконується, ігноруємо виклик для taskId:', taskId)
      return
    }
    
    // Якщо executorId === 0, це означає "-- Оберіть виконавця --", встановлюємо null
    const finalExecutorId = executorId === 0 ? null : executorId
    
    // Знаходимо задачу для перевірки - використовуємо строгу перевірку
    const taskToUpdate = assignedTasks.find(t => t.id === taskId)
    if (!taskToUpdate) {
      console.error('Задачу не знайдено для оновлення:', taskId, 'Доступні ID:', assignedTasks.map(t => t.id))
      return
    }
    
    // Перевіряємо, чи значення реально змінилося
    const currentExecutorId = taskToUpdate.executor_id || null
    if (currentExecutorId === finalExecutorId) {
      console.log('Значення не змінилося, ігноруємо оновлення для задачі:', taskId, 'executorId:', finalExecutorId)
      return
    }
    
    console.log('Оновлюємо задачу:', {
      taskId,
      currentExecutorId: taskToUpdate.executor_id,
      newExecutorId: finalExecutorId,
      currentGroupId: taskToUpdate.group_id
    })
    
    // Зберігаємо початковий стан для відкату
    const originalExecutorId = taskToUpdate.executor_id
    const originalGroupId = taskToUpdate.group_id
    
    // Встановлюємо прапорець, що оновлення виконується
    isUpdatingRef.current = true
    
    // Зберігаємо поточний editingAssignedTaskId перед будь-якими змінами (з ref для надійності)
    const currentEditingId = editingTaskIdRef.current ?? editingAssignedTaskId
    console.log('Зберігаємо editingAssignedTaskId перед оновленням:', currentEditingId, 'для задачі:', taskId, 'ref:', editingTaskIdRef.current)
    
    try {
      // Отримуємо group_id з виконавця (якщо виконавець обрано)
      let executorGroupId: number | null = null
      if (finalExecutorId) {
        const executor = availableExecutors.find(e => e.id === finalExecutorId)
        if (executor) {
          executorGroupId = executor.group_id || null
          console.log(`Отримано group_id ${executorGroupId} з виконавця ${finalExecutorId}`)
        } else {
          console.warn('Виконавець не знайдено в availableExecutors:', finalExecutorId)
        }
      } else {
        // Якщо виконавець видаляється, group_id також має бути null
        executorGroupId = null
        console.log('Видаляємо виконавця, встановлюємо group_id в null')
      }
      
      // Оптимістичне оновлення тільки для конкретної задачі з строгою перевіркою ID
      setAssignedTasks(prev => {
        const updated = prev.map(task => {
          // Використовуємо строгу перевірку === для уникнення плутанини
          if (task.id === taskId) {
            console.log('Оновлюємо задачу в стані:', task.id, '->', finalExecutorId)
            // Оновлюємо також об'єкт executor, якщо виконавець обрано
            const newExecutor = finalExecutorId 
              ? availableExecutors.find(e => e.id === finalExecutorId) || undefined
              : undefined
            
            return { 
              ...task, 
              executor_id: finalExecutorId,
              group_id: executorGroupId,
              executor: newExecutor
            }
          }
          return task
        })
        console.log('Оновлено задач у стані:', updated.filter(t => t.id === taskId).length, 'з', updated.length)
        return updated
      })
      
      // Оновлюємо в БД: executor_id та group_id
      const updateData: { executor_id: number | null; group_id?: number | null } = { 
        executor_id: finalExecutorId,
        group_id: executorGroupId
      }
      
      console.log('Відправляємо оновлення в БД для taskId:', taskId, 'дані:', updateData)
      const success = await updateAssignedTask(taskId, updateData)
      
      if (!success) {
        console.error('Помилка оновлення задачі в БД:', taskId)
        // Якщо помилка - відкатуємо зміни
        setAssignedTasks(prev => prev.map(task => {
          if (task.id === taskId) {
            return { 
              ...task, 
              executor_id: originalExecutorId,
              group_id: originalGroupId
            }
          }
          return task
        }))
        setError('Не вдалося оновити виконавця')
      } else {
        console.log('Успішно оновлено задачу в БД:', taskId)
        // previousExecutorValuesRef вже оновлено синхронно перед оновленням стану
        
        // Не перезавантажуємо дані з сервера, оскільки ми вже оновили задачу локально
        // Це запобігає зміні порядку задач і зміщенню редагування
        
        // Скидаємо прапорець після завершення оновлення
        isUpdatingRef.current = false
      }
    } catch (err: any) {
      console.error('Помилка в handleUpdateExecutor:', err)
      // Відкатуємо зміни при помилці
      setAssignedTasks(prev => prev.map(task => {
        if (task.id === taskId) {
          return { 
            ...task, 
            executor_id: originalExecutorId,
            group_id: originalGroupId
          }
        }
        return task
      }))
      setError('Не вдалося оновити виконавця')
      // Скидаємо прапорець при помилці
      isUpdatingRef.current = false
    }
  }

  const handleToggleTaskActive = async (taskId: number, currentStatus: boolean) => {
    if (!selectedClientForTasks) return
    
    console.log('handleToggleTaskActive викликано для taskId:', taskId, 'currentStatus:', currentStatus, 'поточний editingAssignedTaskId:', editingAssignedTaskId)
    
    // Знаходимо задачу для перевірки - використовуємо строгу перевірку
    const taskToUpdate = assignedTasks.find(t => t.id === taskId)
    if (!taskToUpdate) {
      console.error('Задачу не знайдено для оновлення:', taskId, 'Доступні ID:', assignedTasks.map(t => t.id))
      return
    }
    
    const newStatus = !currentStatus
    console.log('Змінюємо статус задачі:', {
      taskId,
      currentStatus,
      newStatus
    })
    
    // Зберігаємо поточний editingAssignedTaskId перед будь-якими змінами (з ref для надійності)
    const currentEditingId = editingTaskIdRef.current ?? editingAssignedTaskId
    console.log('Зберігаємо editingAssignedTaskId перед оновленням:', currentEditingId, 'для задачі:', taskId, 'ref:', editingTaskIdRef.current)
    
    try {
      // Оптимістичне оновлення тільки для конкретної задачі з строгою перевіркою ID
      setAssignedTasks(prev => {
        const updated = prev.map(task => {
          // Використовуємо строгу перевірку === для уникнення плутанини
          if (task.id === taskId) {
            console.log('Оновлюємо статус задачі в стані:', task.id, '->', newStatus)
            return { ...task, is_active: newStatus }
          }
          return task
        })
        console.log('Оновлено задач у стані:', updated.filter(t => t.id === taskId).length, 'з', updated.length)
        return updated
      })
      
      console.log('Відправляємо оновлення статусу в БД для taskId:', taskId, 'is_active:', newStatus)
      const success = await updateAssignedTask(taskId, { is_active: newStatus })
      
      if (!success) {
        console.error('Помилка оновлення статусу задачі в БД:', taskId)
        // Якщо помилка - відкатуємо зміни
        setAssignedTasks(prev => prev.map(task => {
          if (task.id === taskId) {
            return { ...task, is_active: currentStatus }
          }
          return task
        }))
        setError('Не вдалося змінити статус задачі')
      } else {
        console.log('Успішно оновлено статус задачі в БД:', taskId)
        // Не перезавантажуємо дані з сервера, оскільки ми вже оновили задачу локально
        // Це запобігає зміні порядку задач і зміщенню редагування
        
        // Оновлюємо кількість активних задач у списку клієнтів
        const tasksCount = await getActiveAssignedTasksCountForClients([selectedClientForTasks.id])
        setClients(prev => prev.map(client => 
          client.id === selectedClientForTasks.id 
            ? { ...client, activeTasksCount: tasksCount.get(selectedClientForTasks.id) || 0 }
            : client
        ))
      }
    } catch (err: any) {
      // Відкатуємо зміни при помилці
      setAssignedTasks(prev => prev.map(task => {
        if (task.id === taskId) {
          return { ...task, is_active: currentStatus }
        }
        return task
      }))
      setError('Не вдалося змінити статус задачі')
      console.error(err)
    }
  }

  const handleUpdateTaskStatus = async (taskId: number, status: string) => {
    try {
      const success = await updateAssignedTask(taskId, { task_status: status || null })
      if (success && selectedClientForTasks) {
        // Оновлюємо тільки конкретну задачу локально, не перезавантажуючи всі дані
        setAssignedTasks(prev => prev.map(task => 
          task.id === taskId ? { ...task, task_status: status || null } : task
        ))
      }
    } catch (err: any) {
      setError('Не вдалося оновити статус задачі')
      console.error(err)
    }
  }

  const handleUpdateCompletionDate = async (taskId: number, date: string) => {
    try {
      const isoDate = date ? parseDateToISO(date) : null
      const success = await updateAssignedTask(taskId, { completion_date: isoDate || null })
      if (success && selectedClientForTasks) {
        // Оновлюємо тільки конкретну задачу локально, не перезавантажуючи всі дані
        setAssignedTasks(prev => prev.map(task => 
          task.id === taskId ? { ...task, completion_date: isoDate || null } : task
        ))
      }
    } catch (err: any) {
      setError('Не вдалося оновити дату виконання')
      console.error(err)
    }
  }

  const handleUpdateCompletionTime = async (taskId: number, minutes: number | null) => {
    try {
      const success = await updateAssignedTask(taskId, { completion_time_minutes: minutes })
      if (success && selectedClientForTasks) {
        // Оновлюємо тільки конкретну задачу локально, не перезавантажуючи всі дані
        setAssignedTasks(prev => prev.map(task => 
          task.id === taskId ? { ...task, completion_time_minutes: minutes } : task
        ))
      }
    } catch (err: any) {
      setError('Не вдалося оновити час виконання')
      console.error(err)
    }
  }

  const handleTaskSelect = async (taskId: number) => {
    setSelectedTaskId(taskId)
    const task = availableTasks.find(t => t.id === taskId)
    
    if (!task) {
      setSelectedTaskDates([])
      return
    }

    // Отримуємо базову назву задачі
    const baseName = getBaseTaskName(task.task_name)
    
    // Отримуємо всі задачі з такою ж базовою назвою (група задач)
    const relatedTasks = availableTasks.filter(t => {
      const tBaseName = getBaseTaskName(t.task_name)
      return tBaseName === baseName
    })

    // Створюємо масив дат з обраної задачі/групи задач з визначенням місяця
    const dates = relatedTasks.map(t => {
      const dateStr = t.planned_date.split('T')[0]
      const date = new Date(dateStr)
      const month = date.getMonth() + 1 // Місяці від 1 до 12
      return {
        month,
        date: dateStr,
        executorId: 0,
        isActive: true
      }
    })

    setSelectedTaskDates(dates)
  }

  const handleAddAssignedTasks = async () => {
    if (!selectedClientForTasks || selectedTaskId === 0 || selectedTaskDates.length === 0) {
      setError('Оберіть задачу та заповніть всі поля')
      return
    }

    setError(null)
    setSuccess(null)

    try {
      // Отримуємо всі задачі з такою ж базовою назвою
      const selectedTask = availableTasks.find(t => t.id === selectedTaskId)
      if (!selectedTask) {
        setError('Задачу не знайдено')
        return
      }

      const baseName = getBaseTaskName(selectedTask.task_name)
      const relatedTasks = availableTasks.filter(t => {
        const tBaseName = getBaseTaskName(t.task_name)
        return tBaseName === baseName
      })

      console.log('handleAddAssignedTasks - selectedTask:', selectedTask)
      console.log('handleAddAssignedTasks - relatedTasks:', relatedTasks)
      console.log('handleAddAssignedTasks - selectedTaskDates:', selectedTaskDates)
      console.log('handleAddAssignedTasks - isTeamLead:', isTeamLead, 'user?.id:', user?.id, 'user?.group_id:', user?.group_id)

      // Перевіряємо, чи є вже призначені задачі для цього клієнта
      // Використовуємо allAssignedTasksForClient для перевірки, щоб уникнути дублювання
      const existingTaskIds = new Set((allAssignedTasksForClient.length > 0 ? allAssignedTasksForClient : await getAssignedTasksByClient(selectedClientForTasks.id)).map(t => t.task_id))

      // Створюємо призначені задачі для кожної дати з відповідною task_id
      const tasksToCreate = selectedTaskDates
        .map((dateItem) => {
          const relatedTask = relatedTasks.find(t => {
            const taskDate = t.planned_date.split('T')[0]
            const match = taskDate === dateItem.date
            if (!match) {
              console.log('Date mismatch:', { taskDate, dateItemDate: dateItem.date, taskId: t.id, taskName: t.task_name })
            }
            return match
          })
          
          const taskId = relatedTask?.id || selectedTaskId
          
          // Перевіряємо, чи задача вже призначена цьому клієнту
          if (existingTaskIds.has(taskId)) {
            console.warn('Task already assigned to client:', taskId, 'client:', selectedClientForTasks.id)
            return null // Пропускаємо цю задачу
          }
          
          // Для тім ліда group_id = user.id (ID тім ліда)
          // Для інших ролей group_id = user.group_id (якщо є)
          const groupId = isTeamLead ? user?.id : (user?.group_id || null)
          
          if (!groupId && isTeamLead) {
            console.error('Team lead user.id is missing!', user)
            throw new Error('Не вдалося визначити group_id для тім ліда')
          }
          
          const taskData = {
            task_id: taskId,
            client_id: selectedClientForTasks.id,
            department_id: selectedClientForTasks.departments?.[0]?.id || null,
            group_id: groupId,
            executor_id: dateItem.executorId || null,
            is_active: dateItem.isActive
          }
          
          console.log('Task to create:', taskData, 'relatedTask found:', !!relatedTask)
          
          return taskData
        })
        .filter((task): task is NonNullable<typeof task> => task !== null) // Видаляємо null значення

      if (tasksToCreate.length === 0) {
        setError('Всі обрані задачі вже призначені цьому клієнту')
        return
      }

      console.log('Tasks to create (after filtering):', tasksToCreate)

      const created = await createMultipleAssignedTasks(tasksToCreate)
      
      console.log('Created tasks result:', created)
      
      if (created.length > 0) {
        const skippedCount = tasksToCreate.length - created.length
        let successMessage = `Успішно призначено ${created.length} ${created.length === 1 ? 'задачу' : created.length < 5 ? 'задачі' : 'задач'}`
        if (skippedCount > 0) {
          successMessage += `. ${skippedCount} ${skippedCount === 1 ? 'задача вже була призначена' : skippedCount < 5 ? 'задачі вже були призначені' : 'задач вже були призначені'}`
        }
        setSuccess(successMessage)
        // Оновлюємо список ВСІХ призначених задач для клієнта (для фільтрації)
        const allUpdated = await getAssignedTasksByClient(selectedClientForTasks.id)
        setAllAssignedTasksForClient(allUpdated)
        
        // Оновлюємо список призначених задач для відображення (фільтровані по group_id для тім ліда)
        const updated = isTeamLead && user?.id
          ? await getAssignedTasksByClientAndGroup(selectedClientForTasks.id, user.id)
          : allUpdated
        setAssignedTasks(updated)
        // Оновлюємо кількість задач у списку клієнтів
        await loadData()
        // Очищаємо форму
        setSelectedTaskId(0)
        setSelectedTaskDates([])
        // Оновлюємо список доступних задач - видаляємо ті, що вже призначені
        // (це відбудеться автоматично через фільтрацію в render, але можна явно оновити)
        // availableTasks залишається незмінним, фільтрація відбувається в render
      } else {
        console.error('createMultipleAssignedTasks returned empty array. Tasks to create:', tasksToCreate)
        setError('Не вдалося призначити задачі. Можливо, всі обрані задачі вже призначені цьому клієнту або виникла помилка. Перевірте консоль для деталей.')
      }
    } catch (err: any) {
      console.error('Error in handleAddAssignedTasks:', err)
      setError(err.message || 'Помилка призначення задач')
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
        <h2>Клієнти</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-primary" onClick={() => {
            resetForm()
            setShowCreateModal(true)
          }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Створити клієнта
        </button>
          <button 
            className="btn-primary" 
            onClick={() => {
              setShowAllGroupsModal(true)
              setError(null)
              setSuccess(null)
              handleCancelEditGroup()
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
              <line x1="9" y1="9" x2="21" y2="9"></line>
            </svg>
            Групи компаній
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

      <div className="table-container">
        {clients.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            Немає клієнтів
          </div>
        ) : (
          Array.from(groupClientsByCompanyGroup(clients).entries()).map(([groupId, groupClients]) => {
            const isExpanded = expandedClientGroups.has(groupId)
            const groupName = groupId === 'no-group' 
              ? 'Клієнти без групи' 
              : groupCompanies.find(gc => gc.id === groupId)?.group_name || `Група #${groupId}`
            const clientsCount = groupClients.length
            
            return (
              <div
                key={groupId}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  marginBottom: '12px',
                  overflow: 'hidden',
                  background: '#ffffff'
                }}
              >
                {/* Заголовок групи */}
                <div
                  onClick={() => toggleClientGroup(groupId)}
                  style={{
                    padding: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: isExpanded ? '#f7fafc' : '#ffffff',
                    transition: 'background-color 0.2s',
                    borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s'
                      }}
                    >
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '16px', color: '#2d3748' }}>
                        {groupName}
                      </div>
                      <div style={{ fontSize: '14px', color: '#718096', marginTop: '4px' }}>
                        {clientsCount} {clientsCount === 1 ? 'клієнт' : clientsCount < 5 ? 'клієнти' : 'клієнтів'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Розкритий список клієнтів */}
                {isExpanded && (
                  <div style={{ padding: '16px', background: '#ffffff' }}>
                    <table className="admin-table" style={{ margin: 0 }}>
          <thead>
            <tr>
                          <th style={{ width: '80px', textAlign: 'center' }}>Задачі</th>
              <th>ЕДРПОУ</th>
              <th>Юр. назва</th>
              <th>Телефон</th>
              <th>Email</th>
              <th>Місто</th>
              <th>Відділи</th>
              <th>Статус</th>
              <th>Вартість обслуговування</th>
              <th>Дата створення</th>
              <th>Дії</th>
            </tr>
          </thead>
          <tbody>
                        {groupClients.map((client) => (
                <React.Fragment key={client.id}>
                <tr>
                            <td style={{ textAlign: 'center', padding: '8px' }}>
                              {client.activeTasksCount === undefined || client.activeTasksCount === 0 ? (
                                <div
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    backgroundColor: '#fee2e2',
                                    color: '#dc2626',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                  }}
                                  title="Немає призначених задач"
                                  onClick={() => toggleClientTasks(client.id)}
                                >
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                  </svg>
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    borderRadius: '16px',
                                    backgroundColor: expandedClientsWithTasks.has(client.id) ? '#4299e1' : '#f3f4f6',
                                    color: expandedClientsWithTasks.has(client.id) ? '#ffffff' : '#6b7280',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                  }}
                                  title={`${client.activeTasksCount} ${client.activeTasksCount === 1 ? 'призначена задача' : client.activeTasksCount < 5 ? 'призначені задачі' : 'призначених задач'}. Натисніть для перегляду`}
                                  onClick={() => toggleClientTasks(client.id)}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M9 11l3 3L22 4"></path>
                                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                                  </svg>
                                  <span>{client.activeTasksCount}</span>
                                </div>
                              )}
                            </td>
                  <td>{client.edrpou || '-'}</td>
                  <td>{client.legal_name}</td>
                  <td>{client.phone || '-'}</td>
                  <td>{client.email || '-'}</td>
                  <td>{client.city || '-'}</td>
                  <td>
                    {client.departments && client.departments.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {client.departments.map((dept) => (
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
                    <span className={`status-badge ${getStatusBadgeClass(client.status)}`}>
                      {getStatusText(client.status)}
                    </span>
                  </td>
                  <td>{formatCurrency(client.service_cost)}</td>
                  <td>{formatDate(client.created_at)}</td>
                  <td>
                    <div className="action-buttons">
                                <button
                                  className="btn-action btn-edit"
                                  onClick={() => handleEditClient(client)}
                                  title="Редагувати"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                  </svg>
                                </button>
                                {!isTeamLead && (
                      <button
                        className={`btn-action btn-toggle ${client.status === 'active' ? 'inactive' : 'active'}`}
                        onClick={() => handleToggleStatusClick(client)}
                        title={client.status === 'active' ? 'Деактивувати' : 'Активувати'}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
                          <line x1="12" y1="2" x2="12" y2="12"></line>
                        </svg>
                      </button>
                                )}
                      <button
                        className="btn-action btn-view"
                        onClick={() => handleViewClient(client)}
                        title="Перегляд"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      </button>
                                <button
                                  className="btn-action"
                                  onClick={() => handleAssignTasksClick(client)}
                                  title="Призначити задачі"
                                  style={{ color: '#4299e1' }}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                    <line x1="12" y1="16" x2="12" y2="12"></line>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
                {/* Розгорнута секція з задачами клієнта */}
                {expandedClientsWithTasks.has(client.id) && (
                  <tr>
                    <td colSpan={11} style={{ padding: '0', background: '#f7fafc' }}>
                      <div style={{ padding: '20px' }}>
                        {/* Навігація по періодах */}
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginBottom: '16px',
                          padding: '12px',
                          background: '#ffffff',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button
                              onClick={async () => {
                                const period = clientTasksPeriod.get(client.id) || { type: 'week' as const, startDate: getCurrentWeekMonday() }
                                const newStartDate = period.type === 'week' 
                                  ? addDays(period.startDate, -7)
                                  : addMonths(period.startDate, -1)
                                setClientTasksPeriod(prev => {
                                  const newMap = new Map(prev)
                                  newMap.set(client.id, { ...period, startDate: newStartDate })
                                  return newMap
                                })
                                await loadClientTasks(client.id)
                                setClientTasksPage(prev => {
                                  const newMap = new Map(prev)
                                  newMap.set(client.id, 0)
                                  return newMap
                                })
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
                            <span style={{ fontSize: '14px', fontWeight: '500', color: '#2d3748' }}>
                              {(() => {
                                const period = clientTasksPeriod.get(client.id) || { type: 'week' as const, startDate: getCurrentWeekMonday() }
                                if (period.type === 'week') {
                                  const endDate = addDays(period.startDate, 6)
                                  return `${formatDateToUA(period.startDate.toISOString().split('T')[0])} - ${formatDateToUA(endDate.toISOString().split('T')[0])}`
                                } else {
                                  return period.startDate.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })
                                }
                              })()}
                            </span>
                            <button
                              onClick={async () => {
                                const period = clientTasksPeriod.get(client.id) || { type: 'week' as const, startDate: getCurrentWeekMonday() }
                                const newStartDate = period.type === 'week' 
                                  ? addDays(period.startDate, 7)
                                  : addMonths(period.startDate, 1)
                                setClientTasksPeriod(prev => {
                                  const newMap = new Map(prev)
                                  newMap.set(client.id, { ...period, startDate: newStartDate })
                                  return newMap
                                })
                                await loadClientTasks(client.id)
                                setClientTasksPage(prev => {
                                  const newMap = new Map(prev)
                                  newMap.set(client.id, 0)
                                  return newMap
                                })
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
                              onClick={async () => {
                                const period = clientTasksPeriod.get(client.id) || { type: 'week' as const, startDate: getCurrentWeekMonday() }
                                const newType = period.type === 'week' ? 'month' : 'week'
                                const newStartDate = newType === 'week' ? getCurrentWeekMonday() : new Date()
                                setClientTasksPeriod(prev => {
                                  const newMap = new Map(prev)
                                  newMap.set(client.id, { type: newType, startDate: newStartDate })
                                  return newMap
                                })
                                await loadClientTasks(client.id)
                                setClientTasksPage(prev => {
                                  const newMap = new Map(prev)
                                  newMap.set(client.id, 0)
                                  return newMap
                                })
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
                              {(() => {
                                const period = clientTasksPeriod.get(client.id) || { type: 'week' as const, startDate: getCurrentWeekMonday() }
                                return period.type === 'week' ? 'Показати місяць' : 'Показати тиждень'
                              })()}
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => {
                                setSelectedClientForCreateTask(client.id)
                                setShowCreateTaskModal(true)
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
                            <button
                              onClick={() => toggleClientTasks(client.id)}
                              style={{
                                padding: '6px 12px',
                                background: '#f7fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '14px'
                              }}
                            >
                              Згорнути
                            </button>
                          </div>
                        </div>

                        {/* Список задач */}
                        {clientTasksLoading.has(client.id) ? (
                          <div style={{ textAlign: 'center', padding: '40px' }}>Завантаження...</div>
                        ) : (
                          (() => {
                            const tasks = clientTasks.get(client.id) || []
                            const currentPage = clientTasksPage.get(client.id) || 0
                            const TASKS_PER_PAGE = 20
                            const startIndex = currentPage * TASKS_PER_PAGE
                            const endIndex = startIndex + TASKS_PER_PAGE
                            const paginatedTasks = tasks.slice(startIndex, endIndex)
                            const totalPages = Math.ceil(tasks.length / TASKS_PER_PAGE)

                            return (
                              <>
                                {tasks.length === 0 ? (
                                  <div style={{ textAlign: 'center', padding: '40px', color: '#718096' }}>
                                    Немає задач для цього періоду
                                  </div>
                                ) : (
                                  <>
                                    <div style={{ 
                                      display: 'flex', 
                                      flexDirection: 'column', 
                                      gap: '12px',
                                      marginBottom: '16px'
                                    }}>
                                      {paginatedTasks.map(task => {
                                        // Використовуємо статус зі статистики (з логів), якщо він є, інакше автоматичне визначення
                                        const stats = clientTaskTimeStats.get(task.id)
                                        const status = stats?.status || getTaskStatus(task)
                                        
                                        const executorName = task.executor
                                          ? [task.executor.surname, task.executor.name, task.executor.middle_name]
                                              .filter(Boolean)
                                              .join(' ') || task.executor.email
                                          : 'Не призначено'
                                        const taskDate = task.task?.planned_date 
                                          ? formatDateToUA(task.task.planned_date.split('T')[0])
                                          : 'Не вказано'
                                        
                                        // Час виконання з логів
                                        const timeSpent = stats?.totalMinutes 
                                          ? formatMinutesToHoursMinutes(stats.totalMinutes)
                                          : task.completion_time_minutes 
                                            ? formatMinutesToHoursMinutes(task.completion_time_minutes)
                                            : null

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
                                                  <span><strong>Виконавець:</strong> {executorName}</span>
                                                  {task.task?.task_type && (
                                                    <span><strong>Тип:</strong> {getTaskTypeText(task.task.task_type)}</span>
                                                  )}
                                                  {timeSpent && (
                                                    <span><strong>Час виконання:</strong> {timeSpent}</span>
                                                  )}
                                                </div>
                                                {task.task?.description && (
                                                  <p style={{ 
                                                    marginTop: '8px', 
                                                    fontSize: '14px', 
                                                    color: task.is_active ? '#4a5568' : '#a0aec0',
                                                    lineHeight: '1.5'
                                                  }}>
                                                    {task.task.description}
                                                  </p>
                                                )}
                                              </div>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className={`status-badge ${getStatusBadgeClass(status)}`} style={{ marginLeft: '12px' }}>
                                                  {getStatusText(status)}
                                                </span>
                                                <button
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    setEditingClientTaskId(task.id)
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
                                          </div>
                                        )
                                      })}
                                    </div>

                                    {/* Пагінація задач */}
                                    {totalPages > 1 && (
                                      <div style={{ 
                                        display: 'flex', 
                                        justifyContent: 'center', 
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '12px',
                                        background: '#ffffff',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0'
                                      }}>
                                        <button
                                          onClick={() => setClientTasksPage(prev => {
                                            const newMap = new Map(prev)
                                            newMap.set(client.id, Math.max(0, (newMap.get(client.id) || 0) - 1))
                                            return newMap
                                          })}
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
                                          Сторінка {currentPage + 1} з {totalPages} (всього задач: {tasks.length})
                                        </span>
                                        <button
                                          onClick={() => setClientTasksPage(prev => {
                                            const newMap = new Map(prev)
                                            newMap.set(client.id, Math.min(totalPages - 1, (newMap.get(client.id) || 0) + 1))
                                            return newMap
                                          })}
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
                            )
                          })()
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
                        ))}
          </tbody>
        </table>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => {
          setShowCreateModal(false)
          resetForm()
        }}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingClientId ? 'Редагувати клієнта' : 'Створити клієнта'}</h3>
              <button className="modal-close" onClick={() => {
                setShowCreateModal(false)
                resetForm()
              }}>
                ×
              </button>
            </div>
            <form onSubmit={handleCreateClient}>
              <div className="form-row">
                <div className="form-group">
                  <label>ЕДРПОУ</label>
                  <input
                    type="text"
                    value={clientForm.edrpou}
                    onChange={(e) => setClientForm({ ...clientForm, edrpou: e.target.value })}
                    placeholder="Введіть ЕДРПОУ"
                  />
                </div>
                <div className="form-group">
                  <label>Юр. назва *</label>
                  <input
                    type="text"
                    value={clientForm.legal_name}
                    onChange={(e) => setClientForm({ ...clientForm, legal_name: e.target.value })}
                    placeholder="Введіть юридичну назву"
                    required
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Телефон</label>
                  <input
                    type="tel"
                    value={clientForm.phone}
                    onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                    placeholder="Введіть телефон"
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={clientForm.email}
                    onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                    placeholder="Введіть email"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Статус</label>
                  <select
                    value={clientForm.status}
                    onChange={(e) => setClientForm({ ...clientForm, status: e.target.value })}
                  >
                    <option value="active">Активний</option>
                    <option value="inactive">Неактивний</option>
                  </select>
                </div>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label>Група компаній</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      ref={groupCompanyInputRef}
                      type="text"
                      value={groupCompanySearch}
                      onChange={(e) => {
                        setGroupCompanySearch(e.target.value)
                        setShowGroupCompanyDropdown(true)
                        if (e.target.value === '') {
                          setClientForm({ ...clientForm, group_company_id: 0 })
                        }
                      }}
                      onFocus={() => setShowGroupCompanyDropdown(true)}
                      placeholder="Введіть назву групи компаній або створіть нову"
                      style={{ width: '100%' }}
                    />
                    {showGroupCompanyDropdown && (
                      <div
                        ref={groupCompanyDropdownRef}
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          background: 'white',
                          border: '1px solid #cbd5e0',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                          zIndex: 1000,
                          maxHeight: '300px',
                          overflowY: 'auto',
                          marginTop: '4px'
                        }}
                      >
                        {filteredGroupCompanies.length > 0 ? (
                          filteredGroupCompanies.map((group) => (
                            <div
                              key={group.id}
                              onClick={() => handleSelectGroupCompany(group)}
                              style={{
                                padding: '12px 16px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #e2e8f0',
                                transition: 'background-color 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#f7fafc'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'white'
                              }}
                            >
                              {group.group_name}
                            </div>
                          ))
                        ) : (
                          <div style={{ padding: '12px 16px', color: '#718096' }}>
                            {groupCompanySearch.trim() ? 'Нічого не знайдено' : 'Немає груп компаній'}
                          </div>
                        )}
                        <div
                          onClick={() => {
                            setShowCreateGroupModal(true)
                            setShowGroupCompanyDropdown(false)
                          }}
                          style={{
                            padding: '12px 16px',
                            cursor: 'pointer',
                            borderTop: '2px solid #e2e8f0',
                            background: '#f0f4ff',
                            fontWeight: '600',
                            color: '#4299e1',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#e6f2ff'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#f0f4ff'
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                          </svg>
                          Створити нову групу "{groupCompanySearch || 'компаній'}"
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Вартість обслуговування</label>
                  <input
                    type="number"
                    step="0.01"
                    value={clientForm.service_cost}
                    onChange={(e) => setClientForm({ ...clientForm, service_cost: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label>Місто</label>
                  <input
                    type="text"
                    value={clientForm.city}
                    onChange={(e) => setClientForm({ ...clientForm, city: e.target.value })}
                    placeholder="Введіть місто"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Адреса</label>
                <input
                  type="text"
                  value={clientForm.address}
                  onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                  placeholder="Введіть адресу"
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>КВЕД</label>
                  <select
                    value={clientForm.kved_id || ''}
                    onChange={(e) => setClientForm({ ...clientForm, kved_id: parseInt(e.target.value) || 0 })}
                    style={{ width: '100%' }}
                  >
                    <option value="">Оберіть КВЕД</option>
                    {kveds.length === 0 ? (
                      <option value="" disabled>КВЕДи не завантажено. Виконайте міграцію 005_insert_kveds.sql</option>
                    ) : (
                      kveds.map((kved) => (
                        <option key={kved.id} value={kved.id}>
                          {kved.code} - {kved.description}
                        </option>
                      ))
                    )}
                  </select>
                  {kveds.length === 0 && (
                    <small style={{ color: '#e53e3e', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                      КВЕДи не знайдено. Переконайтеся, що міграція виконана в Supabase.
                    </small>
                  )}
                </div>
                <div className="form-group">
                  <label>Вид діяльності</label>
                  <input
                    type="text"
                    value={clientForm.activity_type}
                    onChange={(e) => setClientForm({ ...clientForm, activity_type: e.target.value })}
                    placeholder="Введіть вид діяльності"
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>ПІБ директора</label>
                  <input
                    type="text"
                    value={clientForm.director_full_name}
                    onChange={(e) => setClientForm({ ...clientForm, director_full_name: e.target.value })}
                    placeholder="Введіть ПІБ директора"
                  />
                </div>
                <div className="form-group">
                  <label>Стать</label>
                  <select
                    value={clientForm.gender}
                    onChange={(e) => setClientForm({ ...clientForm, gender: e.target.value })}
                  >
                    <option value="">Не вказано</option>
                    <option value="male">Чоловік</option>
                    <option value="female">Жінка</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>IBAN</label>
                  <input
                    type="text"
                    value={clientForm.iban}
                    onChange={(e) => setClientForm({ ...clientForm, iban: e.target.value })}
                    placeholder="Введіть IBAN"
                  />
                </div>
                <div className="form-group">
                  <label>Назва банку</label>
                  <input
                    type="text"
                    value={clientForm.bank_name}
                    onChange={(e) => setClientForm({ ...clientForm, bank_name: e.target.value })}
                    placeholder="Введіть назву банку"
                  />
                </div>
              </div>
              {departments.length > 0 && (
                <div className="form-group">
                  <label>Відділи обслуговування</label>
                  {isTeamLead ? (
                    <div style={{
                      padding: '12px 16px',
                      background: '#f7fafc',
                      border: '2px solid #e2e8f0',
                      borderRadius: '8px',
                      color: '#718096',
                      fontSize: '14px'
                    }}>
                      {teamLeadDepartments.length > 0 ? (
                        <div>
                          <div style={{ marginBottom: '8px', fontWeight: '500', color: '#2d3748' }}>
                            Клієнт автоматично буде призначений до вашого відділу:
                          </div>
                          <div style={{ color: '#4299e1', fontWeight: '600' }}>
                            {teamLeadDepartments.map(dept => dept.department_name).join(', ')}
                          </div>
                        </div>
                      ) : (
                        <div style={{ color: '#e53e3e' }}>
                          У вас немає відділу. Зверніться до керівника виробництва для призначення відділу.
                        </div>
                      )}
                    </div>
                  ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px' }}>
                    {departments.map((dept) => (
                      <label
                        key={dept.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          padding: '8px 12px',
                          background: '#f7fafc',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={clientForm.department_ids.includes(dept.id)}
                          onChange={() => toggleDepartment(dept.id)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                        <span style={{ fontWeight: 500, color: '#2d3748' }}>{dept.department_name}</span>
                      </label>
                    ))}
                  </div>
                  )}
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => {
                  setShowCreateModal(false)
                  resetForm()
                }}>
                  Скасувати
                </button>
                <button type="submit" className="btn-primary">
                  {editingClientId ? 'Зберегти зміни' : 'Створити'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showConfirmModal && clientToToggle && (
        <div className="modal-overlay" onClick={() => { setShowConfirmModal(false); setClientToToggle(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Підтвердження</h3>
              <button className="modal-close" onClick={() => { setShowConfirmModal(false); setClientToToggle(null); }}>
                ×
              </button>
            </div>
            <div style={{ padding: '24px' }}>
              <p style={{ marginBottom: '16px', fontSize: '16px', color: '#2d3748', lineHeight: '1.6' }}>
                Ви впевнені, що хочете {clientToToggle.status === 'active' ? 'деактивувати' : 'активувати'} клієнта?
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
                  <div style={{ color: '#2d3748', fontSize: '16px', fontWeight: '600' }}>{clientToToggle.legal_name}</div>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>ЕДРПОУ:</strong>
                  <div style={{ color: '#2d3748', fontSize: '16px' }}>{clientToToggle.edrpou || '-'}</div>
                </div>
                <div>
                  <strong style={{ color: '#718096', fontSize: '14px' }}>Email:</strong>
                  <div style={{ color: '#2d3748', fontSize: '16px' }}>{clientToToggle.email || '-'}</div>
                </div>
              </div>
              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => { setShowConfirmModal(false); setClientToToggle(null); }}
                >
                  Скасувати
                </button>
                <button 
                  type="button" 
                  className={`btn-primary ${clientToToggle.status === 'active' ? 'btn-danger' : 'btn-success'}`}
                  onClick={handleConfirmToggleStatus}
                >
                  {clientToToggle.status === 'active' ? 'Деактивувати' : 'Активувати'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateGroupModal && (
        <div className="modal-overlay" onClick={() => { setShowCreateGroupModal(false); setNewGroupName(''); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Створити групу компаній</h3>
              <button className="modal-close" onClick={() => { setShowCreateGroupModal(false); setNewGroupName(''); }}>
                ×
              </button>
            </div>
            <div style={{ padding: '24px' }}>
              <div className="form-group">
                <label>Назва групи компаній *</label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Введіть назву групи компаній"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleCreateGroupCompany()
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => { setShowCreateGroupModal(false); setNewGroupName(''); }}
                >
                  Скасувати
                </button>
                <button 
                  type="button" 
                  className="btn-primary"
                  onClick={handleCreateGroupCompany}
                  disabled={!newGroupName.trim()}
                >
                  Створити
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAllGroupsModal && (
        <div className="modal-overlay" onClick={() => {
          setShowAllGroupsModal(false)
          handleCancelEditGroup()
        }}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Групи компаній</h3>
              <button className="modal-close" onClick={() => {
                setShowAllGroupsModal(false)
                handleCancelEditGroup()
              }}>
                ×
              </button>
    </div>
            <div style={{ padding: '24px', maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Форма створення нової групи */}
              <div style={{ 
                marginBottom: '24px', 
                padding: '16px', 
                border: '1px solid #e2e8f0', 
                borderRadius: '8px',
                background: '#f7fafc'
              }}>
                <h4 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '600', color: '#2d3748' }}>
                  Додати нову групу
                </h4>
                <form onSubmit={(e) => {
                  e.preventDefault()
                  handleCreateGroupInModal()
                }} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#4a5568' }}>
                      Назва групи компаній *
                    </label>
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Введіть назву групи компаній"
                      required
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #cbd5e0',
                        borderRadius: '4px',
                        fontSize: '16px'
                      }}
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="btn-primary"
                    style={{ padding: '8px 20px', whiteSpace: 'nowrap' }}
                  >
                    Створити
                  </button>
                </form>
              </div>

              {/* Список груп компаній */}
              {groupCompanies.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '40px', color: '#718096' }}>
                  Немає груп компаній. Створіть першу групу вище.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {groupCompanies.map((group) => (
                    <div
                      key={group.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        background: editingGroupId === group.id ? '#f7fafc' : '#ffffff',
                        transition: 'all 0.2s'
                      }}
                    >
                      {editingGroupId === group.id ? (
                        <>
                          <input
                            type="text"
                            value={editingGroupName}
                            onChange={(e) => setEditingGroupName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveGroupName(group.id)
                              } else if (e.key === 'Escape') {
                                handleCancelEditGroup()
                              }
                            }}
                            autoFocus
                            style={{
                              flex: 1,
                              padding: '8px 12px',
                              border: '2px solid #4299e1',
                              borderRadius: '4px',
                              fontSize: '16px'
                            }}
                          />
                          <button
                            className="btn-primary"
                            onClick={() => handleSaveGroupName(group.id)}
                            style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}
                          >
                            Зберегти
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={handleCancelEditGroup}
                            style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}
                          >
                            Скасувати
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: '16px', fontWeight: '500', color: '#2d3748' }}>
                            {group.group_name}
                          </span>
                          <button
                            className="btn-action btn-edit"
                            onClick={() => handleEditGroupName(group)}
                            title="Змінити назву групи компаній"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button 
                type="button" 
                className="btn-secondary" 
                onClick={() => {
                  setShowAllGroupsModal(false)
                  handleCancelEditGroup()
                }}
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальне вікно призначення задач */}
      {showAssignTasksModal && selectedClientForTasks && (
        <div className="modal-overlay" onClick={() => {
          setShowAssignTasksModal(false)
          setSelectedClientForTasks(null)
          setSelectedTaskId(0)
          setSelectedTaskDates([])
        }}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Призначені задачі: {selectedClientForTasks.legal_name}</h3>
              <button className="modal-close" onClick={() => {
                setShowAssignTasksModal(false)
                setSelectedClientForTasks(null)
                setSelectedTaskId(0)
                setSelectedTaskDates([])
              }}>
                ×
              </button>
            </div>
            <div style={{ padding: '24px', maxHeight: '80vh', overflowY: 'auto' }}>
              {/* Список призначених задач */}
              {assignedTasks.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '600', color: '#2d3748' }}>
                    Вже призначені задачі
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Array.from(groupedTasks.entries()).map(([baseName, groupTasks]: [string, AssignedTaskWithDetails[]]) => {
                      const isExpanded = expandedAssignedTaskGroups.has(baseName)
                      
                      return (
                        <div
                          key={baseName}
                          style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            marginBottom: '12px',
                            overflow: 'hidden',
                            background: '#ffffff'
                          }}
                        >
                          {/* Заголовок групи */}
                          <div
                            onClick={() => toggleAssignedTaskGroup(baseName)}
                            style={{
                              padding: '16px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: isExpanded ? '#f7fafc' : '#ffffff',
                              transition: 'background-color 0.2s',
                              borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                              <span style={{ fontSize: '18px', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                ▶
                              </span>
                              <div>
                                <div style={{ fontWeight: '600', color: '#2d3748', fontSize: '16px' }}>
                                  {baseName}
                                </div>
                                <div style={{ fontSize: '13px', color: '#718096', marginTop: '4px' }}>
                                  {groupTasks.length} {groupTasks.length === 1 ? 'задача' : groupTasks.length < 5 ? 'задачі' : 'задач'}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Розгорнутий список дат */}
                          {isExpanded && (
                            <div style={{ padding: '16px', background: '#ffffff' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {groupTasks.map((assigned: AssignedTaskWithDetails) => {
                                  const isEditing = editingAssignedTaskId === assigned.id
                                  
                                  return (
                                    <div
                                      key={`assigned-task-${assigned.id}`}
                                      style={{
                                        padding: '16px',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        background: assigned.is_active ? '#ffffff' : '#f7fafc',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        position: 'relative'
                                      }}
                                    >
                                      {/* Кнопка редагування */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          if (isEditing) {
                                            console.log('Закриваємо редагування для задачі:', assigned.id)
                                            setEditingAssignedTaskId(null)
                                            editingTaskIdRef.current = null
                                          } else {
                                            console.log('Відкриваємо редагування для задачі:', assigned.id)
                                            setEditingAssignedTaskId(assigned.id)
                                            editingTaskIdRef.current = assigned.id
                                          }
                                        }}
                                        style={{
                                          position: 'absolute',
                                          top: '12px',
                                          right: '12px',
                                          background: 'transparent',
                                          border: 'none',
                                          cursor: 'pointer',
                                          padding: '4px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          borderRadius: '4px',
                                          transition: 'background-color 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.backgroundColor = '#f7fafc'
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.backgroundColor = 'transparent'
                                        }}
                                        title={isEditing ? 'Закрити редагування' : 'Редагувати'}
                                      >
                                        <svg
                                          width="18"
                                          height="18"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke={isEditing ? '#ff6b35' : '#718096'}
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        >
                                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                        </svg>
                                      </button>

                                      {/* Перший рядок: Планова дата, Виконавець, Активна */}
                                      <div style={{ 
                                        display: 'grid', 
                                        gridTemplateColumns: 'auto 1fr auto',
                                        gap: '12px',
                                        alignItems: 'center',
                                        paddingRight: '40px'
                                      }}>
                                        {/* Планова дата */}
                                        <div style={{ fontWeight: '500', color: '#2d3748', fontSize: '14px', minWidth: '120px' }}>
                                          План: {assigned.task?.planned_date ? formatDateToUA(assigned.task.planned_date.split('T')[0]) : '-'}
                                        </div>
                                        
                                        {/* Виконавець */}
                                        {isEditing ? (
                                          <select
                                            key={`executor-select-${assigned.id}-${assigned.executor_id || 'null'}`}
                                            value={assigned.executor_id || 0}
                                            onChange={(e) => {
                                              e.stopPropagation()
                                              e.preventDefault()
                                              
                                              // Якщо вже виконується оновлення, ігноруємо
                                              if (isUpdatingRef.current) {
                                                console.log('Оновлення вже виконується, ігноруємо onChange')
                                                return
                                              }
                                              
                                              const executorId = Number(e.target.value)
                                              const currentTaskId = assigned.id
                                              
                                              console.log('onChange executor для задачі:', currentTaskId, 'новий executorId:', executorId, 'поточний:', assigned.executor_id)
                                              // Використовуємо замикання для гарантії правильного taskId
                                              handleUpdateExecutor(currentTaskId, executorId)
                                            }}
                                            onFocus={(e) => {
                                              e.stopPropagation()
                                              // Стилізуємо при фокусі
                                              e.currentTarget.style.borderColor = '#ff6b35'
                                              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 107, 53, 0.1)'
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                              padding: '6px 10px',
                                              border: '2px solid #e2e8f0',
                                              borderRadius: '6px',
                                              fontSize: '14px',
                                              transition: 'all 0.2s'
                                            }}
                                            onBlur={(e) => {
                                              e.currentTarget.style.borderColor = '#e2e8f0'
                                              e.currentTarget.style.boxShadow = 'none'
                                            }}
                                          >
                                            <option value={0}>-- Оберіть виконавця --</option>
                                            {availableExecutors.map((executor) => {
                                              const fullName = [executor.surname, executor.name, executor.middle_name].filter(Boolean).join(' ') || executor.email
                                              return (
                                                <option key={executor.id} value={executor.id}>
                                                  {fullName}
                                                </option>
                                              )
                                            })}
                                          </select>
                                        ) : (
                                          <div style={{
                                            padding: '6px 10px',
                                            fontSize: '14px',
                                            color: assigned.executor 
                                              ? '#2d3748' 
                                              : '#718096',
                                            backgroundColor: '#f7fafc',
                                            borderRadius: '6px',
                                            border: '1px solid #e2e8f0'
                                          }}>
                                            {assigned.executor 
                                              ? [assigned.executor.surname, assigned.executor.name, assigned.executor.middle_name].filter(Boolean).join(' ') || assigned.executor.email
                                              : 'Не призначено'}
                                          </div>
                                        )}

                                        {/* Чекбокс активності */}
                                        {isEditing ? (
                                          <label 
                                            style={{ 
                                              display: 'flex', 
                                              alignItems: 'center', 
                                              gap: '8px', 
                                              cursor: 'pointer',
                                              whiteSpace: 'nowrap'
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <input
                                              key={`active-checkbox-${assigned.id}`}
                                              type="checkbox"
                                              checked={assigned.is_active}
                                              onChange={(e) => {
                                                e.stopPropagation()
                                                e.preventDefault()
                                                const currentTaskId = assigned.id
                                                const currentStatus = assigned.is_active
                                                console.log('onChange checkbox для задачі:', currentTaskId, 'поточний статус:', currentStatus)
                                                // Використовуємо замикання для гарантії правильного taskId
                                                handleToggleTaskActive(currentTaskId, currentStatus)
                                              }}
                                              onClick={(e) => {
                                                e.stopPropagation()
                                              }}
                                              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                            />
                                            <span style={{ fontSize: '14px', color: '#4a5568', fontWeight: '500' }}>Активна</span>
                                          </label>
                                        ) : (
                                          <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            padding: '6px 10px',
                                            fontSize: '14px',
                                            color: '#4a5568',
                                            fontWeight: '500',
                                            backgroundColor: '#f7fafc',
                                            borderRadius: '6px',
                                            border: '1px solid #e2e8f0',
                                            whiteSpace: 'nowrap'
                                          }}>
                                            <span style={{ fontSize: '16px' }}>{assigned.is_active ? '✓' : '✗'}</span>
                                            <span>{assigned.is_active ? 'Активна' : 'Неактивна'}</span>
                                          </div>
                                        )}
                                      </div>

                                    {/* Другий рядок: Статус, Дата виконання, Час виконання */}
                                    <div style={{ 
                                      display: 'grid', 
                                      gridTemplateColumns: '1fr 1fr 1fr',
                                      gap: '12px',
                                      alignItems: 'start'
                                    }}>
                                      {/* Статус задачі */}
                                      <div>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#718096', marginBottom: '4px', fontWeight: '500' }}>
                                          Статус
                                        </label>
                                        {isTeamLead ? (
                                          <div style={{ display: 'flex', alignItems: 'center', minHeight: '32px' }}>
                                            {(() => {
                                              const status = getTaskStatus(assigned)
                                              return (
                                                <span className={`status-badge ${getStatusBadgeClass(status)}`} style={{
                                              padding: '6px 12px',
                                              borderRadius: '16px',
                                              fontSize: '13px',
                                              fontWeight: '500',
                                              display: 'inline-block'
                                            }}>
                                                  {getStatusText(status)}
                                            </span>
                                              )
                                            })()}
                                          </div>
                                        ) : (
                                          <div style={{ width: '100%' }}>
                                          <select
                                            value={assigned.task_status || ''}
                                            onChange={(e) => handleUpdateTaskStatus(assigned.id, e.target.value)}
                                            style={{
                                              padding: '6px 10px',
                                              border: '2px solid #e2e8f0',
                                              borderRadius: '6px',
                                              fontSize: '14px',
                                              width: '100%',
                                              transition: 'all 0.2s'
                                            }}
                                            onFocus={(e) => {
                                              e.currentTarget.style.borderColor = '#ff6b35'
                                              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 107, 53, 0.1)'
                                            }}
                                            onBlur={(e) => {
                                              e.currentTarget.style.borderColor = '#e2e8f0'
                                              e.currentTarget.style.boxShadow = 'none'
                                            }}
                                          >
                                            <option value="">-- Оберіть статус --</option>
                                              <option value="active">Активний</option>
                                              <option value="in_progress">В процесі</option>
                                              <option value="completed">Виконано</option>
                                              <option value="pending">Очікує</option>
                                          </select>
                                            {!assigned.task_status && (() => {
                                              const autoStatus = getTaskStatus(assigned)
                                              return (
                                                <div style={{ 
                                                  marginTop: '4px', 
                                                  fontSize: '11px', 
                                                  color: '#718096',
                                                  fontStyle: 'italic'
                                                }}>
                                                  Поточний статус: {getStatusText(autoStatus)}
                                                </div>
                                              )
                                            })()}
                                          </div>
                                        )}
                                      </div>

                                      {/* Дата виконання */}
                                      <div>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#718096', marginBottom: '4px', fontWeight: '500' }}>
                                          Дата виконання
                                        </label>
                                        {isTeamLead ? (
                                          assigned.completion_date ? (
                                            <div style={{
                                              padding: '6px 10px',
                                              border: '1px solid #e2e8f0',
                                              borderRadius: '6px',
                                              fontSize: '14px',
                                              width: '100%',
                                              backgroundColor: '#f7fafc',
                                              color: '#2d3748',
                                              minHeight: '32px',
                                              display: 'flex',
                                              alignItems: 'center'
                                            }}>
                                              {formatDateToUA(assigned.completion_date)}
                                            </div>
                                          ) : (
                                            <div style={{
                                              padding: '6px 10px',
                                              fontSize: '14px',
                                              width: '100%',
                                              minHeight: '32px',
                                              display: 'flex',
                                              alignItems: 'center',
                                              color: '#a0aec0'
                                            }}>
                                              -
                                            </div>
                                          )
                                        ) : (
                                          <input
                                            type="text"
                                            value={assigned.completion_date ? formatDateToUA(assigned.completion_date) : ''}
                                            onChange={(e) => {
                                              const value = e.target.value
                                              let cleaned = value.replace(/\D/g, '')
                                              if (cleaned.length > 8) {
                                                cleaned = cleaned.substring(0, 8)
                                              }
                                              let formatted = cleaned
                                              if (cleaned.length > 2) {
                                                formatted = cleaned.substring(0, 2) + '.' + cleaned.substring(2)
                                              }
                                              if (cleaned.length > 4) {
                                                formatted = cleaned.substring(0, 2) + '.' + cleaned.substring(2, 4) + '.' + cleaned.substring(4)
                                              }
                                              const isoDate = parseDateToISO(formatted)
                                              if (isoDate || formatted === '') {
                                                handleUpdateCompletionDate(assigned.id, formatted)
                                              }
                                            }}
                                            placeholder="дд.ММ.рррр"
                                            maxLength={10}
                                            style={{
                                              padding: '6px 10px',
                                              border: '2px solid #e2e8f0',
                                              borderRadius: '6px',
                                              fontSize: '14px',
                                              width: '100%',
                                              transition: 'all 0.2s'
                                            }}
                                            onFocus={(e) => {
                                              e.currentTarget.style.borderColor = '#ff6b35'
                                              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 107, 53, 0.1)'
                                            }}
                                            onBlur={(e) => {
                                              e.currentTarget.style.borderColor = '#e2e8f0'
                                              e.currentTarget.style.boxShadow = 'none'
                                            }}
                                          />
                                        )}
                                      </div>

                                      {/* Час виконання (хвилини) */}
                                      <div>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#718096', marginBottom: '4px', fontWeight: '500' }}>
                                          Час виконання
                                        </label>
                                        {isTeamLead ? (
                                          <div style={{
                                            padding: '6px 10px',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            fontSize: '14px',
                                            width: '100%',
                                            backgroundColor: '#f7fafc',
                                            color: '#2d3748',
                                            minHeight: '32px',
                                            display: 'flex',
                                            alignItems: 'center'
                                          }}>
                                            {(() => {
                                              // Використовуємо час зі статистики (з логів), якщо він є, інакше з assigned_tasks
                                              const stats = clientTaskTimeStats.get(assigned.id)
                                              const totalMinutes = stats?.totalMinutes ?? assigned.completion_time_minutes ?? 0
                                              return formatMinutesToHoursMinutes(totalMinutes) || '0 г. 0 хв.'
                                            })()}
                                          </div>
                                        ) : (
                                          <input
                                            type="number"
                                            value={assigned.completion_time_minutes || ''}
                                            onChange={(e) => {
                                              const value = e.target.value === '' ? null : parseInt(e.target.value) || 0
                                              handleUpdateCompletionTime(assigned.id, value)
                                            }}
                                            placeholder="0"
                                            min="0"
                                            style={{
                                              padding: '6px 10px',
                                              border: '2px solid #e2e8f0',
                                              borderRadius: '6px',
                                              fontSize: '14px',
                                              width: '100%',
                                              transition: 'all 0.2s'
                                            }}
                                            onFocus={(e) => {
                                              e.currentTarget.style.borderColor = '#ff6b35'
                                              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 107, 53, 0.1)'
                                            }}
                                            onBlur={(e) => {
                                              e.currentTarget.style.borderColor = '#e2e8f0'
                                              e.currentTarget.style.boxShadow = 'none'
                                            }}
                                          />
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Форма додавання нової задачі */}
              <div style={{ 
                padding: '16px', 
                border: '1px solid #e2e8f0', 
                borderRadius: '8px',
                background: '#f7fafc'
              }}>
                <h4 style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600', color: '#2d3748' }}>
                  Додати задачу
                </h4>
                
                {/* Вибір задачі */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label>Оберіть задачу *</label>
                  <select
                    value={selectedTaskId}
                    onChange={(e) => handleTaskSelect(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #cbd5e0',
                      borderRadius: '4px',
                      fontSize: '16px'
                    }}
                  >
                    <option value={0}>-- Оберіть задачу --</option>
                    {getAvailableTasksForSelect().map((task) => (
                      <option key={task.id} value={task.id}>
                        {getBaseTaskName(task.task_name)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Список дат з полями для виконавця та активності */}
                {selectedTaskDates.length > 0 && (
                  <div style={{ marginTop: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '16px', fontSize: '14px', fontWeight: '600', color: '#2d3748' }}>
                      Планові дати для кожного місяця:
                    </label>
                    <div className="months-grid">
                      {selectedTaskDates.map((dateItem, index) => (
                        <div key={index} className="month-input-wrapper">
                          <label className="month-label">
                            {getMonthName(dateItem.month)}
                          </label>
                          <input
                            type="text"
                            value={formatDateToUA(dateItem.date)}
                            onChange={(e) => {
                              if (isTeamLead) return // Тім лід не може редагувати дати
                              
                              const value = e.target.value
                              // Видаляємо всі символи крім цифр
                              let cleaned = value.replace(/\D/g, '')
                              
                              // Обмежуємо довжину до 8 цифр (ддММрррр)
                              if (cleaned.length > 8) {
                                cleaned = cleaned.substring(0, 8)
                              }
                              
                              // Форматуємо як дд.ММ.рррр
                              let formatted = cleaned
                              if (cleaned.length > 2) {
                                formatted = cleaned.substring(0, 2) + '.' + cleaned.substring(2)
                              }
                              if (cleaned.length > 4) {
                                formatted = cleaned.substring(0, 2) + '.' + cleaned.substring(2, 4) + '.' + cleaned.substring(4)
                              }
                              
                              // Оновлюємо дату
                              const isoDate = parseDateToISO(formatted)
                              if (isoDate) {
                                const updated = [...selectedTaskDates]
                                updated[index].date = isoDate
                                // Оновлюємо місяць якщо дата змінилася
                                const newDate = new Date(isoDate)
                                updated[index].month = newDate.getMonth() + 1
                                setSelectedTaskDates(updated)
                              }
                            }}
                            readOnly={isTeamLead}
                            placeholder="дд.ММ.рррр"
                            maxLength={10}
                            className="month-date-input"
                            required
                            style={isTeamLead ? {
                              backgroundColor: '#f7fafc',
                              cursor: 'not-allowed',
                              color: '#718096'
                            } : undefined}
                          />
                          <select
                            value={dateItem.executorId}
                            onChange={(e) => {
                              const updated = [...selectedTaskDates]
                              updated[index].executorId = Number(e.target.value)
                              setSelectedTaskDates(updated)
                            }}
                            style={{
                              padding: '8px 10px',
                              border: '2px solid #e2e8f0',
                              borderRadius: '8px',
                              fontSize: '14px',
                              width: '100%',
                              marginTop: '8px',
                              transition: 'all 0.2s'
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor = '#ff6b35'
                              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 107, 53, 0.1)'
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor = '#e2e8f0'
                              e.currentTarget.style.boxShadow = 'none'
                            }}
                          >
                            <option value={0}>-- Оберіть виконавця --</option>
                            {availableExecutors.map((executor) => {
                              const fullName = [executor.surname, executor.name, executor.middle_name].filter(Boolean).join(' ') || executor.email
                              return (
                                <option key={executor.id} value={executor.id}>
                                  {fullName}
                                </option>
                              )
                            })}
                          </select>
                          <label style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            cursor: 'pointer',
                            marginTop: '8px',
                            padding: '8px 0'
                          }}>
                            <input
                              type="checkbox"
                              checked={dateItem.isActive}
                              onChange={(e) => {
                                const updated = [...selectedTaskDates]
                                updated[index].isActive = e.target.checked
                                setSelectedTaskDates(updated)
                              }}
                              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                            <span style={{ fontSize: '14px', color: '#4a5568', fontWeight: '500' }}>Активна</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleAddAssignedTasks}
                    disabled={selectedTaskId === 0 || selectedTaskDates.length === 0}
                  >
                    Додати
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальне вікно створення індивідуальної задачі */}
      {showCreateTaskModal && selectedClientForCreateTask && (
        <div className="modal-overlay" onClick={() => {
          setShowCreateTaskModal(false)
          setSelectedClientForCreateTask(null)
          setNewTaskForm({
            executor_id: null,
            planned_date: '',
            task_name: '',
            category_id: null,
            description: ''
          })
          setError(null)
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3>Створити індивідуальну задачу</h3>
              <button className="modal-close" onClick={() => {
                setShowCreateTaskModal(false)
                setSelectedClientForCreateTask(null)
                setNewTaskForm({
                  executor_id: null,
                  planned_date: '',
                  task_name: '',
                  category_id: null,
                  description: ''
                })
                setError(null)
              }}>×</button>
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
                  {availableExecutorsForCreate.map(executor => {
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
                    setSelectedClientForCreateTask(null)
                    setNewTaskForm({
                      executor_id: null,
                      planned_date: '',
                      task_name: '',
                      category_id: null,
                      description: ''
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

      {/* Модальне вікно редагування задачі клієнта */}
      {editingClientTaskId && (() => {
        const clientId = Array.from(clientTasks.entries()).find(([_, tasks]) => 
          tasks.some(t => t.id === editingClientTaskId)
        )?.[0]
        const tasks = clientId ? clientTasks.get(clientId) || [] : []
        const task = tasks.find(t => t.id === editingClientTaskId)
        
        if (!task || !clientId) return null

        const taskName = task.task?.task_name || `Задача #${task.task_id}`
        const taskType = task.task?.task_type || 'Планова задача'

        return (
          <div className="modal-overlay" onClick={() => setEditingClientTaskId(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
              <div className="modal-header">
                <h3>Редагувати задачу</h3>
                <button className="modal-close" onClick={() => setEditingClientTaskId(null)}>×</button>
              </div>
              <div style={{ padding: '24px' }}>
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <h4 style={{ fontSize: '18px', fontWeight: '600', color: '#2d3748', margin: 0 }}>
                      {taskName}
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
                      handleUpdateClientTaskExecutor(task.id, executorId, clientId)
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
                    {availableExecutorsForCreate.map((executor) => {
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
                      onChange={() => handleToggleClientTaskActive(task.id, clientId)}
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
                    onClick={() => setEditingClientTaskId(null)}
                  >
                    Закрити
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

