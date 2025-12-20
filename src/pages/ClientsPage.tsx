import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDebounce } from '../hooks/useDebounce'
import { useClients, useClientsCount, useClientsDepartments } from '../hooks/useClients'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { List } from 'react-window'
import { 
  createClient, 
  updateClient,
  updateClientStatus,
  getAllKveds,
  getKvedsCount,
  getClientWithRelations
} from '../lib/clients'
import { getDepartmentsByProject, getUserDepartments, getRoleById, getAllRoles } from '../lib/users'
import { searchGroupCompanies, createGroupCompany, getGroupCompaniesByProject, updateGroupCompany } from '../lib/groupCompanies'
import { 
  getActiveAssignedTasksCountForClients,
  getAssignedTasksByClient,
  createMultipleAssignedTasks,
  updateAssignedTask,
  type AssignedTaskWithDetails
} from '../lib/assignedTasks'
import { getTasksByProject } from '../lib/tasks'
import { getUsersByProject } from '../lib/users'
import { getTaskTimeStats } from '../lib/taskTimeLogs'
import { supabase } from '../lib/supabase'
import type { Client, Kved, Department, GroupCompany, Task, User } from '../types/database'
import { formatDate, formatCurrency, formatDateToUA, parseDateToISO, formatMonthYear, formatMinutesToHoursMinutes } from '../utils/date'
import { getStatusBadgeClass, getStatusText, getTaskStatus, getTaskTypeText } from '../utils/status'
import { getBaseTaskName } from '../utils/task'
import { getActualTaskStatusSync } from '../utils/taskStatus'
import { useActiveTask } from '../contexts/ActiveTaskContext'
import TaskPlayer from '../components/TaskPlayer'
import SkeletonLoader from '../components/SkeletonLoader'

interface ClientWithDepartments extends Client {
  departments?: Department[]
  activeTasksCount?: number
}
import './AdminPages.css'
import './ManagerDashboard.css'

