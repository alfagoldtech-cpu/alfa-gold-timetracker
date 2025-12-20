import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { List } from 'react-window'
import { useAuth } from '../contexts/AuthContext'
import { useUsersByProject, useUsersByProjectCount } from '../hooks/useUsers'
import { 
  getDepartmentsByProject, 
  createDepartment,
  updateDepartment,
  getUserDepartments,
  setUserDepartments,
  getUserWithRole,
  getUserWithDepartments,
  getAllRoles,
  updateUserStatus,
  updateUser,
  getTeamLeadEmployees,
  getRoleById
} from '../lib/users'
import { resetPasswordForEmail, updateUserEmailInAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import type { User, Department, Role } from '../types/database'
import { formatDate } from '../utils/date'
import { getStatusBadgeClass, getStatusText } from '../utils/status'
import { getFullName } from '../utils/user'
import TaskPlayer from '../components/TaskPlayer'
import SkeletonLoader from '../components/SkeletonLoader'
import './AdminPages.css'
import './ManagerDashboard.css'

interface EmployeeWithRole extends User {
  role?: Role
}

export default function EmployeesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [employees, setEmployees] = useState<EmployeeWithRole[]>([])
  const [groupMembers, setGroupMembers] = useState<EmployeeWithRole[]>([])
  const [employeesWithoutGroup, setEmployeesWithoutGroup] = useState<EmployeeWithRole[]>([])
  const [employeesReady, setEmployeesReady] = useState(false) // Стан готовності співробітників
  const [groupMembersReady, setGroupMembersReady] = useState(false) // Стан готовності працівників групи (для тім ліда)
  const [employeesWithoutGroupReady, setEmployeesWithoutGroupReady] = useState(false) // Стан готовності працівників без групи (для тім ліда)
  const [departments, setDepartments] = useState<Department[]>([])
  const [availableRoles, setAvailableRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [isTeamLead, setIsTeamLead] = useState(false)
  const [teamLeadDepartments, setTeamLeadDepartments] = useState<Department[]>([])
  const [showDepartmentModal, setShowDepartmentModal] = useState(false)
  const [showEmployeeModal, setShowEmployeeModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showAllDepartmentsModal, setShowAllDepartmentsModal] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeWithRole | null>(null)
  const [employeeToToggle, setEmployeeToToggle] = useState<EmployeeWithRole | null>(null)
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null)
  const [editingDepartmentId, setEditingDepartmentId] = useState<number | null>(null)
  const [editingDepartmentName, setEditingDepartmentName] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Пагінація для користувачів (тільки для керівника виробництва)
  const USERS_PER_PAGE = 25
  const [usersCurrentPage, setUsersCurrentPage] = useState(0)
  
  // Використовуємо React Query хуки для кешування користувачів (тільки для керівника виробництва)
  const offset = usersCurrentPage * USERS_PER_PAGE
  const { data: usersData = [], isLoading: usersLoading } = useUsersByProject(user?.project_id || 0, USERS_PER_PAGE, offset)
  const { data: totalUsers = 0 } = useUsersByProjectCount(user?.project_id || 0)

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
        
        // Після визначення ролі завантажуємо дані, передаючи значення ролі безпосередньо
        // Для керівника виробництва не викликаємо loadData тут, оскільки дані завантажуються через React Query
        if (isTeamLeadRole) {
          await loadData(isTeamLeadRole)
        } else {
          // Для керівника виробництва встановлюємо loading, поки дані не будуть оброблені в useEffect
          setLoading(true)
        }
        await loadAvailableRoles(isTeamLeadRole)
      }
      initializeData()
    }
  }, [user?.project_id, user?.role_id])
  
  // Синхронізуємо дані з React Query хуків для керівника виробництва
  useEffect(() => {
    // Не обробляємо для тім ліда - для нього дані завантажуються в loadData
    if (isTeamLead) return
    
    if (usersLoading) {
      // Під час завантаження показуємо skeleton loader
      setLoading(true)
      setEmployeesReady(false)
      setEmployees([]) // Очищаємо дані під час завантаження
      return
    }
    
    if (!usersLoading && usersData.length >= 0 && user?.project_id && user?.id) {
      const processUsers = async () => {
        try {
          // Скидаємо стан готовності та очищаємо дані перед обробкою
          setEmployeesReady(false)
          setEmployees([]) // Очищаємо дані
          setLoading(true) // Встановлюємо loading перед обробкою
          
          // Фільтруємо поточного користувача (використовуємо дані з кешу)
          const filteredEmployees = usersData.filter(emp => emp.id !== user.id)
          
          // Завантажуємо ролі для кожного співробітника
          const employeesWithRoles = await Promise.all(
            filteredEmployees.map(async (emp) => {
              const userWithRole = await getUserWithRole(emp.id)
              return userWithRole ? { ...emp, role: userWithRole.role } : emp
            })
          )
          
          // Встановлюємо дані та готовність одночасно
          setEmployees(employeesWithRoles)
          setEmployeesReady(true) // Відмічаємо, що співробітники готові до показу
          setLoading(false)
        } catch (err) {
          console.error('Error processing users:', err)
          setError('Помилка обробки даних користувачів')
          setEmployees([]) // Очищаємо дані при помилці
          setEmployeesReady(true) // Навіть при помилці встановлюємо готовність
          setLoading(false)
        }
      }
      
      processUsers()
    }
  }, [usersData, usersLoading, isTeamLead, user?.project_id, user?.id])

  const loadAvailableRoles = async (isTeamLeadRole?: boolean) => {
    const allRoles = await getAllRoles()
    const isTeamLeadValue = isTeamLeadRole !== undefined ? isTeamLeadRole : isTeamLead
    
    if (isTeamLeadValue) {
      // Тім лід може створювати тільки "Аккаунт менеджер" та "Бухгалтер"
      const teamLeadRoles = allRoles.filter(role => 
        role.role_name === 'Аккаунт менеджер' || role.role_name === 'Бухгалтер'
      )
      setAvailableRoles(teamLeadRoles)
    } else {
      // Керівник виробництва не може створювати адміністратора (id=1) та керівника виробництва (id=2)
      const filteredRoles = allRoles.filter(role => role.id !== 1 && role.id !== 2)
      setAvailableRoles(filteredRoles)
    }
  }

  const loadData = async (isTeamLeadRole?: boolean) => {
    if (!user?.project_id || !user?.id) return

    const isTeamLeadValue = isTeamLeadRole !== undefined ? isTeamLeadRole : isTeamLead
    
    // Для керівника виробництва не виконуємо loadData - дані завантажуються через React Query в useEffect
    if (!isTeamLeadValue) {
      return
    }

    setLoading(true)
    // Скидаємо стани готовності та очищаємо дані перед завантаженням
    setGroupMembersReady(false)
    setEmployeesWithoutGroupReady(false)
    setGroupMembers([]) // Очищаємо дані
    setEmployeesWithoutGroup([]) // Очищаємо дані
    
    try {
      // Для тім ліда спочатку отримуємо його відділи
      const teamLeadDepts = await getUserDepartments(user.id)
      const teamLeadDeptIds = teamLeadDepts.map(dept => dept.id)
      
      // Завантажуємо своїх працівників та працівників без групи з фільтрацією за відділами
      // Якщо у тім ліда є відділи, передаємо їх для фільтрації, інакше передаємо undefined
      const teamLeadData = await getTeamLeadEmployees(
        user.id, 
        user.project_id, 
        teamLeadDeptIds.length > 0 ? teamLeadDeptIds : undefined
      )
      
      // Завантажуємо ролі для співробітників групи
      const groupMembersWithRoles = await Promise.all(
        teamLeadData.groupMembers.map(async (emp) => {
          const userWithRole = await getUserWithRole(emp.id)
          return userWithRole ? { ...emp, role: userWithRole.role } : emp
        })
      )
      
      // Завантажуємо ролі для співробітників без групи
      const withoutGroupWithRoles = await Promise.all(
        teamLeadData.withoutGroup.map(async (emp) => {
          const userWithRole = await getUserWithRole(emp.id)
          return userWithRole ? { ...emp, role: userWithRole.role } : emp
        })
      )
      
      // Встановлюємо дані та готовність одночасно
      setGroupMembers(groupMembersWithRoles)
      setEmployeesWithoutGroup(withoutGroupWithRoles)
      setTeamLeadDepartments(teamLeadDepts)
      setDepartments(teamLeadDepts) // Для тім ліда використовуємо тільки його відділи
      setGroupMembersReady(true) // Відмічаємо, що працівники групи готові
      setEmployeesWithoutGroupReady(true) // Відмічаємо, що працівники без групи готові
    } catch (err) {
      console.error('Error loading data:', err)
      setError('Не вдалося завантажити дані')
      // Навіть при помилці встановлюємо готовність, щоб показати порожній список
      setEmployeesReady(true)
      setGroupMembersReady(true)
      setEmployeesWithoutGroupReady(true)
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
        // Якщо модальне вікно "Всі відділи" відкрите, не закриваємо його
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

    // Для тім ліда автоматично призначаємо його відділи
    if (isTeamLead) {
      const teamLeadDeptIds = teamLeadDepartments.map(dept => dept.id)
      if (teamLeadDeptIds.length === 0) {
        setError('У вас немає відділу. Зверніться до керівника виробництва для призначення відділу.')
        return
      }
      // Автоматично встановлюємо відділи тім ліда
      setEmployeeForm(prev => ({ ...prev, department_ids: teamLeadDeptIds }))
    } else {
      // Для керівника виробництва перевіряємо вибір відділів
      if (employeeForm.department_ids.length === 0) {
        setError('Оберіть хоча б один відділ')
        return
      }
    }

    if (!employeeForm.role_id || employeeForm.role_id === 0) {
      setError('Оберіть роль для працівника')
      return
    }

    setError(null)
    setSuccess(null)

    try {
      if (editingEmployeeId) {
        // Редагування існуючого співробітника
        const allEmployees = isTeamLead 
          ? [...groupMembers, ...employeesWithoutGroup]
          : employees
        const currentEmployee = allEmployees.find(emp => emp.id === editingEmployeeId)
        if (!currentEmployee) {
          setError('Співробітник не знайдено')
          return
        }

        const emailChanged = currentEmployee.email !== employeeForm.email

        // 1. Оновлюємо дані в таблиці users
        const updateSuccess = await updateUser(editingEmployeeId, {
          surname: employeeForm.surname,
          name: employeeForm.name,
          middle_name: employeeForm.middle_name,
          email: employeeForm.email,
          phone: employeeForm.phone,
          role_id: employeeForm.role_id
        })

        if (!updateSuccess) {
          setError('Не вдалося оновити дані співробітника')
          return
        }

        // 2. Якщо змінився email - оновлюємо в Supabase Auth
        if (emailChanged && currentEmployee.auth_user_id) {
          const authUpdateSuccess = await updateUserEmailInAuth(
            currentEmployee.auth_user_id,
            employeeForm.email
          )

          if (!authUpdateSuccess) {
            setError('Дані оновлено, але не вдалося оновити email в системі авторизації. Перевірте консоль браузера для деталей. Для роботи потрібно додати VITE_SUPABASE_SERVICE_ROLE_KEY в .env.local')
            // Продовжуємо, навіть якщо не вдалося оновити email в Auth
          } else {
            // Відправляємо email для підтвердження нового email
            try {
              await resetPasswordForEmail(employeeForm.email)
              setSuccess(`Співробітник "${employeeForm.surname} ${employeeForm.name}" успішно оновлено! На новий email "${employeeForm.email}" надіслано посилання для підтвердження.`)
            } catch (resetError: any) {
              console.warn('Не вдалося відправити email:', resetError)
              setSuccess(`Співробітник "${employeeForm.surname} ${employeeForm.name}" успішно оновлено! Увага: не вдалося відправити email для підтвердження нового email.`)
            }
          }
        }

        // 3. Оновлюємо відділи
        // Для тім ліда не дозволяємо змінювати відділи - залишаємо поточні
        let deptIds = employeeForm.department_ids
        if (isTeamLead) {
          const currentDepts = await getUserDepartments(editingEmployeeId)
          deptIds = currentDepts.map(d => d.id)
        }
        const deptSuccess = await setUserDepartments(editingEmployeeId, deptIds)
        
        if (!deptSuccess) {
          setError('Дані оновлено, але не вдалося оновити відділи')
        } else if (!emailChanged) {
          setSuccess(`Співробітник "${employeeForm.surname} ${employeeForm.name}" успішно оновлено!`)
        }

        resetEmployeeForm()
        setShowEmployeeModal(false)
        // Інвалідуємо кеш користувачів
        queryClient.invalidateQueries({ queryKey: ['users'] })
        await loadData()
      } else {
        // Створення нового співробітника
        // Генеруємо тимчасовий пароль
        const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase() + '1!'

        // 1. Перевіряємо, чи користувач з таким email вже існує в таблиці users
        const { data: existingUserRecord } = await supabase
          .from('users')
          .select('id, auth_user_id')
          .eq('email', employeeForm.email)
          .single()

        if (existingUserRecord) {
          throw new Error(`Користувач з email ${employeeForm.email} вже існує в системі. ID запису: ${existingUserRecord.id}`)
        }

        // 2. Створюємо користувача в Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: employeeForm.email,
          password: tempPassword,
        })

        if (authError) {
          // Якщо помилка про те, що користувач вже існує
          if (authError.message.includes('already registered') || authError.message.includes('already exists') || authError.message.includes('User already registered')) {
            throw new Error(`Користувач з email ${employeeForm.email} вже зареєстрований в системі авторизації. Спробуйте використати інший email або зверніться до адміністратора.`)
          }
          throw authError
        }

        if (!authData.user) {
          throw new Error('Не вдалося створити користувача в системі аутентифікації')
        }

        const authUserId = authData.user.id

        // 3. Створюємо запис в таблиці users
        // Якщо це тім лід створює співробітника, встановлюємо group_id
        const userData: any = {
          auth_user_id: authUserId,
          project_id: user.project_id,
          role_id: employeeForm.role_id,
          surname: employeeForm.surname,
          name: employeeForm.name,
          middle_name: employeeForm.middle_name,
          email: employeeForm.email,
          phone: employeeForm.phone,
          status: 'active',
        }
        
        // Якщо поточний користувач - тім лід, встановлюємо group_id
        if (isTeamLead && user.id) {
          userData.group_id = user.id
        }
        
        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert(userData)
          .select()
          .single()

        if (userError) {
          throw userError
        }

        if (!newUser) {
          throw new Error('Не вдалося створити запис користувача')
        }

        // 3. Призначаємо департаменти
        // Для тім ліда використовуємо його відділи, для інших - вибрані відділи
        const deptIds = isTeamLead 
          ? teamLeadDepartments.map(dept => dept.id)
          : employeeForm.department_ids
        await setUserDepartments(newUser.id, deptIds)

        // 5. Відправляємо email з посиланням для встановлення пароля
        try {
          await resetPasswordForEmail(employeeForm.email)
          setSuccess(`Працівник "${employeeForm.surname} ${employeeForm.name}" успішно створено! На email "${employeeForm.email}" надіслано посилання для встановлення пароля.`)
        } catch (resetError: any) {
          console.warn('Не вдалося відправити email:', resetError)
          setSuccess(`Працівник "${employeeForm.surname} ${employeeForm.name}" успішно створено! Увага: не вдалося відправити email з посиланням для встановлення пароля.`)
        }

        resetEmployeeForm()
        setShowEmployeeModal(false)
        // Інвалідуємо кеш користувачів
        queryClient.invalidateQueries({ queryKey: ['users'] })
        await loadData()
      }
    } catch (err: any) {
      setError(err.message || (editingEmployeeId ? 'Помилка оновлення працівника' : 'Помилка створення працівника'))
    }
  }

  const isFormValid = () => {
    // Для тім ліда перевіряємо наявність його відділів замість department_ids
    const hasDepartments = isTeamLead 
      ? teamLeadDepartments.length > 0
      : employeeForm.department_ids.length > 0
    
    return (
      employeeForm.surname.trim() !== '' &&
      employeeForm.name.trim() !== '' &&
      employeeForm.email.trim() !== '' &&
      employeeForm.role_id > 0 &&
      hasDepartments
    )
  }

  const handleViewEmployee = (employee: EmployeeWithRole) => {
    navigate(`/employees/${employee.id}`)
  }

  const handleEditEmployee = async (employee: EmployeeWithRole) => {
    try {
      // Завантажуємо повну інформацію про співробітника з відділами
      const employeeWithDepts = await getUserWithDepartments(employee.id)
      
      if (!employeeWithDepts) {
        setError('Не вдалося завантажити дані співробітника')
        return
      }

      // Заповнюємо форму даними співробітника
      setEmployeeForm({
        surname: employeeWithDepts.surname || '',
        name: employeeWithDepts.name || '',
        middle_name: employeeWithDepts.middle_name || '',
        email: employeeWithDepts.email || '',
        phone: employeeWithDepts.phone || '',
        role_id: employeeWithDepts.role_id || 0,
        department_ids: employeeWithDepts.departments?.map(d => d.id) || []
      })

      setEditingEmployeeId(employee.id)
      setShowEmployeeModal(true)
      setError(null)
      setSuccess(null)
    } catch (err: any) {
      console.error('Помилка при завантаженні співробітника для редагування:', err)
      setError('Не вдалося завантажити дані співробітника')
    }
  }

  const resetEmployeeForm = () => {
    setEmployeeForm({
      surname: '',
      name: '',
      middle_name: '',
      email: '',
      phone: '',
      role_id: 0,
      department_ids: []
    })
    setEditingEmployeeId(null)
  }

  const handleEditDepartmentName = (department: Department) => {
    setEditingDepartmentId(department.id)
    setEditingDepartmentName(department.department_name)
  }

  const handleSaveDepartmentName = async (departmentId: number) => {
    if (!editingDepartmentName.trim()) {
      setError('Назва відділу не може бути порожньою')
      return
    }

    setError(null)
    setSuccess(null)

    try {
      const success = await updateDepartment(departmentId, {
        department_name: editingDepartmentName.trim()
      })

      if (success) {
        setSuccess('Назву відділу успішно оновлено')
        setEditingDepartmentId(null)
        setEditingDepartmentName('')
        await loadData() // Перезавантажуємо дані
      } else {
        setError('Не вдалося оновити назву відділу')
      }
    } catch (err: any) {
      setError(err.message || 'Помилка оновлення назви відділу')
    }
  }

  const handleCancelEditDepartment = () => {
    setEditingDepartmentId(null)
    setEditingDepartmentName('')
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
        <div style={{ padding: '24px' }}>
          <SkeletonLoader type="table" rows={8} />
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h2>Співробітники</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          {!isTeamLead && user?.role_id !== 3 && (
            <>
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
                className="btn-primary" 
                onClick={() => {
                  setShowAllDepartmentsModal(true)
                  setError(null)
                  setSuccess(null)
                  handleCancelEditDepartment()
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="9" y1="3" x2="9" y2="21"></line>
                  <line x1="9" y1="9" x2="21" y2="9"></line>
                </svg>
                Всі відділи
              </button>
            </>
          )}
          <button 
            className={`btn-primary ${isTeamLead && teamLeadDepartments.length === 0 ? 'disabled' : !isTeamLead && departments.length === 0 ? 'disabled' : ''}`}
            onClick={() => {
              if (isTeamLead && teamLeadDepartments.length === 0) {
                setError('У вас немає відділу. Зверніться до керівника виробництва для призначення відділу.')
                return
              }
              if (!isTeamLead && departments.length === 0) {
                setError('Перед тим як створити Вашого першого співробітника створіть департамент')
                return
              }
              resetEmployeeForm()
              setShowEmployeeModal(true)
            }}
            disabled={(isTeamLead && teamLeadDepartments.length === 0) || (!isTeamLead && departments.length === 0)}
            title={isTeamLead && teamLeadDepartments.length === 0 ? 'У вас немає відділу. Зверніться до керівника виробництва для призначення відділу.' : !isTeamLead && departments.length === 0 ? 'Перед тим як створити Вашого першого співробітника створіть департамент' : ''}
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

      {loading || (!isTeamLead && !employeesReady) || (isTeamLead && (!groupMembersReady || !employeesWithoutGroupReady)) ? (
        <div className="table-container">
          <SkeletonLoader type="table" rows={5} />
        </div>
      ) : isTeamLead ? (
        <>
          {/* Секція для тім ліда: Мої працівники */}
          <div style={{ marginBottom: '32px' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '600', color: '#2d3748' }}>
              Мої працівники
            </h3>
            <div className="table-container">
              {groupMembers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  Немає працівників у вашій групі
                </div>
              ) : (
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
                    {groupMembers.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '40px' }}>
                          Немає працівників у вашій групі
                        </td>
                      </tr>
                    ) : (
                      groupMembers.map((employee) => (
                        <EmployeeRow 
                          key={employee.id} 
                          employee={employee} 
                          departments={departments}
                          getFullName={getFullName}
                          formatDate={formatDate}
                          onView={handleViewEmployee}
                          onEdit={handleEditEmployee}
                          onToggleStatus={handleToggleStatusClick}
                          currentUserId={user?.id}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Секція для тім ліда: Працівники без групи */}
          <div>
            <h3 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: '600', color: '#2d3748' }}>
              Працівники без групи
            </h3>
            <div className="table-container">
              {employeesWithoutGroup.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  Немає працівників без групи
                </div>
              ) : (
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
                    {employeesWithoutGroup.map((employee) => (
                      <EmployeeRow 
                        key={employee.id} 
                        employee={employee} 
                        departments={departments}
                        getFullName={getFullName}
                        formatDate={formatDate}
                        onView={handleViewEmployee}
                        onEdit={handleEditEmployee}
                        onToggleStatus={handleToggleStatusClick}
                        currentUserId={user?.id}
                        canEdit={false}
                        canToggleStatus={false}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="table-container">
          {employees.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              Немає співробітників
            </div>
          ) : employees.length > 50 ? (
            // Використовуємо віртуалізацію для великих списків (>50 записів)
            <div style={{ width: '100%' }}>
              {/* Заголовок таблиці */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '60px 1.5fr 1.5fr 1.2fr 1fr 1.5fr 1fr 1.2fr 120px',
                background: '#f7fafc', 
                fontWeight: '600',
                borderBottom: '2px solid #e2e8f0',
                position: 'sticky',
                top: 0,
                zIndex: 10
              }}>
                <div style={{ padding: '12px' }}>ID</div>
                <div style={{ padding: '12px' }}>ПІБ</div>
                <div style={{ padding: '12px' }}>Email</div>
                <div style={{ padding: '12px' }}>Телефон</div>
                <div style={{ padding: '12px' }}>Роль</div>
                <div style={{ padding: '12px' }}>Відділи</div>
                <div style={{ padding: '12px' }}>Статус</div>
                <div style={{ padding: '12px' }}>Дата реєстрації</div>
                <div style={{ padding: '12px' }}>Дії</div>
              </div>
              {/* Віртуалізоване тіло таблиці */}
              <List
                height={Math.min(600, employees.length * 60)} // Максимальна висота 600px або висота всіх рядків
                itemCount={employees.length}
                itemSize={60} // Висота одного рядка
                width="100%"
              >
                {({ index, style }: { index: number; style: React.CSSProperties }) => (
                  <div style={style}>
                    <VirtualizedEmployeeRow
                      employee={employees[index]}
                      departments={departments}
                      getFullName={getFullName}
                      formatDate={formatDate}
                      onView={handleViewEmployee}
                      onEdit={handleEditEmployee}
                      onToggleStatus={handleToggleStatusClick}
                      currentUserId={user?.id}
                    />
                  </div>
                )}
              </List>
            </div>
          ) : (
            // Для малих списків використовуємо звичайну таблицю
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
                {employees.map((employee) => (
                  <EmployeeRow 
                    key={employee.id} 
                    employee={employee} 
                    departments={departments}
                    getFullName={getFullName}
                    formatDate={formatDate}
                    onView={handleViewEmployee}
                    onEdit={handleEditEmployee}
                    onToggleStatus={handleToggleStatusClick}
                    currentUserId={user?.id}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Пагінація співробітників (тільки для керівника виробництва) */}
      {!isTeamLead && totalUsers > USERS_PER_PAGE && (
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
              if (usersCurrentPage > 0) {
                setUsersCurrentPage(usersCurrentPage - 1)
              }
            }}
            disabled={usersCurrentPage === 0}
            style={{
              padding: '8px 16px',
              background: usersCurrentPage === 0 ? '#f7fafc' : '#4299e1',
              color: usersCurrentPage === 0 ? '#a0aec0' : '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: usersCurrentPage === 0 ? 'not-allowed' : 'pointer',
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
            Сторінка {usersCurrentPage + 1} з {Math.ceil(totalUsers / USERS_PER_PAGE)}
            <br />
            <small style={{ color: '#718096' }}>
              Показано {usersCurrentPage * USERS_PER_PAGE + 1}-{Math.min((usersCurrentPage + 1) * USERS_PER_PAGE, totalUsers)} з {totalUsers} співробітників
            </small>
          </span>
          
          <button
            onClick={() => {
              const totalPages = Math.ceil(totalUsers / USERS_PER_PAGE)
              if (usersCurrentPage < totalPages - 1) {
                setUsersCurrentPage(usersCurrentPage + 1)
              }
            }}
            disabled={usersCurrentPage >= Math.ceil(totalUsers / USERS_PER_PAGE) - 1}
            style={{
              padding: '8px 16px',
              background: usersCurrentPage >= Math.ceil(totalUsers / USERS_PER_PAGE) - 1 ? '#f7fafc' : '#4299e1',
              color: usersCurrentPage >= Math.ceil(totalUsers / USERS_PER_PAGE) - 1 ? '#a0aec0' : '#ffffff',
              border: 'none',
              borderRadius: '6px',
              cursor: usersCurrentPage >= Math.ceil(totalUsers / USERS_PER_PAGE) - 1 ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Наступна →
          </button>
        </div>
      )}

      {showDepartmentModal && !isTeamLead && user?.role_id !== 3 && (
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
                    <span className={`status-badge ${getStatusBadgeClass(selectedEmployee.status)}`}>
                      {getStatusText(selectedEmployee.status)}
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
              <h3>{editingEmployeeId ? 'Редагувати працівника' : 'Створити працівника'}</h3>
              <button className="modal-close" onClick={() => {
                setShowEmployeeModal(false)
                resetEmployeeForm()
              }}>
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
              {!isTeamLead ? (
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
              ) : (
                <div className="form-group">
                  <label>Відділ</label>
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
                          Працівник автоматично буде призначений до вашого відділу:
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
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => {
                  setShowEmployeeModal(false)
                  resetEmployeeForm()
                }}>
                  Скасувати
                </button>
                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={!isFormValid()}
                >
                  {editingEmployeeId ? 'Зберегти зміни' : 'Створити'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAllDepartmentsModal && !isTeamLead && user?.role_id !== 3 && (
        <div className="modal-overlay" onClick={() => {
          setShowAllDepartmentsModal(false)
          handleCancelEditDepartment()
        }}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Всі відділи</h3>
              <button className="modal-close" onClick={() => {
                setShowAllDepartmentsModal(false)
                handleCancelEditDepartment()
              }}>
                ×
              </button>
            </div>
            <div style={{ padding: '24px', maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Форма створення нового відділу */}
              <div style={{ 
                marginBottom: '24px', 
                padding: '16px', 
                border: '1px solid #e2e8f0', 
                borderRadius: '8px',
                background: '#f7fafc'
              }}>
                <h4 style={{ marginBottom: '12px', fontSize: '16px', fontWeight: '600', color: '#2d3748' }}>
                  Створити новий відділ
                </h4>
                <form onSubmit={handleCreateDepartment} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#4a5568' }}>
                      Назва відділу *
                    </label>
                    <input
                      type="text"
                      value={departmentForm.department_name}
                      onChange={(e) => setDepartmentForm({ department_name: e.target.value })}
                      placeholder="Введіть назву відділу"
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

              {/* Список відділів */}
              {departments.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '40px', color: '#718096' }}>
                  Немає відділів. Створіть перший відділ вище.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {departments.map((department) => (
                    <div
                      key={department.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        background: editingDepartmentId === department.id ? '#f7fafc' : '#ffffff',
                        transition: 'all 0.2s'
                      }}
                    >
                      {editingDepartmentId === department.id ? (
                        <>
                          <input
                            type="text"
                            value={editingDepartmentName}
                            onChange={(e) => setEditingDepartmentName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveDepartmentName(department.id)
                              } else if (e.key === 'Escape') {
                                handleCancelEditDepartment()
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
                            onClick={() => handleSaveDepartmentName(department.id)}
                            style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}
                          >
                            Зберегти
                          </button>
                          <button
                            className="btn-secondary"
                            onClick={handleCancelEditDepartment}
                            style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}
                          >
                            Скасувати
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: '16px', fontWeight: '500', color: '#2d3748' }}>
                            {department.department_name}
                          </span>
                          <button
                            className="btn-action btn-edit"
                            onClick={() => handleEditDepartmentName(department)}
                            title="Змінити назву відділу"
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
                  setShowAllDepartmentsModal(false)
                  handleCancelEditDepartment()
                }}
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Плеер задачі - відображається при активній задачі */}
      <TaskPlayer />
    </div>
  )
}

// Компонент для віртуалізованого рядка співробітника
function VirtualizedEmployeeRow({
  employee,
  departments,
  getFullName,
  formatDate,
  onView,
  onEdit,
  onToggleStatus,
  currentUserId
}: {
  employee: EmployeeWithRole
  departments: Department[]
  getFullName: (user: User) => string
  formatDate: (date: string) => string
  onView: (employee: EmployeeWithRole) => void
  onEdit: (employee: EmployeeWithRole) => void
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
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns: '60px 1.5fr 1.5fr 1.2fr 1fr 1.5fr 1fr 1.2fr 120px',
      borderBottom: '1px solid #e2e8f0',
      background: '#ffffff',
      alignItems: 'center'
    }}>
      <div style={{ padding: '12px' }}>{employee.id}</div>
      <div style={{ padding: '12px' }}>{getFullName(employee)}</div>
      <div style={{ padding: '12px' }}>{employee.email || '-'}</div>
      <div style={{ padding: '12px' }}>{employee.phone || '-'}</div>
      <div style={{ padding: '12px' }}>
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
      </div>
      <div style={{ padding: '12px' }}>
        {employeeDepartments.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {employeeDepartments.map((dept: Department) => (
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
        <span className={`status-badge ${getStatusBadgeClass(employee.status)}`}>
          {getStatusText(employee.status)}
        </span>
      </div>
      <div style={{ padding: '12px' }}>{formatDate(employee.date_added)}</div>
      <div style={{ padding: '12px' }}>
        <div className="action-buttons">
          <button
            className="btn-action btn-edit"
            onClick={() => onEdit(employee)}
            title="Редагувати"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
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
      </div>
    </div>
  )
}

function EmployeeRow({ 
  employee, 
  departments, 
  getFullName, 
  formatDate,
  onView,
  onEdit,
  onToggleStatus,
  currentUserId,
  canEdit = true,
  canToggleStatus = true
}: { 
  employee: EmployeeWithRole
  departments: Department[]
  getFullName: (user: User) => string
  formatDate: (date: string) => string
  onView: (employee: EmployeeWithRole) => void
  onEdit: (employee: EmployeeWithRole) => void
  onToggleStatus: (employee: EmployeeWithRole) => void
  currentUserId?: number
  canEdit?: boolean
  canToggleStatus?: boolean
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
        <span className={`status-badge ${getStatusBadgeClass(employee.status)}`}>
          {getStatusText(employee.status)}
        </span>
      </td>
      <td>{formatDate(employee.date_added)}</td>
      <td>
        <div className="action-buttons">
          {canEdit && (
            <button
              className="btn-action btn-edit"
              onClick={() => onEdit(employee)}
              title="Редагувати"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
          )}
          {canToggleStatus && (
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
          )}
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

