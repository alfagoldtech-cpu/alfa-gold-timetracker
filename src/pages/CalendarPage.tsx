import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getRoleById } from '../lib/users'
import { 
  getTasksByProject, 
  createTask,
  updateTask,
  deleteTask
} from '../lib/tasks'
import {
  getTaskCategoriesByProject,
  searchTaskCategories,
  createTaskCategory,
  updateTaskCategory
} from '../lib/tasksCategory'
import type { Task, TaskCategory } from '../types/database'
import { formatDate, parseDateToISO, formatDateToUA } from '../utils/date'
import { getTaskTypeText } from '../utils/status'
import { getBaseTaskName } from '../utils/task'
import TaskPlayer from '../components/TaskPlayer'
import './AdminPages.css'
import './ManagerDashboard.css'

export default function CalendarPage() {
  const { user } = useAuth()
  const [isTeamLead, setIsTeamLead] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showAllCategoriesModal, setShowAllCategoriesModal] = useState(false)
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [editingDateTaskId, setEditingDateTaskId] = useState<number | null>(null)
  const [editingDateValue, setEditingDateValue] = useState<string>('')
  const [hoveredTaskDescription, setHoveredTaskDescription] = useState<string | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null)
  
  // Функція для форматування введення дати (дд.ММ.рррр)
  const handleDateInputChange = (value: string, index: number, baseName: string, taskId: number) => {
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
    
    // Оновлюємо локальний стан
    setEditingGroupDates(prev => {
      const newMap = new Map(prev)
      const dates = newMap.get(baseName)
      if (dates) {
        const updated = [...dates]
        updated[index] = { ...updated[index], date: formatted }
        newMap.set(baseName, updated)
      }
      return newMap
    })
    
    // Якщо дата повна (8 цифр), конвертуємо та зберігаємо
    if (cleaned.length === 8) {
      const day = cleaned.substring(0, 2)
      const month = cleaned.substring(2, 4)
      const year = cleaned.substring(4, 8)
      const isoDate = `${year}-${month}-${day}`
      
      // Валідуємо дату
      const date = new Date(isoDate)
      if (!isNaN(date.getTime()) && 
          date.getDate() === parseInt(day) && 
          date.getMonth() + 1 === parseInt(month) &&
          date.getFullYear() === parseInt(year)) {
        updateGroupDate(baseName, index, isoDate, taskId)
      }
    }
  }
  const [expandedTaskGroups, setExpandedTaskGroups] = useState<Set<string>>(new Set())
  const [editingGroupDates, setEditingGroupDates] = useState<Map<string, Array<{ month?: number; quarter?: number; date: string; taskId: number }>>>(new Map())
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [taskForm, setTaskForm] = useState({
    task_name: '',
    task_type: 'month', // 'month', 'quarter', 'year'
    category_id: 0,
    description: '',
    year: new Date().getFullYear(),
    planned_date: ''
  })

  const [taskCategories, setTaskCategories] = useState<TaskCategory[]>([])
  const [filteredTaskCategories, setFilteredTaskCategories] = useState<TaskCategory[]>([])
  const [categorySearch, setCategorySearch] = useState('')
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const categoryInputRef = useRef<HTMLInputElement>(null)
  const categoryDropdownRef = useRef<HTMLDivElement>(null)

  // Ініціалізуємо місяці одразу при завантаженні
  const currentYear = new Date().getFullYear()
  const initialMonths = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    date: `${currentYear}-${String(i + 1).padStart(2, '0')}-01`
  }))

  const [monthlyTasks, setMonthlyTasks] = useState<Array<{ month: number; date: string }>>(initialMonths)
  const [quarterlyTasks, setQuarterlyTasks] = useState<Array<{ quarter: number; date: string }>>([])
  const [yearlyTask, setYearlyTask] = useState<{ date: string }>({ date: `${currentYear}-01-01` })

  useEffect(() => {
    if (user?.project_id && user?.role_id) {
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
      loadTasks()
      loadTaskCategories()
    }
  }, [user?.project_id, user?.role_id])

  // Ініціалізуємо форми залежно від типу задачі
  useEffect(() => {
    const currentYear = taskForm.year
    if (taskForm.task_type === 'month') {
      const months = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        date: `${currentYear}-${String(i + 1).padStart(2, '0')}-01`
      }))
      setMonthlyTasks(months)
    } else if (taskForm.task_type === 'quarter') {
      const quarters = [
        { quarter: 1, date: `${currentYear}-01-01` },
        { quarter: 2, date: `${currentYear}-04-01` },
        { quarter: 3, date: `${currentYear}-07-01` },
        { quarter: 4, date: `${currentYear}-10-01` }
      ]
      setQuarterlyTasks(quarters)
    } else if (taskForm.task_type === 'year') {
      setYearlyTask({ date: `${currentYear}-01-01` })
    }
  }, [taskForm.task_type, taskForm.year])

  useEffect(() => {
    if (categorySearch === '') {
      setFilteredTaskCategories(taskCategories)
    } else {
      searchCategories(categorySearch)
    }
  }, [categorySearch, taskCategories])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node) &&
        categoryInputRef.current &&
        !categoryInputRef.current.contains(event.target as Node)
      ) {
        setShowCategoryDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const loadTaskCategories = async () => {
    if (!user?.project_id) return

    try {
      const categories = await getTaskCategoriesByProject(user.project_id)
      setTaskCategories(categories)
      setFilteredTaskCategories(categories)
    } catch (err) {
      console.error('Помилка завантаження категорій:', err)
    }
  }

  const searchCategories = async (searchTerm: string) => {
    if (!user?.project_id) return

    try {
      const results = await searchTaskCategories(user.project_id, searchTerm)
      setFilteredTaskCategories(results)
    } catch (err) {
      console.error('Помилка пошуку категорій:', err)
    }
  }

  const handleSelectCategory = (category: TaskCategory) => {
    setTaskForm({ ...taskForm, category_id: category.id })
    setCategorySearch(category.name)
    setShowCategoryDropdown(false)
  }

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      setError('Введіть назву категорії')
      return
    }

    if (!user?.project_id) {
      setError('Не вдалося визначити проект')
      return
    }

    setError(null)
    setSuccess(null)

    try {
      const newCategory = await createTaskCategory(newCategoryName.trim(), user.project_id)
      if (newCategory) {
        setTaskCategories([...taskCategories, newCategory])
        setFilteredTaskCategories([...taskCategories, newCategory])
        setTaskForm({ ...taskForm, category_id: newCategory.id })
        setCategorySearch(newCategory.name)
        setShowCreateCategoryModal(false)
        setNewCategoryName('')
        setShowCategoryDropdown(false)
        setSuccess(`Категорію "${newCategory.name}" успішно створено`)
      } else {
        setError('Не вдалося створити категорію')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка створення категорії')
    }
  }

  const handleEditCategoryName = (category: TaskCategory) => {
    setEditingCategoryId(category.id)
    setEditingCategoryName(category.name)
  }

  const handleSaveCategoryName = async (categoryId: number) => {
    if (!editingCategoryName.trim()) {
      setError('Назва категорії не може бути порожньою')
      return
    }

    setError(null)
    setSuccess(null)

    try {
      const success = await updateTaskCategory(categoryId, editingCategoryName.trim())

      if (success) {
        setSuccess('Назву категорії успішно оновлено')
        setEditingCategoryId(null)
        setEditingCategoryName('')
        await loadTaskCategories() // Перезавантажуємо дані
      } else {
        setError('Не вдалося оновити назву категорії')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка оновлення назви категорії')
    }
  }

  const handleCancelEditCategory = () => {
    setEditingCategoryId(null)
    setEditingCategoryName('')
  }

  const handleCreateCategoryInModal = async () => {
    if (!newCategoryName.trim()) {
      setError('Введіть назву категорії')
      return
    }

    if (!user?.project_id) {
      setError('Не вдалося визначити проект')
      return
    }

    setError(null)
    setSuccess(null)

    try {
      const newCategory = await createTaskCategory(newCategoryName.trim(), user.project_id)
      if (newCategory) {
        setSuccess(`Категорію "${newCategory.name}" успішно створено`)
        setNewCategoryName('')
        await loadTaskCategories() // Перезавантажуємо дані
      } else {
        setError('Не вдалося створити категорію')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка створення категорії')
    }
  }

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
      const allTasks = await getTasksByProject(user.project_id)
      // Фільтруємо тільки планові задачі (створені Керівником виробництва)
      const plannedTasks = allTasks.filter(task => task.task_type === 'Планова задача')
      console.log('Loaded all tasks:', allTasks.length, 'planned tasks:', plannedTasks.length)
      setTasks(plannedTasks)
    } catch (err) {
      console.error('Error loading tasks:', err)
      setError('Не вдалося завантажити задачі')
    } finally {
      setLoading(false)
    }
  }

  // Функція для витягування базової назви задачі (без суфіксів типу " - Січень")

  // Групуємо задачі по базовій назві
  const groupTasksByName = (tasks: Task[]): Map<string, Task[]> => {
    const grouped = new Map<string, Task[]>()
    
    tasks.forEach(task => {
      const baseName = getBaseTaskName(task.task_name)
      if (!grouped.has(baseName)) {
        grouped.set(baseName, [])
      }
      grouped.get(baseName)!.push(task)
    })
    
    return grouped
  }

  const toggleTaskGroup = (baseName: string, groupTasks: Task[]) => {
    setExpandedTaskGroups(prev => {
      const newSet = new Set(prev)
      if (newSet.has(baseName)) {
        newSet.delete(baseName)
        // Очищаємо редагування дат при закритті
        setEditingGroupDates(prevDates => {
          const newMap = new Map(prevDates)
          newMap.delete(baseName)
          return newMap
        })
      } else {
        newSet.add(baseName)
        // Ініціалізуємо дати для редагування
        const firstTask = groupTasks[0]
        if (firstTask.recurrence_type === 'month') {
          const monthlyDates = groupTasks.map(task => {
            const date = new Date(task.planned_date)
            return {
              month: date.getMonth() + 1,
              date: task.planned_date.split('T')[0],
              taskId: task.id
            }
          }).sort((a, b) => a.month! - b.month!)
          setEditingGroupDates(prev => {
            const newMap = new Map(prev)
            newMap.set(baseName, monthlyDates)
            return newMap
          })
        } else if (firstTask.recurrence_type === 'quarter') {
          const quarterlyDates = groupTasks.map(task => {
            const date = new Date(task.planned_date)
            const quarter = Math.floor(date.getMonth() / 3) + 1
            return {
              quarter,
              date: task.planned_date.split('T')[0],
              taskId: task.id
            }
          }).sort((a, b) => a.quarter! - b.quarter!)
          setEditingGroupDates(prev => {
            const newMap = new Map(prev)
            newMap.set(baseName, quarterlyDates)
            return newMap
          })
        } else if (firstTask.recurrence_type === 'year') {
          setEditingGroupDates(prev => {
            const newMap = new Map(prev)
            newMap.set(baseName, [{
              date: firstTask.planned_date.split('T')[0],
              taskId: firstTask.id
            }])
            return newMap
          })
        }
      }
      return newSet
    })
  }

  const updateGroupDate = async (baseName: string, index: number, newDate: string, taskId: number) => {
    try {
      const success = await updateTask(taskId, {
        planned_date: newDate
      })

      if (success) {
        // Оновлюємо локальний стан
        setEditingGroupDates(prev => {
          const newMap = new Map(prev)
          const dates = newMap.get(baseName)
          if (dates) {
            const updated = [...dates]
            updated[index] = { ...updated[index], date: newDate }
            newMap.set(baseName, updated)
          }
          return newMap
        })
        setSuccess('Дату задачі успішно оновлено')
        await loadTasks()
      } else {
        setError('Не вдалося оновити дату задачі')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка оновлення дати')
    }
  }

  const handleEditTaskGroup = (groupTasks: Task[]) => {
    // Беремо першу задачу як основу для редагування
    const firstTask = groupTasks[0]
    const baseName = getBaseTaskName(firstTask.task_name)
    
    // Заповнюємо форму даними
    setTaskForm({
      task_name: baseName,
      task_type: firstTask.recurrence_type || 'month',
      category_id: firstTask.category_id || 0,
      description: firstTask.description || '',
      year: new Date(firstTask.planned_date).getFullYear(),
      planned_date: ''
    })

    // Встановлюємо категорію в пошук
    if (firstTask.category_id) {
      const category = taskCategories.find(cat => cat.id === firstTask.category_id)
      if (category) {
        setCategorySearch(category.name)
      } else {
        setCategorySearch('')
      }
    } else {
      setCategorySearch('')
    }

    // Встановлюємо дати залежно від типу
    if (firstTask.recurrence_type === 'month') {
      const monthlyDates = groupTasks.map(task => {
        const date = new Date(task.planned_date)
        return {
          month: date.getMonth() + 1,
          date: task.planned_date.split('T')[0]
        }
      }).sort((a, b) => a.month - b.month)
      setMonthlyTasks(monthlyDates)
    } else if (firstTask.recurrence_type === 'quarter') {
      const quarterlyDates = groupTasks.map(task => {
        const date = new Date(task.planned_date)
        const quarter = Math.floor(date.getMonth() / 3) + 1
        return {
          quarter,
          date: task.planned_date.split('T')[0]
        }
      }).sort((a, b) => a.quarter - b.quarter)
      setQuarterlyTasks(quarterlyDates)
    } else if (firstTask.recurrence_type === 'year') {
      setYearlyTask({ date: firstTask.planned_date.split('T')[0] })
    }

    // Зберігаємо ID першої задачі для редагування (використовується для знаходження групи)
    setEditingTaskId(firstTask.id)
    setShowCreateModal(true)
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
      if (editingTaskId) {
        // Редагування групи задач - видаляємо старі та створюємо нові
        // Знаходимо всі задачі з такою ж базовою назвою
        const baseName = getBaseTaskName(tasks.find(t => t.id === editingTaskId)?.task_name || '')
        const tasksToUpdate = tasks.filter(t => getBaseTaskName(t.task_name) === baseName)
        
        // Видаляємо старі задачі
        await Promise.all(tasksToUpdate.map(task => deleteTask(task.id)))
        
        // Створюємо нові задачі з оновленими даними
      let tasksToCreate: Array<{ planned_date: string; task_name: string }> = []

      if (taskForm.task_type === 'month') {
        tasksToCreate = monthlyTasks.map(task => ({
          planned_date: task.date,
          task_name: `${taskForm.task_name} - ${getMonthName(task.month)}`
        }))
      } else if (taskForm.task_type === 'quarter') {
        tasksToCreate = quarterlyTasks.map(task => ({
          planned_date: task.date,
          task_name: `${taskForm.task_name} - ${task.quarter} квартал`
        }))
      } else if (taskForm.task_type === 'year') {
        if (!yearlyTask.date) {
          setError('Виберіть планову дату')
          return
        }
        tasksToCreate = [{
          planned_date: yearlyTask.date,
          task_name: taskForm.task_name
        }]
        }

        // Створюємо всі нові задачі
        console.log('Updating tasks:', tasksToCreate.length, 'tasks')
        const results = await Promise.all(
          tasksToCreate.map(async (taskData) => {
            try {
              console.log('Creating task:', taskData.task_name, 'with date:', taskData.planned_date)
              const task = await createTask({
                project_id: user.project_id!,
                task_name: taskData.task_name,
                task_type: 'Планова задача', // Встановлюємо тип задачі
                recurrence_type: taskForm.task_type, // Зберігаємо тип повторюваності
                category_id: taskForm.category_id || undefined,
                planned_date: taskData.planned_date,
                description: taskForm.description || undefined
              })
              if (!task) {
                console.error('Failed to create task:', taskData.task_name)
              } else {
                console.log('Task created successfully:', task.id, task.task_name)
              }
              return task
            } catch (err) {
              console.error('Error creating task:', taskData.task_name, err)
              return null
            }
          })
        )

        const successCount = results.filter(r => r !== null).length
        console.log('Created tasks count:', successCount, 'out of', tasksToCreate.length)
        
        if (successCount > 0) {
          setSuccess(`Задачі "${taskForm.task_name}" успішно оновлено`)
          resetTaskForm()
          setShowCreateModal(false)
          await loadTasks()
        } else {
          setError('Не вдалося оновити задачі. Перевірте консоль для деталей.')
        }
      } else {
        // Створення нової задачі
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
      }

      // Створюємо всі задачі
      console.log('Creating tasks:', tasksToCreate.length, 'tasks')
      const results = await Promise.all(
        tasksToCreate.map(async (taskData) => {
          try {
            console.log('Creating task:', taskData.task_name, 'with date:', taskData.planned_date)
            const task = await createTask({
              project_id: user.project_id!,
              task_name: taskData.task_name,
              task_type: 'Планова задача', // Встановлюємо тип задачі
              recurrence_type: taskForm.task_type, // Зберігаємо тип повторюваності
              category_id: taskForm.category_id || undefined,
              planned_date: taskData.planned_date,
              description: taskForm.description || undefined
            })
            if (!task) {
              console.error('Failed to create task:', taskData.task_name)
            } else {
              console.log('Task created successfully:', task.id, task.task_name)
            }
            return task
          } catch (err) {
            console.error('Error creating task:', taskData.task_name, err)
            return null
          }
        })
      )

      const successCount = results.filter(r => r !== null).length
      console.log('Created tasks count:', successCount, 'out of', tasksToCreate.length)
      
      if (successCount > 0) {
        setSuccess(`Створено ${successCount} задач(и)`)
        resetTaskForm()
        setShowCreateModal(false)
        await loadTasks()
      } else {
        setError('Не вдалося створити задачі. Перевірте консоль для деталей.')
      }
      }
    } catch (err: any) {
      setError(err.message || (editingTaskId ? 'Помилка оновлення задачі' : 'Помилка створення задачі'))
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

  const resetTaskForm = () => {
    const currentYear = new Date().getFullYear()
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      date: `${currentYear}-${String(i + 1).padStart(2, '0')}-01`
    }))
    
    setTaskForm({
      task_name: '',
      task_type: 'month',
      category_id: 0,
      description: '',
      year: currentYear,
      planned_date: ''
    })
    setCategorySearch('')
    setMonthlyTasks(months)
    setQuarterlyTasks([])
    setYearlyTask({ date: `${currentYear}-01-01` })
    setEditingTaskId(null)
  }

  const handleDateClick = (task: Task) => {
    console.log('Клік по даті для задачі:', task.id, 'Дата:', task.planned_date)
    setEditingDateTaskId(task.id)
    // Конвертуємо дату в формат YYYY-MM-DD для input type="date"
    try {
      // Обробляємо різні формати дати
      let dateStr = task.planned_date
      if (dateStr.includes('T')) {
        dateStr = dateStr.split('T')[0]
      } else if (dateStr.includes(' ')) {
        dateStr = dateStr.split(' ')[0]
      }
      // Перевіряємо формат YYYY-MM-DD
      if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        setEditingDateValue(dateStr)
      } else {
        // Якщо дата в іншому форматі, конвертуємо
        const date = new Date(task.planned_date)
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        setEditingDateValue(`${year}-${month}-${day}`)
      }
      console.log('Встановлено значення дати:', editingDateValue)
    } catch (err) {
      console.error('Помилка парсингу дати:', err)
      setEditingDateValue(task.planned_date.substring(0, 10))
    }
  }

  const handleDateChange = async (taskId: number, newDate: string) => {
    if (!newDate) return

    try {
      const success = await updateTask(taskId, {
        planned_date: newDate
      })

      if (success) {
        setSuccess('Дату задачі успішно оновлено')
        setEditingDateTaskId(null)
        setEditingDateValue('')
        await loadTasks()
      } else {
        setError('Не вдалося оновити дату задачі')
        setEditingDateTaskId(null)
      }
    } catch (err: any) {
      setError(err.message || 'Помилка оновлення дати')
      setEditingDateTaskId(null)
    }
  }

  const handleDateBlur = (taskId: number) => {
    if (editingDateValue) {
      handleDateChange(taskId, editingDateValue)
    } else {
      setEditingDateTaskId(null)
      setEditingDateValue('')
    }
  }

  const handleDateKeyDown = (e: React.KeyboardEvent, taskId: number) => {
    if (e.key === 'Enter') {
      if (editingDateValue) {
        handleDateChange(taskId, editingDateValue)
      }
    } else if (e.key === 'Escape') {
      setEditingDateTaskId(null)
      setEditingDateValue('')
    }
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
        <h2>{isTeamLead ? 'Планові задачі' : 'Календар'}</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          {!isTeamLead && (
            <button className="btn-primary" onClick={() => {
              resetTaskForm()
              setShowCreateModal(true)
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Створити задачу
            </button>
          )}
          <button 
            className="btn-primary" 
            onClick={() => {
              setShowAllCategoriesModal(true)
              setError(null)
              setSuccess(null)
              handleCancelEditCategory()
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
              <line x1="9" y1="9" x2="21" y2="9"></line>
            </svg>
            Всі категорії
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
            {tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
                  Немає задач
          </div>
        ) : (
          Array.from(groupTasksByName(tasks).entries()).map(([baseName, groupTasks]) => {
            const firstTask = groupTasks[0]
            const isExpanded = expandedTaskGroups.has(baseName)
            const categoryName = taskCategories.find(cat => cat.id === firstTask.category_id)?.name || '-'
            
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
                  onClick={() => toggleTaskGroup(baseName, groupTasks)}
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f7fafc'
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded) {
                      e.currentTarget.style.backgroundColor = '#ffffff'
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                    <svg
                      style={{
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                        width: '16px',
                        height: '16px',
                        color: '#718096'
                      }}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '16px', color: '#2d3748', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{baseName}</span>
                        {firstTask.description && (
                          <div
                            style={{
                              position: 'relative',
                              display: 'inline-flex',
                              alignItems: 'center',
                              cursor: 'help'
                            }}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect()
                              setHoveredTaskDescription(firstTask.description || null)
                              setTooltipPosition({
                                x: rect.left + rect.width / 2,
                                y: rect.top - 10
                              })
                            }}
                            onMouseLeave={() => {
                              setHoveredTaskDescription(null)
                              setTooltipPosition(null)
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{
                                width: '18px',
                                height: '18px',
                                color: '#4299e1',
                                transition: 'color 0.2s'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#3182ce'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = '#4299e1'
                              }}
                            >
                              <circle cx="12" cy="12" r="10"></circle>
                              <line x1="12" y1="16" x2="12" y2="12"></line>
                              <line x1="12" y1="8" x2="12.01" y2="8"></line>
                            </svg>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#718096' }}>
                        <span>Тип задачі: {getTaskTypeText(firstTask.task_type) || '-'}</span>
                        <span>Повторюваність: {getTaskTypeText(firstTask.recurrence_type) || '-'}</span>
                        <span>Категорія: {categoryName}</span>
                        <span>Задач: {groupTasks.length}</span>
                      </div>
                    </div>
                  </div>
                  {!isTeamLead && (
                    <div className="action-buttons" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="btn-action btn-edit"
                        onClick={() => handleEditTaskGroup(groupTasks)}
                        title="Редагувати"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                      <button
                        className="btn-action btn-danger"
                        onClick={() => {
                          // Видаляємо всі задачі групи
                          if (confirm(`Видалити всі задачі "${baseName}"?`)) {
                            Promise.all(groupTasks.map(task => deleteTask(task.id)))
                              .then(() => {
                                setSuccess(`Всі задачі "${baseName}" видалено`)
                                loadTasks()
                              })
                              .catch(() => {
                                setError('Не вдалося видалити задачі')
                              })
                          }
                        }}
                        title="Видалити"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Розкриваюча панель з датами */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '16px',
                      background: '#f7fafc',
                      borderTop: '1px solid #e2e8f0'
                    }}
                  >
                    {firstTask.recurrence_type === 'month' && editingGroupDates.has(baseName) && (
                      <div>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(4, 1fr)', 
                          gap: '12px',
                        }}>
                          {editingGroupDates.get(baseName)?.map((dateItem, index) => (
                            <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ 
                                fontSize: '12px', 
                                fontWeight: '600', 
                                color: '#2d3748',
                                marginBottom: '0'
                              }}>
                                {getMonthName(dateItem.month!)}
                              </label>
                              <input
                                type="text"
                                value={formatDateToUA(dateItem.date)}
                                readOnly={true}
                                placeholder="дд.ММ.рррр"
                                style={{
                                  padding: '8px 12px',
                                  border: '2px solid #e2e8f0',
                                  borderRadius: '8px',
                                  fontSize: '14px',
                                  width: '100%',
                                  color: '#2d3748',
                                  backgroundColor: '#f7fafc',
                                  transition: 'all 0.2s',
                                  cursor: 'default'
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {firstTask.recurrence_type === 'quarter' && editingGroupDates.has(baseName) && (
                      <div>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(4, 1fr)', 
                          gap: '12px',
                        }}>
                          {editingGroupDates.get(baseName)?.map((dateItem, index) => (
                            <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ 
                                fontSize: '12px', 
                                fontWeight: '600', 
                                color: '#2d3748',
                                marginBottom: '0'
                              }}>
                                {dateItem.quarter} квартал
                              </label>
                              <input
                                type="text"
                                value={formatDateToUA(dateItem.date)}
                                readOnly={true}
                                placeholder="дд.ММ.рррр"
                                style={{
                                  padding: '8px 12px',
                                  border: '2px solid #e2e8f0',
                                  borderRadius: '8px',
                                  fontSize: '14px',
                                  width: '100%',
                                  color: '#2d3748',
                                  backgroundColor: '#f7fafc',
                                  transition: 'all 0.2s',
                                  cursor: 'default'
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {firstTask.recurrence_type === 'year' && editingGroupDates.has(baseName) && (
                      <div>
                        <input
                          type="text"
                          value={editingGroupDates.get(baseName)?.[0] ? formatDateToUA(editingGroupDates.get(baseName)![0].date) : ''}
                          readOnly={true}
                          placeholder="дд.ММ.рррр"
                          style={{
                            padding: '8px 12px',
                            border: '2px solid #e2e8f0',
                            borderRadius: '8px',
                            fontSize: '14px',
                            maxWidth: '200px',
                            color: '#2d3748',
                            backgroundColor: '#f7fafc',
                            transition: 'all 0.2s',
                            cursor: 'default'
                          }}
                        />
                      </div>
                    )}
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
          resetTaskForm()
        }}>
          <div className={`modal-content ${taskForm.task_type === 'month' ? 'modal-large' : ''}`} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingTaskId ? 'Редагувати задачу' : 'Створити задачу'}</h3>
              <button className="modal-close" onClick={() => {
                setShowCreateModal(false)
                resetTaskForm()
              }}>
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
                    disabled={!!editingTaskId}
                  >
                    <option value="month">Місяць (12 задач)</option>
                    <option value="quarter">Квартал (4 задачі)</option>
                    <option value="year">Рік (1 задача)</option>
                  </select>
                  {editingTaskId && (
                    <small style={{ color: '#718096', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                      Тип задачі не можна змінити при редагуванні
                    </small>
                  )}
                </div>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label>Категорія</label>
                  <div style={{ position: 'relative' }}>
                  <input
                      ref={categoryInputRef}
                    type="text"
                      value={categorySearch}
                      onChange={(e) => {
                        setCategorySearch(e.target.value)
                        setShowCategoryDropdown(true)
                        if (e.target.value === '') {
                          setTaskForm({ ...taskForm, category_id: 0 })
                        }
                      }}
                      onFocus={() => setShowCategoryDropdown(true)}
                      placeholder="Введіть назву категорії або створіть нову"
                      style={{ width: '100%' }}
                    />
                    {showCategoryDropdown && (
                      <div
                        ref={categoryDropdownRef}
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
                          maxHeight: '200px',
                          overflowY: 'auto',
                          marginTop: '4px'
                        }}
                      >
                        {filteredTaskCategories.length > 0 ? (
                          filteredTaskCategories.map((category) => (
                            <div
                              key={category.id}
                              onClick={() => handleSelectCategory(category)}
                              style={{
                                padding: '10px 16px',
                                cursor: 'pointer',
                                borderBottom: '1px solid #e2e8f0',
                                transition: 'background-color 0.2s',
                                backgroundColor: taskForm.category_id === category.id ? '#e6f2ff' : 'transparent'
                              }}
                              onMouseEnter={(e) => {
                                if (taskForm.category_id !== category.id) {
                                  e.currentTarget.style.backgroundColor = '#f7fafc'
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (taskForm.category_id !== category.id) {
                                  e.currentTarget.style.backgroundColor = 'transparent'
                                }
                              }}
                            >
                              {category.name}
                </div>
                          ))
                        ) : (
                          <div style={{ padding: '10px 16px', color: '#718096', fontSize: '14px' }}>
                            Категорії не знайдено
              </div>
                        )}
                        <div
                          onClick={() => {
                            setShowCreateCategoryModal(true)
                            setShowCategoryDropdown(false)
                          }}
                          style={{
                            padding: '10px 16px',
                            cursor: 'pointer',
                            borderTop: '1px solid #e2e8f0',
                            background: '#f7fafc',
                            fontWeight: '500',
                            color: '#4299e1',
                            transition: 'background-color 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#e6f2ff'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#f7fafc'
                          }}
                        >
                          + Створити нову категорію
                        </div>
                </div>
              )}
                  </div>
                </div>
              </div>

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
                          onChange={(e) => {
                            if (e.target.value) {
                              updateMonthlyDate(index, e.target.value)
                            }
                          }}
                          className="month-date-input"
                          required
                          style={{
                            padding: '8px 12px',
                            border: '2px solid #e2e8f0',
                            borderRadius: '8px',
                            fontSize: '14px',
                            width: '100%',
                            color: '#2d3748',
                            backgroundColor: '#ffffff',
                            transition: 'all 0.2s',
                            cursor: 'pointer'
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#ff6b35'
                            e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 107, 53, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#e2e8f0'
                            e.currentTarget.style.boxShadow = 'none'
                          }}
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
                          onChange={(e) => {
                            if (e.target.value) {
                              updateQuarterlyDate(index, e.target.value)
                            }
                          }}
                          className="quarter-date-input"
                          required
                          style={{
                            padding: '8px 12px',
                            border: '2px solid #e2e8f0',
                            borderRadius: '8px',
                            fontSize: '14px',
                            width: '100%',
                            color: '#2d3748',
                            backgroundColor: '#ffffff',
                            transition: 'all 0.2s',
                            cursor: 'pointer'
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#ff6b35'
                            e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 107, 53, 0.1)'
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#e2e8f0'
                            e.currentTarget.style.boxShadow = 'none'
                          }}
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
                    onChange={(e) => {
                      if (e.target.value) {
                        setYearlyTask({ date: e.target.value })
                      }
                    }}
                    required
                    style={{
                      padding: '8px 12px',
                      border: '2px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                      width: '100%',
                      color: '#2d3748',
                      backgroundColor: '#ffffff',
                      transition: 'all 0.2s',
                      cursor: 'pointer'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = '#ff6b35'
                      e.currentTarget.style.boxShadow = '0 0 0 4px rgba(255, 107, 53, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e2e8f0'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
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
                  resetTaskForm()
                }}>
                  Скасувати
                </button>
                <button type="submit" className="btn-primary">
                  {editingTaskId 
                    ? 'Зберегти зміни' 
                    : `Створити ${taskForm.task_type === 'month' ? '12 задач' : taskForm.task_type === 'quarter' ? '4 задачі' : taskForm.task_type === 'year' ? 'задачу' : 'задачу'}`}
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

      {showCreateCategoryModal && (
        <div className="modal-overlay" onClick={() => {
          setShowCreateCategoryModal(false)
          setNewCategoryName('')
        }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Створити категорію</h3>
              <button className="modal-close" onClick={() => {
                setShowCreateCategoryModal(false)
                setNewCategoryName('')
              }}>
                ×
              </button>
            </div>
            <div style={{ padding: '24px' }}>
              <div className="form-group">
                <label>Назва категорії *</label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Введіть назву категорії"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleCreateCategory()
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className="modal-actions">
                <button 
                  type="button" 
                  className="btn-secondary" 
                  onClick={() => { setShowCreateCategoryModal(false); setNewCategoryName(''); }}
                >
                  Скасувати
                </button>
                <button 
                  type="button" 
                  className="btn-primary" 
                  onClick={handleCreateCategory}
                >
                  Створити
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAllCategoriesModal && (
        <div className="modal-overlay" onClick={() => {
          setShowAllCategoriesModal(false)
          handleCancelEditCategory()
        }}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Всі категорії</h3>
              <button className="modal-close" onClick={() => {
                setShowAllCategoriesModal(false)
                handleCancelEditCategory()
              }}>
                ×
              </button>
            </div>
            <div style={{ padding: '24px', maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Форма створення нової категорії - тільки для не тім ліда */}
              {!isTeamLead && (
                <div style={{ 
                  marginBottom: '24px', 
                  padding: '16px', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '8px',
                  background: '#f7fafc'
                }}>
                  <h4 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '600', color: '#2d3748' }}>
                    Створити нову категорію
                  </h4>
                  <form onSubmit={(e) => {
                    e.preventDefault()
                    handleCreateCategoryInModal()
                  }} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#4a5568' }}>
                        Назва категорії *
                      </label>
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Введіть назву категорії"
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
              )}

              {/* Список категорій */}
              {taskCategories.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '40px', color: '#718096' }}>
                  Немає категорій. Створіть першу категорію вище.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {taskCategories.map((category) => (
                    <div
                      key={category.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        background: editingCategoryId === category.id ? '#f7fafc' : '#ffffff',
                        transition: 'all 0.2s'
                      }}
                    >
                      {editingCategoryId === category.id ? (
                        <>
                          <input
                            type="text"
                            value={editingCategoryName}
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveCategoryName(category.id)
                              } else if (e.key === 'Escape') {
                                handleCancelEditCategory()
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
                            onClick={() => handleSaveCategoryName(category.id)}
                            style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}
                          >
                            Зберегти
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={handleCancelEditCategory}
                            style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}
                          >
                            Скасувати
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: '16px', fontWeight: '500', color: '#2d3748' }}>
                            {category.name}
                          </span>
                          {!isTeamLead && (
                            <button
                              className="btn-action btn-edit"
                              onClick={() => handleEditCategoryName(category)}
                              title="Змінити назву категорії"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                            </button>
                          )}
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
                  setShowAllCategoriesModal(false)
                  handleCancelEditCategory()
                }}
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip для опису задачі */}
      {hoveredTaskDescription && tooltipPosition && (
        <div
          style={{
            position: 'fixed',
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: '#2d3748',
            color: '#ffffff',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            maxWidth: '300px',
            zIndex: 10000,
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
            pointerEvents: 'none',
            marginBottom: '8px',
            lineHeight: '1.5'
          }}
        >
          <div style={{ fontWeight: '600', marginBottom: '6px', fontSize: '13px', color: '#e2e8f0' }}>
            Опис задачі:
          </div>
          <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
            {hoveredTaskDescription}
          </div>
          {/* Стрілка вниз */}
          <div
            style={{
              position: 'absolute',
              bottom: '-6px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid #2d3748'
            }}
          />
        </div>
      )}
      
      {/* Плеер задачі - відображається при активній задачі */}
      <TaskPlayer />
    </div>
  )
}