export default function ClientsPage() {
  const { user } = useAuth()
  const { activeTaskId } = useActiveTask()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  // Використовуємо React Query хуки для кешування клієнтів
  const CLIENTS_PER_PAGE = 50
  const [clientsCurrentPage, setClientsCurrentPage] = useState(0)
  const offset = clientsCurrentPage * CLIENTS_PER_PAGE
  const { data: clientsData = [], isLoading: clientsLoading, error: clientsError } = useClients(CLIENTS_PER_PAGE, offset)
  const { data: totalClients = 0 } = useClientsCount()
  
  // Отримуємо відділи для клієнтів через React Query
  const clientIds = clientsData.map(client => client.id)
  const { data: departmentsMap = new Map(), isLoading: departmentsLoading } = useClientsDepartments(clientIds.length > 0 ? clientIds : [])
  
  const [clients, setClients] = useState<ClientWithDepartments[]>([])
  const [kveds, setKveds] = useState<Kved[]>([])
  const [kvedsSearch, setKvedsSearch] = useState('')
  const [kvedsCurrentPage, setKvedsCurrentPage] = useState(0)
  const [totalKveds, setTotalKveds] = useState(0)
  const KVEDS_PER_PAGE = 50
  const [departments, setDepartments] = useState<Department[]>([])
  const [isTeamLead, setIsTeamLead] = useState(false)
  const [teamLeadDepartments, setTeamLeadDepartments] = useState<Department[]>([])
  const [teamLeadDepartmentsLoaded, setTeamLeadDepartmentsLoaded] = useState(false)
  const [groupCompanies, setGroupCompanies] = useState<GroupCompany[]>([])
  const [filteredGroupCompanies, setFilteredGroupCompanies] = useState<GroupCompany[]>([])
  const [groupCompaniesReady, setGroupCompaniesReady] = useState(false) // Стан готовності груп компаній
  const [groupCompanySearch, setGroupCompanySearch] = useState('')
  const debouncedGroupCompanySearch = useDebounce(groupCompanySearch, 500)
  const debouncedKvedsSearch = useDebounce(kvedsSearch, 300)
  const [kvedsLoading, setKvedsLoading] = useState(false)
  const [showKvedsDropdown, setShowKvedsDropdown] = useState(false)
  const [selectedKved, setSelectedKved] = useState<Kved | null>(null)
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
  const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set())
  const [clientTasks, setClientTasks] = useState<Map<number, AssignedTaskWithDetails[]>>(new Map())
  const [clientTasksPeriod, setClientTasksPeriod] = useState<Map<number, { type: 'week' | 'month', startDate: Date }>>(new Map())
  const [clientTasksPage, setClientTasksPage] = useState<Map<number, number>>(new Map())
  const [clientTasksStats, setClientTasksStats] = useState<Map<number, Map<number, { totalMinutes: number; status: string | null; completionDate: string | null }>>>(new Map())
  const TASKS_PER_PAGE = 10
  
  // Стани для модального вікна призначення задач
  const [showAssignTasksModal, setShowAssignTasksModal] = useState(false)
  const [selectedClientForTasks, setSelectedClientForTasks] = useState<ClientWithDepartments | null>(null)
  const [assignedTasks, setAssignedTasks] = useState<AssignedTaskWithDetails[]>([])
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

  useEffect(() => {
    const isMounted = { current: true }
    
    if (user?.project_id && user?.role_id) {
      const initializeData = async () => {
        // Спочатку визначаємо роль
        let isTeamLeadRole = false
        if (user.role_id) {
          try {
            const role = await getRoleById(user.role_id)
            if (isMounted.current && role) {
              isTeamLeadRole = role.role_name === 'Тім лід'
              setIsTeamLead(isTeamLeadRole)
              
              // Якщо тім лід, одразу завантажуємо його відділи
              if (isTeamLeadRole && user.id) {
                try {
                  const teamLeadDepts = await getUserDepartments(user.id)
                  if (isMounted.current) {
                    setTeamLeadDepartments(teamLeadDepts)
                    setTeamLeadDepartmentsLoaded(true)
                  }
                } catch (error) {
                  console.error('Error loading team lead departments:', error)
                  if (isMounted.current) {
                    setTeamLeadDepartments([])
                    setTeamLeadDepartmentsLoaded(true) // Відмічаємо як завантажене, навіть якщо порожнє
                  }
                }
              } else if (isMounted.current) {
                setTeamLeadDepartments([])
                setTeamLeadDepartmentsLoaded(true) // Для не-тім ліда також відмічаємо як завантажене
              }
            }
          } catch (error) {
            console.error('Error checking user role:', error)
            if (isMounted.current) {
              setIsTeamLead(false)
              setTeamLeadDepartments([])
              setTeamLeadDepartmentsLoaded(true)
            }
          }
        }
        
        // Після визначення ролі завантажуємо дані
        if (isMounted.current) {
          await loadData(isTeamLeadRole, isMounted)
        }
      }
      initializeData()
    }
    
    return () => {
      isMounted.current = false
    }
  }, [user?.project_id, user?.role_id, user?.id, clientsCurrentPage])

  // Синхронізуємо дані з React Query хуків з локальним станом та обробляємо фільтрацію
  useEffect(() => {
    // Перевіряємо, чи всі дані завантажені перед обробкою
    const isDataReady = !clientsLoading && 
                        !departmentsLoading && 
                        clientsData.length >= 0 && 
                        user?.project_id &&
                        // Якщо тім лід, перевіряємо, чи завантажені його відділи
                        (!isTeamLead || teamLeadDepartmentsLoaded) &&
                        // Перевіряємо, чи завантажені групи компаній
                        groupCompanies.length >= 0
    
    if (isDataReady) {
      const processClients = async () => {
        try {
          // Використовуємо дані з кешу (clientsData та departmentsMap вже завантажені через хуки)
          const clientsWithDepartments = clientsData.map(client => ({
            ...client,
            departments: departmentsMap.get(client.id) || []
          }))
          
          // Для тім ліда фільтруємо клієнтів за відділами
          // Важливо: перевіряємо, чи teamLeadDepartments вже завантажені
          let filteredClients = clientsWithDepartments
          if (isTeamLead) {
            // Якщо відділи тім ліда ще не завантажені, не показуємо клієнтів
            if (teamLeadDepartments.length === 0) {
              // Можливо, відділи ще завантажуються, тому чекаємо
              // Або тім лід дійсно не має відділів - показуємо порожній список
              filteredClients = []
            } else {
              const teamLeadDeptIds = teamLeadDepartments.map(dept => dept.id)
              filteredClients = clientsWithDepartments.filter(client => {
                const clientDeptIds = client.departments?.map(dept => dept.id) || []
                return clientDeptIds.some(deptId => teamLeadDeptIds.includes(deptId))
              })
            }
          }
          
          // Фільтруємо групи компаній - тільки ті, які належать до відфільтрованих клієнтів
          // Це запобігає показу всіх груп компаній перед фільтрацією
          // Важливо: встановлюємо filteredGroupCompanies тільки якщо groupCompanies вже завантажені
          if (groupCompanies.length > 0) {
            const filteredClientGroupIds = new Set(filteredClients.map(c => c.group_company_id).filter(Boolean))
            const filteredGroupCompanies = groupCompanies.filter(group => 
              filteredClientGroupIds.has(group.id)
            )
            setFilteredGroupCompanies(filteredGroupCompanies)
            setGroupCompaniesReady(true) // Відмічаємо, що групи готові до показу
          } else if (filteredClients.length === 0 && !clientsLoading && !departmentsLoading) {
            // Якщо клієнтів немає і дані завантажені, встановлюємо порожній масив
            setFilteredGroupCompanies([])
            setGroupCompaniesReady(true) // Відмічаємо, що групи готові (навіть якщо порожні)
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
          if (!clientsLoading && !departmentsLoading) {
            setLoading(false)
          }
        } catch (err) {
          console.error('Error processing clients:', err)
          setError('Помилка обробки даних клієнтів')
          setLoading(false)
        }
      }
      
      processClients()
    } else if (clientsLoading || departmentsLoading) {
      setLoading(true)
    }
  }, [clientsData, departmentsMap, clientsLoading, departmentsLoading, isTeamLead, teamLeadDepartments, user?.project_id, groupCompanies, teamLeadDepartmentsLoaded])

  // Завантаження КВЕДів з пошуком та пагінацією
  const loadKveds = useCallback(async (searchTerm: string = '', page: number = 0, append: boolean = false) => {
    setKvedsLoading(true)
    try {
      const offset = page * KVEDS_PER_PAGE
      const [kvedsData, totalCount] = await Promise.all([
        getAllKveds(KVEDS_PER_PAGE, offset, searchTerm),
        getKvedsCount(searchTerm)
      ])
      
      if (append) {
        setKveds(prev => [...prev, ...kvedsData])
      } else {
        setKveds(kvedsData)
      }
      setTotalKveds(totalCount)
      setKvedsCurrentPage(page)
    } catch (err) {
      console.error('Помилка завантаження КВЕДів:', err)
      setError('Не вдалося завантажити КВЕДи')
    } finally {
      setKvedsLoading(false)
    }
  }, [KVEDS_PER_PAGE])

  // Завантаження додаткових КВЕДів (кнопка "Завантажити ще")
  const loadMoreKveds = useCallback(async () => {
    const nextPage = kvedsCurrentPage + 1
    await loadKveds(debouncedKvedsSearch, nextPage, true)
  }, [kvedsCurrentPage, debouncedKvedsSearch, loadKveds])

  // Завантаження КВЕДів при зміні пошуку
  useEffect(() => {
    if (showKvedsDropdown) {
      loadKveds(debouncedKvedsSearch, 0, false)
    }
  }, [debouncedKvedsSearch, showKvedsDropdown, loadKveds])

  // Обробка пошуку груп компаній з debounce та мінімальною довжиною
  // Важливо: цей useEffect тільки модифікує filteredGroupCompanies при пошуку
  // Базове встановлення filteredGroupCompanies відбувається в useEffect для фільтрації клієнтів
  useEffect(() => {
    if (!user?.project_id) return
    
    // Не виконуємо пошук, якщо дані ще завантажуються або групи не готові
    // Це запобігає показу всіх груп перед фільтрацією
    if (clientsLoading || departmentsLoading || !groupCompanies.length || loading || !groupCompaniesReady) {
      return
    }

    // Якщо пошук порожній або менше 3 символів, повертаємося до базового списку
    // (який встановлюється в useEffect для фільтрації клієнтів)
    if (debouncedGroupCompanySearch.trim() === '' || debouncedGroupCompanySearch.trim().length < 3) {
      // Повертаємося до базового списку груп компаній відфільтрованих клієнтів
      // Але тільки якщо клієнти вже оброблені (не порожній масив через завантаження)
      const filteredClientGroupIds = new Set(clients.map(c => c.group_company_id).filter(Boolean))
      const filteredGroups = groupCompanies.filter(group => 
        filteredClientGroupIds.has(group.id)
      )
      setFilteredGroupCompanies(filteredGroups)
      return
    }

    // Виконуємо пошук тільки якщо є мінімум 3 символи
    const searchGroups = async () => {
      const results = await searchGroupCompanies(user.project_id!, debouncedGroupCompanySearch)
        // Фільтруємо результати пошуку - тільки ті, які належать до відфільтрованих клієнтів
        const filteredClientGroupIds = new Set(clients.map(c => c.group_company_id).filter(Boolean))
        const filteredResults = results.filter(group => 
          filteredClientGroupIds.has(group.id)
        )
        setFilteredGroupCompanies(filteredResults)
      }
    searchGroups()
  }, [debouncedGroupCompanySearch, groupCompanies, user?.project_id, clients, clientsLoading, departmentsLoading, loading, groupCompaniesReady])

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

  const loadData = async (isTeamLeadRole?: boolean, isMounted: { current: boolean } = { current: true }) => {
    if (!user?.project_id) return

    setError(null)
    setSuccess(null)
    
    try {
      const isTeamLeadValue = isTeamLeadRole !== undefined ? isTeamLeadRole : isTeamLead
      
      // Для тім ліда спочатку отримуємо його відділи (якщо ще не завантажені)
      let teamLeadDepts: Department[] = []
      if (isTeamLeadValue && user?.id) {
        if (!teamLeadDepartmentsLoaded) {
          teamLeadDepts = await getUserDepartments(user.id)
          if (isMounted.current) {
            setTeamLeadDepartments(teamLeadDepts)
            setTeamLeadDepartmentsLoaded(true)
          }
        } else {
          teamLeadDepts = teamLeadDepartments
        }
      }
      
      // Завантажуємо інші дані паралельно (клієнти та відділи вже завантажені через React Query хуки)
      // КВЕДи тепер завантажуються через loadKveds при відкритті dropdown
      const results = await Promise.allSettled([
        getKvedsCount(), // Завантажуємо тільки кількість КВЕДів
        isTeamLeadValue ? Promise.resolve(teamLeadDepts) : getDepartmentsByProject(user.project_id),
        getGroupCompaniesByProject(user.project_id)
      ])
      const kvedsCountData = results[0].status === 'fulfilled' ? results[0].value : 0
      const departmentsData = results[1].status === 'fulfilled' ? results[1].value : []
      const groupCompaniesData = results[2].status === 'fulfilled' ? results[2].value : []
      
      // Логуємо помилки окремо
      if (results[0].status === 'rejected') {
        console.error('Помилка завантаження кількості КВЕДів:', results[0].reason)
      }
      if (results[1].status === 'rejected') {
        console.error('Помилка завантаження відділів:', results[1].reason)
      }
      if (results[2].status === 'rejected') {
        console.error('Помилка завантаження груп компаній:', results[2].reason)
      }
      
      // Перевіряємо монтування перед встановленням стану
      if (!isMounted.current) return
      
      // Клієнти та відділи вже обробляються в окремому useEffect через React Query хуки
      // Тут встановлюємо тільки інші дані
      // КВЕДи тепер завантажуються через loadKveds при відкритті dropdown
      // Тут встановлюємо тільки загальну кількість для інформації
      setTotalKveds(kvedsCountData)
      // Якщо dropdown не відкритий, не завантажуємо КВЕДи
      if (!showKvedsDropdown) {
        setKveds([])
      }
      setDepartments(departmentsData)
      setGroupCompanies(groupCompaniesData)
      // Не встановлюємо filteredGroupCompanies тут - вони будуть відфільтровані в useEffect
      // Це запобігає показу всіх груп компаній перед фільтрацією
      // Також скидаємо стан готовності, щоб не показувати групи до фільтрації
      setGroupCompaniesReady(false)
      
      // Формуємо повідомлення про помилки
      const errors: string[] = []
      
      // Перевіряємо помилки завантаження даних
      if (results[0]?.status === 'rejected') {
        errors.push('Не вдалося завантажити КВЕДи')
      }
      
      // Не показуємо помилку про відсутність КВЕДів, якщо вони просто ще не завантажені (lazy loading)
      // Помилку показуємо тільки якщо справді немає КВЕДів в БД (kvedsCountData === 0) і це не помилка запиту
      // Але оскільки КВЕДи завантажуються lazy, не показуємо помилку тут
      // if (kvedsCountData === 0 && results[0]?.status !== 'rejected') {
      //   console.warn('КВЕДи не знайдено.')
      //   console.warn('Переконайтеся, що виконано міграції:')
      //   console.warn('1. 003_create_kveds.sql - створення таблиці')
      //   console.warn('2. 005_insert_kveds.sql - вставка даних')
      //   errors.push('КВЕДи не знайдено. Переконайтеся, що міграція виконана в Supabase.')
      // }
      
      if (results[1]?.status === 'rejected') {
        errors.push('Не вдалося завантажити відділи')
      }
      
      if (results[2]?.status === 'rejected') {
        errors.push('Не вдалося завантажити групи компаній')
      }
      
      // Показуємо помилки, якщо є критичні
      if (errors.length > 0 && isMounted.current) {
        setError(errors.join('. '))
      }
    } catch (err: any) {
      console.error('Неочікувана помилка при завантаженні даних:', err)
      if (isMounted.current) {
      setError(`Не вдалося завантажити дані: ${err.message || 'Невідома помилка'}`)
      }
    } finally {
      if (isMounted.current) {
      setLoading(false)
      }
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
        const updatedGroupCompanies = [...groupCompanies, newGroup]
        setGroupCompanies(updatedGroupCompanies)
        
        // Додаємо нову групу до filteredGroupCompanies тільки якщо вона відповідає фільтрам
        // (для тім ліда - тільки якщо вона належить до його клієнтів, але нова група ще не має клієнтів)
        // Тому для нової групи завжди додаємо її, оскільки вона буде використовуватися для нового клієнта
        const filteredClientGroupIds = new Set(clients.map(c => c.group_company_id).filter(Boolean))
        // Нова група завжди додається, оскільки вона буде використовуватися для нового клієнта
        const updatedFilteredGroups = [...filteredGroupCompanies, newGroup]
        setFilteredGroupCompanies(updatedFilteredGroups)
        
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

      // Встановлюємо обраний КВЕД, якщо він є
      if (clientWithRelations.kved) {
        setSelectedKved(clientWithRelations.kved)
      } else {
        setSelectedKved(null)
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
    setSelectedKved(null)
    setShowKvedsDropdown(false)
    setKvedsSearch('')
    setKvedsCurrentPage(0)
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
          // Інвалідуємо кеш клієнтів та відділів
          queryClient.invalidateQueries({ queryKey: ['clients'] })
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
        // Інвалідуємо кеш клієнтів та відділів
        queryClient.invalidateQueries({ queryKey: ['clients'] })
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

  function addMonths(date: Date, months: number): Date {
    const result = new Date(date)
    result.setMonth(result.getMonth() + months)
    return result
  }


  // Функції для роботи з призначенням задач
  const toggleClientTasks = useCallback(async (client: ClientWithDepartments) => {
    const isExpanded = expandedClients.has(client.id)
    
    if (isExpanded) {
      // Згортаємо
      setExpandedClients(prev => {
        const newSet = new Set(prev)
        newSet.delete(client.id)
        return newSet
      })
    } else {
      // Розгортаємо - завантажуємо задачі
      setExpandedClients(prev => new Set(prev).add(client.id))
      
      // Ініціалізуємо період для клієнта
      if (!clientTasksPeriod.has(client.id)) {
        const today = new Date()
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
        setClientTasksPeriod(prev => {
          const newMap = new Map(prev)
          newMap.set(client.id, { type: 'month', startDate: firstDayOfMonth })
          return newMap
        })
      }
      
      // Ініціалізуємо сторінку для клієнта
      if (!clientTasksPage.has(client.id)) {
        setClientTasksPage(prev => {
          const newMap = new Map(prev)
          newMap.set(client.id, 0)
          return newMap
        })
      }
      
      // Якщо задачі ще не завантажені, завантажуємо їх
      if (!clientTasks.has(client.id)) {
        try {
          const tasks = await getAssignedTasksByClient(client.id)
          setClientTasks(prev => {
            const newMap = new Map(prev)
            newMap.set(client.id, tasks)
            return newMap
          })
          
          // Завантажуємо статистику часу для всіх задач клієнта
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
          
          setClientTasksStats(prev => {
            const newMap = new Map(prev)
            newMap.set(client.id, statsMap)
            return newMap
          })
        } catch (error) {
          console.error('Помилка завантаження задач клієнта:', error)
        }
      }
    }
  }, [expandedClients, clientTasksPeriod, clientTasksPage, clientTasks])

  const handleAssignTasksClick = async (client: ClientWithDepartments) => {
    setSelectedClientForTasks(client)
    setError(null)
    setSuccess(null)
    
    try {
      // Завантажуємо призначені задачі для клієнта
      const assigned = await getAssignedTasksByClient(client.id)
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

  // Функція для отримання доступних задач для вибору
  const getAvailableTasksForSelect = (): Task[] => {
    if (!assignedTasks || !availableTasks || availableTasks.length === 0) {
      return []
    }
    
    try {
      // Отримуємо ID задач, які вже призначені цьому клієнту
      const assignedTaskIds = new Set(assignedTasks.map(at => at.task_id))
      
      // Фільтруємо задачі, які ще не призначені
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

  // Групуємо призначені задачі по базовій назві
  const groupAssignedTasksByName = (tasks: AssignedTaskWithDetails[]): Map<string, AssignedTaskWithDetails[]> => {
    const grouped = new Map<string, AssignedTaskWithDetails[]>()
    
    if (!tasks || tasks.length === 0) {
      return grouped
    }
    
    tasks.forEach(task => {
      const baseName = task.task ? getBaseTaskName(task.task.task_name) : `Задача #${task.task_id}`
      if (!grouped.has(baseName)) {
        grouped.set(baseName, [])
      }
      grouped.get(baseName)!.push(task)
    })
    
    return grouped
  }

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

  const handleUpdateExecutor = async (taskId: number, executorId: number) => {
    if (!selectedClientForTasks) return
    
    // Якщо вже виконується оновлення, ігноруємо повторні виклики
    if (isUpdatingRef.current) {
      return
    }
    
    // Перевіряємо, чи виконавець обрано (не 0)
    if (executorId === 0) {
      // Якщо вибрано "-- Оберіть виконавця --", не робимо нічого
      return
    }
    
    // Встановлюємо прапорець, що оновлення виконується
    isUpdatingRef.current = true
    
    // Знаходимо задачу для перевірки - використовуємо строгу перевірку
    const taskToUpdate = assignedTasks.find(t => t.id === taskId)
    if (!taskToUpdate) {
      console.error('Задачу не знайдено для оновлення:', taskId, 'Доступні ID:', assignedTasks.map(t => t.id))
      return
    }
    
    // Зберігаємо початковий стан для відкату
    const originalExecutorId = taskToUpdate.executor_id
    const originalGroupId = taskToUpdate.group_id
    
    // Зберігаємо поточний editingAssignedTaskId перед будь-якими змінами (з ref для надійності)
    const currentEditingId = editingTaskIdRef.current ?? editingAssignedTaskId
    
    try {
      // Отримуємо group_id з виконавця
      let executorGroupId: number | null = null
      if (executorId) {
        const executor = availableExecutors.find(e => e.id === executorId)
        if (executor) {
          executorGroupId = executor.group_id || null
        }
      }
      
      // Оптимістичне оновлення тільки для конкретної задачі з строгою перевіркою ID
      setAssignedTasks(prev => {
        const updated = prev.map(task => {
          // Використовуємо строгу перевірку === для уникнення плутанини
          if (task.id === taskId) {
            return { 
              ...task, 
              executor_id: executorId,
              group_id: executorGroupId !== null ? executorGroupId : task.group_id
            }
          }
          return task
        })
        return updated
      })
      
      // Оновлюємо в БД: executor_id та group_id (якщо отримано з виконавця)
      const updateData: { executor_id: number; group_id?: number | null } = { executor_id: executorId }
      if (executorGroupId !== null) {
        updateData.group_id = executorGroupId
      }
      
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
        // Оновлюємо локальний стан замість повного перезавантаження
        setAssignedTasks(prev => {
          const updated = prev.map(task => {
            if (task.id === taskId) {
              const updatedTask = { ...task, executor_id: newExecutorId, group_id: newGroupId }
              previousExecutorValuesRef.current.set(taskId, newExecutorId || 0)
              return updatedTask
            }
            return task
          })
          return updated
        })
        
        // Відновлюємо editingAssignedTaskId синхронно через ref
          const shouldRestore = currentEditingId === taskId || editingTaskIdRef.current === taskId
          if (shouldRestore) {
            setEditingAssignedTaskId(taskId)
            editingTaskIdRef.current = taskId
          }
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
    
    // Знаходимо задачу для перевірки - використовуємо строгу перевірку
    const taskToUpdate = assignedTasks.find(t => t.id === taskId)
    if (!taskToUpdate) {
      console.error('Задачу не знайдено для оновлення:', taskId, 'Доступні ID:', assignedTasks.map(t => t.id))
      return
    }
    
    const newStatus = !currentStatus
    
    // Зберігаємо поточний editingAssignedTaskId перед будь-якими змінами (з ref для надійності)
    const currentEditingId = editingTaskIdRef.current ?? editingAssignedTaskId
    
    try {
      // Оптимістичне оновлення тільки для конкретної задачі з строгою перевіркою ID
      setAssignedTasks(prev => {
        const updated = prev.map(task => {
          // Використовуємо строгу перевірку === для уникнення плутанини
          if (task.id === taskId) {
            return { ...task, is_active: newStatus }
          }
          return task
        })
        return updated
      })
      
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
        // Оновлюємо локальний стан замість повного перезавантаження
        setAssignedTasks(prev => prev.map(task => 
          task.id === taskId ? { ...task, is_active: newStatus } : task
        ))
        
        // Відновлюємо editingAssignedTaskId синхронно через ref
          const shouldRestore = currentEditingId === taskId || editingTaskIdRef.current === taskId
          if (shouldRestore) {
            setEditingAssignedTaskId(taskId)
            editingTaskIdRef.current = taskId
          }
        
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
      if (success) {
        // Оновлюємо локальний стан замість повного перезавантаження
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
      if (success) {
        // Оновлюємо локальний стан замість повного перезавантаження
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
      if (success) {
        // Оновлюємо локальний стан замість повного перезавантаження
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

      // Створюємо призначені задачі для кожної дати з відповідною task_id
      const tasksToCreate = selectedTaskDates.map((dateItem) => {
        const relatedTask = relatedTasks.find(t => t.planned_date.split('T')[0] === dateItem.date)
        // Для тім ліда group_id = user.id (ID тім ліда)
        // Для інших ролей group_id = user.group_id (якщо є)
        const groupId = isTeamLead ? user?.id : (user?.group_id || null)
        return {
          task_id: relatedTask?.id || selectedTaskId,
          client_id: selectedClientForTasks.id,
          department_id: selectedClientForTasks.departments?.[0]?.id || null,
          group_id: groupId,
          executor_id: dateItem.executorId || null,
          is_active: dateItem.isActive
        }
      })

      const created = await createMultipleAssignedTasks(tasksToCreate)
      
      if (created.length > 0) {
        setSuccess(`Успішно призначено ${created.length} ${created.length === 1 ? 'задачу' : created.length < 5 ? 'задачі' : 'задач'}`)
        // Оновлюємо список призначених задач
        const updated = await getAssignedTasksByClient(selectedClientForTasks.id)
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
        setError('Не вдалося призначити задачі')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка призначення задач')
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div style={{ padding: '24px' }}>
          <SkeletonLoader type="table" rows={8} />
        </div>
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
        {!groupCompaniesReady ? (
          // Показуємо skeleton loader, поки групи компаній не готові
          <SkeletonLoader type="card" rows={3} />
        ) : clients.length === 0 ? (
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
                    {groupClients.length > 50 ? (
                      // Використовуємо віртуалізацію для великих списків (>50 записів)
                      <div style={{ width: '100%' }}>
                        {/* Заголовок таблиці */}
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '80px 1fr 1.5fr 1fr 1.2fr 1fr 1.5fr 1fr 1.2fr 1.2fr 140px',
                          background: '#f7fafc', 
                          fontWeight: '600',
                          borderBottom: '2px solid #e2e8f0',
                          position: 'sticky',
                          top: 0,
                          zIndex: 10
                        }}>
                          <div style={{ padding: '12px', textAlign: 'center' }}>Задачі</div>
                          <div style={{ padding: '12px' }}>ЕДРПОУ</div>
                          <div style={{ padding: '12px' }}>Юр. назва</div>
                          <div style={{ padding: '12px' }}>Телефон</div>
                          <div style={{ padding: '12px' }}>Email</div>
                          <div style={{ padding: '12px' }}>Місто</div>
                          <div style={{ padding: '12px' }}>Відділи</div>
                          <div style={{ padding: '12px' }}>Статус</div>
                          <div style={{ padding: '12px' }}>Вартість обслуговування</div>
                          <div style={{ padding: '12px' }}>Дата створення</div>
                          <div style={{ padding: '12px' }}>Дії</div>
                        </div>
                        {/* Віртуалізоване тіло таблиці */}
                        <List
                          height={Math.min(600, groupClients.length * 60)} // Максимальна висота 600px або висота всіх рядків
                          itemCount={groupClients.length}
                          itemSize={60} // Висота одного рядка
                          width="100%"
                        >
                          {({ index, style }: { index: number; style: React.CSSProperties }) => (
                            <div style={style}>
                              <VirtualizedClientRow
                                client={groupClients[index]}
                                expandedClients={expandedClients}
                                clientTasks={clientTasks}
                                clientTasksPeriod={clientTasksPeriod}
                                clientTasksPage={clientTasksPage}
                                clientTasksStats={clientTasksStats}
                                activeTaskId={activeTaskId}
                                isTeamLead={isTeamLead}
                                formatDate={formatDate}
                                formatCurrency={formatCurrency}
                                formatDateToUA={formatDateToUA}
                                formatMinutesToHoursMinutes={formatMinutesToHoursMinutes}
                                getStatusBadgeClass={getStatusBadgeClass}
                                getStatusText={getStatusText}
                                getTaskTypeText={getTaskTypeText}
                                getActualTaskStatusSync={getActualTaskStatusSync}
                                toggleClientTasks={toggleClientTasks}
                                handleEditClient={handleEditClient}
                                handleToggleStatusClick={handleToggleStatusClick}
                                handleViewClient={handleViewClient}
                                handleAssignTasksClick={handleAssignTasksClick}
                                setClientTasksPeriod={setClientTasksPeriod}
                                setClientTasksPage={setClientTasksPage}
                                setEditingAssignedTaskId={setEditingAssignedTaskId}
                                addDays={addDays}
                                addMonths={addMonths}
                                getCurrentWeekMonday={getCurrentWeekMonday}
                                formatMonthYear={formatMonthYear}
                                TASKS_PER_PAGE={TASKS_PER_PAGE}
                              />
                            </div>
                          )}
                        </List>
                        {/* Розгорнуті задачі для віртуалізованого списку рендеряться окремо */}
                        <div>
                        {groupClients.filter(c => expandedClients.has(c.id)).map((client) => {
                          const tasks = clientTasks.get(client.id) || []
                          const period = clientTasksPeriod.get(client.id) || { type: 'month' as 'week' | 'month', startDate: new Date() }
                          const currentPage = clientTasksPage.get(client.id) || 0
                          
                          // Фільтруємо задачі по періоду
                          const filteredTasks = tasks.filter(task => {
                            if (!task.task?.planned_date) return false
                            const taskDate = new Date(task.task.planned_date)
                            taskDate.setHours(0, 0, 0, 0)
                            
                            let startDate: Date
                            let endDate: Date
                            
                            if (period.type === 'week') {
                              startDate = new Date(period.startDate)
                              startDate.setHours(0, 0, 0, 0)
                              endDate = addDays(startDate, 7)
                            } else {
                              startDate = new Date(period.startDate.getFullYear(), period.startDate.getMonth(), 1)
                              startDate.setHours(0, 0, 0, 0)
                              endDate = new Date(period.startDate.getFullYear(), period.startDate.getMonth() + 1, 1)
                              endDate.setHours(0, 0, 0, 0)
                            }
                            
                            return taskDate >= startDate && taskDate < endDate
                          })
                          
                          const totalPages = Math.ceil(filteredTasks.length / TASKS_PER_PAGE)
                          const paginatedTasks = filteredTasks.slice(
                            currentPage * TASKS_PER_PAGE,
                            (currentPage + 1) * TASKS_PER_PAGE
                          )
                          
                          return (
                            <div key={`expanded-${client.id}`} style={{ marginTop: '8px', padding: '16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
                              {/* Тут рендеримо розгорнуті задачі - спрощена версія */}
                              <div style={{ fontWeight: '600', marginBottom: '12px' }}>Задачі клієнта: {client.legal_name}</div>
                              {tasks.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '20px', color: '#718096' }}>Завантаження...</div>
                              ) : filteredTasks.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '20px', color: '#718096' }}>Немає задач для цього періоду</div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {paginatedTasks.map(task => {
                                    const clientStats = clientTasksStats.get(client.id)
                                    const stats = clientStats?.get(task.id)
                                    const status = getActualTaskStatusSync(task, activeTaskId, stats || undefined)
                                    return (
                                      <div key={task.id} style={{ padding: '12px', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                        <div style={{ fontWeight: '500', marginBottom: '4px' }}>{task.task?.task_name || `Задача #${task.task_id}`}</div>
                                        <div style={{ fontSize: '12px', color: '#718096' }}>
                                          Статус: {getStatusText(status)}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                        </div>
                      </div>
                    ) : (
                      // Для малих списків використовуємо звичайну таблицю
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
                <>
                <tr key={client.id}>
                            <td style={{ textAlign: 'center', padding: '8px' }}>
                              {client.activeTasksCount === undefined || client.activeTasksCount === 0 ? (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleClientTasks(client)
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#fecaca'
                                    e.currentTarget.style.transform = 'scale(1.1)'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = expandedClients.has(client.id) ? '#fecaca' : '#fee2e2'
                                    e.currentTarget.style.transform = 'scale(1)'
                                  }}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    backgroundColor: expandedClients.has(client.id) ? '#fecaca' : '#fee2e2',
                                    color: '#dc2626',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    userSelect: 'none'
                                  }}
                                  title={`Немає призначених задач. Натисніть, щоб ${expandedClients.has(client.id) ? 'згорнути' : 'розгорнути'}`}
                                >
                                  <svg 
                                    width="18" 
                                    height="18" 
                                    viewBox="0 0 24 24" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    strokeWidth="2" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round"
                                    style={{
                                      transform: expandedClients.has(client.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                                      transition: 'transform 0.2s'
                                    }}
                                  >
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <line x1="12" y1="8" x2="12" y2="12"></line>
                                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                                  </svg>
                                </div>
                              ) : (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleClientTasks(client)
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#e5e7eb'
                                    e.currentTarget.style.color = '#374151'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#f3f4f6'
                                    e.currentTarget.style.color = '#6b7280'
                                  }}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    borderRadius: '16px',
                                    backgroundColor: expandedClients.has(client.id) ? '#dbeafe' : '#f3f4f6',
                                    color: expandedClients.has(client.id) ? '#1e40af' : '#6b7280',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    userSelect: 'none'
                                  }}
                                  title={`${client.activeTasksCount} ${client.activeTasksCount === 1 ? 'призначена задача' : client.activeTasksCount < 5 ? 'призначені задачі' : 'призначених задач'}. Натисніть, щоб ${expandedClients.has(client.id) ? 'згорнути' : 'розгорнути'}`}
                                >
                                  <svg 
                                    width="16" 
                                    height="16" 
                                    viewBox="0 0 24 24" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    strokeWidth="2" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round"
                                    style={{
                                      transform: expandedClients.has(client.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                                      transition: 'transform 0.2s'
                                    }}
                                  >
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
                {expandedClients.has(client.id) && (() => {
                  const tasks = clientTasks.get(client.id) || []
                  const period = clientTasksPeriod.get(client.id) || { type: 'month' as 'week' | 'month', startDate: new Date() }
                  const currentPage = clientTasksPage.get(client.id) || 0
                  
                  // Фільтруємо задачі по періоду
                  const filteredTasks = tasks.filter(task => {
                    if (!task.task?.planned_date) return false
                    const taskDate = new Date(task.task.planned_date)
                    taskDate.setHours(0, 0, 0, 0)
                    
                    let startDate: Date
                    let endDate: Date
                    
                    if (period.type === 'week') {
                      startDate = new Date(period.startDate)
                      startDate.setHours(0, 0, 0, 0)
                      endDate = addDays(startDate, 7)
                    } else {
                      // Для місяця встановлюємо перший день місяця
                      startDate = new Date(period.startDate.getFullYear(), period.startDate.getMonth(), 1)
                      startDate.setHours(0, 0, 0, 0)
                      endDate = new Date(period.startDate.getFullYear(), period.startDate.getMonth() + 1, 1)
                      endDate.setHours(0, 0, 0, 0)
                    }
                    
                    return taskDate >= startDate && taskDate < endDate
                  })
                  
                  // Пагінація
                  const totalPages = Math.ceil(filteredTasks.length / TASKS_PER_PAGE)
                  const paginatedTasks = filteredTasks.slice(
                    currentPage * TASKS_PER_PAGE,
                    (currentPage + 1) * TASKS_PER_PAGE
                  )
                  
                  return (
                    <tr>
                      <td colSpan={11} style={{ padding: 0, borderTop: 'none', width: '100%' }}>
                        <div style={{ 
                          padding: '20px', 
                          background: '#f9fafb',
                          borderTop: '2px solid #e5e7eb',
                          width: '100%',
                          boxSizing: 'border-box'
                        }}>
                          {/* Заголовок з кнопками */}
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            marginBottom: '16px',
                            flexWrap: 'wrap',
                            gap: '12px'
                          }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <button
                                onClick={() => handleAssignTasksClick(client)}
                                style={{
                                  padding: '8px 16px',
                                  background: '#4299e1',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  fontWeight: '500',
                                  color: '#ffffff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                              >
                                <span>➕</span>
                                Створити задачу
                              </button>
                            </div>
                            <button
                              onClick={() => toggleClientTasks(client)}
                              style={{
                                padding: '8px 16px',
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '500',
                                color: '#2d3748'
                              }}
                            >
                              Згорнути
                            </button>
                          </div>

                          {/* Навігація по періодах */}
                          <div style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            marginBottom: '16px',
                            flexWrap: 'wrap',
                            gap: '8px'
                          }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button
                                onClick={() => {
                                  let newStartDate: Date
                                  if (period.type === 'week') {
                                    newStartDate = addDays(period.startDate, -7)
                                  } else {
                                    const prevMonth = addMonths(period.startDate, -1)
                                    newStartDate = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1)
                                  }
                                  setClientTasksPeriod(prev => {
                                    const newMap = new Map(prev)
                                    newMap.set(client.id, { ...period, startDate: newStartDate })
                                    return newMap
                                  })
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
                              <div style={{ 
                                padding: '6px 16px',
                                fontSize: '16px',
                                fontWeight: '600',
                                color: '#2d3748'
                              }}>
                                {period.type === 'month' 
                                  ? formatMonthYear(period.startDate)
                                  : `${formatDateToUA(period.startDate.toISOString().split('T')[0])} - ${formatDateToUA(addDays(period.startDate, 6).toISOString().split('T')[0])}`
                                }
                              </div>
                              <button
                                onClick={() => {
                                  let newStartDate: Date
                                  if (period.type === 'week') {
                                    newStartDate = addDays(period.startDate, 7)
                                  } else {
                                    const nextMonth = addMonths(period.startDate, 1)
                                    newStartDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1)
                                  }
                                  setClientTasksPeriod(prev => {
                                    const newMap = new Map(prev)
                                    newMap.set(client.id, { ...period, startDate: newStartDate })
                                    return newMap
                                  })
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
                                onClick={() => {
                                  const newType = period.type === 'week' ? 'month' : 'week'
                                  let newStartDate: Date
                                  if (newType === 'week') {
                                    newStartDate = getCurrentWeekMonday()
                                  } else {
                                    const today = new Date()
                                    newStartDate = new Date(today.getFullYear(), today.getMonth(), 1)
                                  }
                                  setClientTasksPeriod(prev => {
                                    const newMap = new Map(prev)
                                    newMap.set(client.id, { type: newType, startDate: newStartDate })
                                    return newMap
                                  })
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
                                {period.type === 'week' ? 'Показати місяць' : 'Показати тиждень'}
                              </button>
                            </div>
                          </div>

                          {/* Список задач */}
                          {tasks.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#718096' }}>
                              Завантаження...
                            </div>
                          ) : filteredTasks.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px', color: '#718096' }}>
                              Немає задач для цього періоду
                            </div>
                          ) : (
                            <>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                                {paginatedTasks.map(task => {
                                  // Використовуємо уніфіковану логіку визначення статусу
                                  const clientStats = clientTasksStats.get(client.id)
                                  const stats = clientStats?.get(task.id)
                                  const status = getActualTaskStatusSync(task, activeTaskId, stats || undefined)
                                  const taskDate = task.task?.planned_date 
                                    ? formatDateToUA(task.task.planned_date.split('T')[0])
                                    : 'Не вказано'
                                  const executorName = task.executor 
                                    ? [task.executor.surname, task.executor.name, task.executor.middle_name].filter(Boolean).join(' ') || task.executor.email
                                    : 'Не призначено'
                                  
                                  // Визначаємо дату виконання та час
                                  const completionDate = task.completion_date 
                                    ? formatDateToUA(task.completion_date.split('T')[0])
                                    : (stats?.completionDate 
                                      ? formatDateToUA(stats.completionDate)
                                      : '-')
                                  
                                  // Використовуємо час зі статистики (з логів), якщо він є, інакше з поля задачі
                                  let totalMinutes = stats?.totalMinutes ?? task.completion_time_minutes ?? 0
                                  if (activeTaskId === task.id) {
                                    // Для активної задачі час розраховується динамічно, але тут ми показуємо тільки збережений час
                                  }
                                  const timeSpent = formatMinutesToHoursMinutes(totalMinutes)

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
                                            <span><strong>Дата виконання:</strong> {completionDate}</span>
                                            <span><strong>Час виконання:</strong> {timeSpent}</span>
                                          </div>
                                          {task.task?.description && (
                                            <p style={{ marginTop: '8px', fontSize: '14px', color: task.is_active ? '#4a5568' : '#a0aec0', lineHeight: '1.5' }}>
                                              {task.task.description}
                                            </p>
                                          )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                          <span className={`status-badge ${getStatusBadgeClass(status)}`} style={{ marginLeft: '12px' }}>
                                            {getStatusText(status)}
                                          </span>
                                          <button
                                            onClick={() => setEditingAssignedTaskId(task.id)}
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
                                    onClick={() => {
                                      setClientTasksPage(prev => {
                                        const newMap = new Map(prev)
                                        newMap.set(client.id, Math.max(0, currentPage - 1))
                                        return newMap
                                      })
                                    }}
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
                                    onClick={() => {
                                      setClientTasksPage(prev => {
                                        const newMap = new Map(prev)
                                        newMap.set(client.id, Math.min(totalPages - 1, currentPage + 1))
                                        return newMap
                                      })
                                    }}
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
                        </div>
                      </td>
                    </tr>
                  )
                })()}
                </>
                        ))}
          </tbody>
        </table>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Пагінація клієнтів */}
      {totalClients > CLIENTS_PER_PAGE && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          gap: '12px', 
          padding: '20px',
          marginTop: '20px',
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
          <button
            onClick={() => {
              if (clientsCurrentPage > 0) {
                setClientsCurrentPage(clientsCurrentPage - 1)
              }
            }}
            disabled={clientsCurrentPage === 0}
            style={{
              padding: '8px 16px',
              background: clientsCurrentPage === 0 ? '#f7fafc' : '#4299e1',
              color: clientsCurrentPage === 0 ? '#a0aec0' : '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: clientsCurrentPage === 0 ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            ← Попередня
          </button>
          
          <span style={{ 
            fontSize: '14px', 
            color: '#4a5568',
            minWidth: '120px',
            textAlign: 'center'
          }}>
            Сторінка {clientsCurrentPage + 1} з {Math.ceil(totalClients / CLIENTS_PER_PAGE)}
            <br />
            <small style={{ color: '#718096' }}>
              Показано {clientsCurrentPage * CLIENTS_PER_PAGE + 1}-{Math.min((clientsCurrentPage + 1) * CLIENTS_PER_PAGE, totalClients)} з {totalClients} клієнтів
            </small>
          </span>
          
          <button
            onClick={() => {
              const totalPages = Math.ceil(totalClients / CLIENTS_PER_PAGE)
              if (clientsCurrentPage < totalPages - 1) {
                setClientsCurrentPage(clientsCurrentPage + 1)
              }
            }}
            disabled={clientsCurrentPage >= Math.ceil(totalClients / CLIENTS_PER_PAGE) - 1}
            style={{
              padding: '8px 16px',
              background: clientsCurrentPage >= Math.ceil(totalClients / CLIENTS_PER_PAGE) - 1 ? '#f7fafc' : '#4299e1',
              color: clientsCurrentPage >= Math.ceil(totalClients / CLIENTS_PER_PAGE) - 1 ? '#a0aec0' : '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: clientsCurrentPage >= Math.ceil(totalClients / CLIENTS_PER_PAGE) - 1 ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Наступна →
          </button>
        </div>
      )}

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
                  <div style={{ position: 'relative' }}>
                    <div
                      onClick={() => {
                        setShowKvedsDropdown(!showKvedsDropdown)
                        if (!showKvedsDropdown && kveds.length === 0) {
                          loadKveds('', 0, false)
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        background: '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        minHeight: '38px'
                      }}
                    >
                      <span style={{ color: clientForm.kved_id ? '#2d3748' : '#a0aec0' }}>
                        {selectedKved 
                          ? `${selectedKved.code} - ${selectedKved.description}`
                          : clientForm.kved_id
                            ? (kveds.find(k => k.id === clientForm.kved_id)
                              ? `${kveds.find(k => k.id === clientForm.kved_id)!.code} - ${kveds.find(k => k.id === clientForm.kved_id)!.description}`
                              : 'Оберіть КВЕД')
                            : 'Оберіть КВЕД'}
                      </span>
                      <svg 
                        width="16" 
                        height="16" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2"
                        style={{ 
                          transform: showKvedsDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s'
                        }}
                      >
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </div>
                    
                    {showKvedsDropdown && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        zIndex: showCreateModal ? 10001 : 1000,
                        maxHeight: '300px',
                        display: 'flex',
                        flexDirection: 'column'
                      }}>
                        {/* Пошук */}
                        <div style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>
                          <input
                            type="text"
                            value={kvedsSearch}
                            onChange={(e) => {
                              setKvedsSearch(e.target.value)
                              setKvedsCurrentPage(0)
                            }}
                            placeholder="Пошук по коду або опису..."
                            style={{
                              width: '100%',
                              padding: '6px 10px',
                              border: '1px solid #e2e8f0',
                              borderRadius: '4px',
                              fontSize: '14px'
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        
                        {/* Список КВЕДів */}
                        <div style={{ 
                          overflowY: 'auto', 
                          maxHeight: '200px',
                          flex: 1
                        }}>
                          {kvedsLoading && kveds.length === 0 ? (
                            <div style={{ padding: '16px', textAlign: 'center', color: '#718096' }}>
                              Завантаження...
                            </div>
                          ) : kveds.length === 0 ? (
                            <div style={{ padding: '16px', textAlign: 'center', color: '#718096' }}>
                              {kvedsSearch ? 'КВЕДи не знайдено' : 'КВЕДи не завантажено'}
                            </div>
                          ) : (
                            <>
                              {kveds.map((kved) => (
                                <div
                                  key={kved.id}
                                  onClick={() => {
                                    setClientForm({ ...clientForm, kved_id: kved.id })
                                    setSelectedKved(kved)
                                    setShowKvedsDropdown(false)
                                    setKvedsSearch('')
                                    setKvedsCurrentPage(0)
                                  }}
                                  style={{
                                    padding: '10px 12px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #f7fafc',
                                    background: clientForm.kved_id === kved.id ? '#e6f3ff' : '#ffffff',
                                    transition: 'background 0.2s'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (clientForm.kved_id !== kved.id) {
                                      e.currentTarget.style.background = '#f7fafc'
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (clientForm.kved_id !== kved.id) {
                                      e.currentTarget.style.background = '#ffffff'
                                    }
                                  }}
                                >
                                  <div style={{ fontWeight: '500', color: '#2d3748', fontSize: '14px' }}>
                                    {kved.code}
                                  </div>
                                  <div style={{ color: '#718096', fontSize: '12px', marginTop: '2px' }}>
                                    {kved.description}
                                  </div>
                                </div>
                              ))}
                              
                              {/* Кнопка "Завантажити ще" */}
                              {kveds.length < totalKveds && (
                                <div style={{ padding: '8px', borderTop: '1px solid #e2e8f0' }}>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      loadMoreKveds()
                                    }}
                                    disabled={kvedsLoading}
                                    style={{
                                      width: '100%',
                                      padding: '8px',
                                      background: kvedsLoading ? '#e2e8f0' : '#4299e1',
                                      color: kvedsLoading ? '#a0aec0' : '#ffffff',
                                      border: 'none',
                                      borderRadius: '4px',
                                      cursor: kvedsLoading ? 'not-allowed' : 'pointer',
                                      fontSize: '14px',
                                      fontWeight: '500',
                                      transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                      if (!kvedsLoading) {
                                        e.currentTarget.style.background = '#3182ce'
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (!kvedsLoading) {
                                        e.currentTarget.style.background = '#4299e1'
                                      }
                                    }}
                                  >
                                    {kvedsLoading ? 'Завантаження...' : `Завантажити ще (${totalKveds - kveds.length} залишилося)`}
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Закриття dropdown при кліку поза ним */}
                  {showKvedsDropdown && !showCreateModal && (
                    <div
                      style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 999
                      }}
                      onClick={() => {
                        setShowKvedsDropdown(false)
                        setKvedsSearch('')
                        setKvedsCurrentPage(0)
                      }}
                    />
                  )}
                  
                  {/* Показуємо помилку тільки якщо КВЕДи спробували завантажити, але їх немає в БД */}
                  {kveds.length === 0 && !showKvedsDropdown && totalKveds === 0 && (
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
                    {Array.from(groupAssignedTasksByName(assignedTasks).entries()).map(([baseName, groupTasks]: [string, AssignedTaskWithDetails[]]) => {
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
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleAssignedTaskGroup(baseName)
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation()
                            }}
                            style={{
                              padding: '16px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: isExpanded ? '#f7fafc' : '#ffffff',
                              transition: 'background-color 0.2s',
                              borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                              userSelect: 'none',
                              pointerEvents: 'auto',
                              position: 'relative',
                              zIndex: 1
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
                                            key={`executor-select-${assigned.id}`}
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
                                              const currentExecutorId = assigned.executor_id || 0
                                              const previousExecutorId = previousExecutorValuesRef.current.get(currentTaskId) ?? currentExecutorId
                                              
                                              // Перевіряємо, чи значення реально змінилося від попереднього
                                              if (executorId === previousExecutorId) {
                                                console.log('Значення не змінилося від попереднього, ігноруємо onChange для задачі:', currentTaskId, 'executorId:', executorId, 'previous:', previousExecutorId)
                                                return
                                              }
                                              
                                              // Оновлюємо попереднє значення
                                              previousExecutorValuesRef.current.set(currentTaskId, executorId)
                                              
                                              console.log('onChange executor для задачі:', currentTaskId, 'новий executorId:', executorId, 'поточний:', currentExecutorId, 'попередній:', previousExecutorId)
                                              // Оновлюємо тільки якщо вибрано реального виконавця (не 0)
                                              if (executorId !== 0) {
                                                // Використовуємо замикання для гарантії правильного taskId
                                                handleUpdateExecutor(currentTaskId, executorId)
                                              }
                                            }}
                                            onFocus={(e) => {
                                              e.stopPropagation()
                                              // Зберігаємо поточне значення при фокусі
                                              const currentTaskId = assigned.id
                                              const currentExecutorId = assigned.executor_id || 0
                                              previousExecutorValuesRef.current.set(currentTaskId, currentExecutorId)
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
                                            <span className={`status-badge ${assigned.task_status ? 'status-active' : 'status-inactive'}`} style={{
                                              padding: '6px 12px',
                                              borderRadius: '16px',
                                              fontSize: '13px',
                                              fontWeight: '500',
                                              display: 'inline-block'
                                            }}>
                                              {assigned.task_status || (assigned.is_active ? 'Не розпочато' : '-')}
                                            </span>
                                          </div>
                                        ) : (
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
                                            <option value="В роботі">В роботі</option>
                                            <option value="Виконано">Виконано</option>
                                            <option value="Відкладено">Відкладено</option>
                                            <option value="Скасовано">Скасовано</option>
                                            <option value="Очікує">Очікує</option>
                                          </select>
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
                                              const minutes = assigned.completion_time_minutes ?? 0
                                              const hours = Math.floor(minutes / 60)
                                              const mins = minutes % 60
                                              return `${hours} г. ${mins} хв.`
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
      
      {/* Плеер задачі - відображається при активній задачі */}
      <TaskPlayer />
    </div>
  )
}

// Компонент для віртуалізованого рядка клієнта
function VirtualizedClientRow({
  client,
  expandedClients,
  clientTasks,
  clientTasksPeriod,
  clientTasksPage,
  clientTasksStats,
  activeTaskId,
  isTeamLead,
  formatDate,
  formatCurrency,
  formatDateToUA,
  formatMinutesToHoursMinutes,
  getStatusBadgeClass,
  getStatusText,
  getTaskTypeText,
  getActualTaskStatusSync,
  toggleClientTasks,
  handleEditClient,
  handleToggleStatusClick,
  handleViewClient,
  handleAssignTasksClick,
  setClientTasksPeriod,
  setClientTasksPage,
  setEditingAssignedTaskId,
  addDays,
  addMonths,
  getCurrentWeekMonday,
  formatMonthYear,
  TASKS_PER_PAGE
}: {
  client: ClientWithDepartments
  expandedClients: Set<number>
  clientTasks: Map<number, AssignedTaskWithDetails[]>
  clientTasksPeriod: Map<number, { type: 'week' | 'month', startDate: Date }>
  clientTasksPage: Map<number, number>
  clientTasksStats: Map<number, Map<number, { completionDate?: string, totalMinutes?: number }>>
  activeTaskId: number | null
  isTeamLead: boolean
  formatDate: (date: string) => string
  formatCurrency: (amount?: number) => string
  formatDateToUA: (date: string) => string
  formatMinutesToHoursMinutes: (minutes: number) => string
  getStatusBadgeClass: (status?: string) => string
  getStatusText: (status?: string) => string
  getTaskTypeText: (type?: string) => string
  getActualTaskStatusSync: (task: AssignedTaskWithDetails, activeTaskId: number | null, stats?: { completionDate?: string, totalMinutes?: number }) => string
  toggleClientTasks: (client: ClientWithDepartments) => void
  handleEditClient: (client: ClientWithDepartments) => void
  handleToggleStatusClick: (client: ClientWithDepartments) => void
  handleViewClient: (client: ClientWithDepartments) => void
  handleAssignTasksClick: (client: ClientWithDepartments) => void
  setClientTasksPeriod: React.Dispatch<React.SetStateAction<Map<number, { type: 'week' | 'month', startDate: Date }>>>
  setClientTasksPage: React.Dispatch<React.SetStateAction<Map<number, number>>>
  setEditingAssignedTaskId: React.Dispatch<React.SetStateAction<number | null>>
  addDays: (date: Date, days: number) => Date
  addMonths: (date: Date, months: number) => Date
  getCurrentWeekMonday: () => Date
  formatMonthYear: (date: Date) => string
  TASKS_PER_PAGE: number
}) {
  const isExpanded = expandedClients.has(client.id)
  
  return (
    <>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '80px 1fr 1.5fr 1fr 1.2fr 1fr 1.5fr 1fr 1.2fr 1.2fr 140px',
        borderBottom: '1px solid #e2e8f0',
        background: '#ffffff',
        alignItems: 'center'
      }}>
        <div style={{ textAlign: 'center', padding: '8px' }}>
          {client.activeTasksCount === undefined || client.activeTasksCount === 0 ? (
            <div
              onClick={(e) => {
                e.stopPropagation()
                toggleClientTasks(client)
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#fecaca'
                e.currentTarget.style.transform = 'scale(1.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isExpanded ? '#fecaca' : '#fee2e2'
                e.currentTarget.style.transform = 'scale(1)'
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: isExpanded ? '#fecaca' : '#fee2e2',
                color: '#dc2626',
                cursor: 'pointer',
                transition: 'all 0.2s',
                userSelect: 'none'
              }}
              title={`Немає призначених задач. Натисніть, щоб ${isExpanded ? 'згорнути' : 'розгорнути'}`}
            >
              <svg 
                width="18" 
                height="18" 
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
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
          ) : (
            <div
              onClick={(e) => {
                e.stopPropagation()
                toggleClientTasks(client)
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#e5e7eb'
                e.currentTarget.style.color = '#374151'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6'
                e.currentTarget.style.color = '#6b7280'
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '16px',
                backgroundColor: isExpanded ? '#dbeafe' : '#f3f4f6',
                color: isExpanded ? '#1e40af' : '#6b7280',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.2s',
                userSelect: 'none'
              }}
              title={`${client.activeTasksCount} ${client.activeTasksCount === 1 ? 'призначена задача' : client.activeTasksCount < 5 ? 'призначені задачі' : 'призначених задач'}. Натисніть, щоб ${isExpanded ? 'згорнути' : 'розгорнути'}`}
            >
              <svg 
                width="16" 
                height="16" 
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
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
              <span>{client.activeTasksCount}</span>
            </div>
          )}
        </div>
        <div style={{ padding: '12px' }}>{client.edrpou || '-'}</div>
        <div style={{ padding: '12px' }}>{client.legal_name}</div>
        <div style={{ padding: '12px' }}>{client.phone || '-'}</div>
        <div style={{ padding: '12px' }}>{client.email || '-'}</div>
        <div style={{ padding: '12px' }}>{client.city || '-'}</div>
        <div style={{ padding: '12px' }}>
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
        </div>
        <div style={{ padding: '12px' }}>
          <span className={`status-badge ${getStatusBadgeClass(client.status)}`}>
            {getStatusText(client.status)}
          </span>
        </div>
        <div style={{ padding: '12px' }}>{formatCurrency(client.service_cost)}</div>
        <div style={{ padding: '12px' }}>{formatDate(client.created_at)}</div>
        <div style={{ padding: '12px' }}>
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
        </div>
      </div>
      {/* Розгорнуті задачі рендеряться окремо після віртуалізованого списку */}
    </>
  )
}

