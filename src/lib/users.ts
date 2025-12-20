import { supabase, queuedSupabaseQuery } from './supabase'
import type { User, Role, Project, Department, UserWithDepartments } from '../types/database'

export async function getUserById(id: number): Promise<User | null> {
  const { data, error } = await queuedSupabaseQuery<User>(
    async () => supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single(),
    `getUserById_${id}`
  )

  if (error) {
    console.error('Error fetching user:', error)
    return null
  }

  return data
}

export async function createUser(userData: {
  auth_user_id?: string
  project_id?: number
  role_id: number
  group_id?: number | null
  surname?: string
  name?: string
  middle_name?: string
  phone?: string
  status?: string
  email?: string
}): Promise<User | null> {
  const { data, error } = await queuedSupabaseQuery<User>(
    async () => supabase
      .from('users')
      .insert(userData)
      .select()
      .single(),
    'createUser'
  )

  if (error) {
    console.error('Error creating user:', error)
    return null
  }

  return data
}

export async function getAllRoles(): Promise<Role[]> {
  const { data, error } = await queuedSupabaseQuery<Role[]>(
    async () => supabase
      .from('roles')
      .select('*')
      .order('role_name'),
    'getAllRoles'
  )

  if (error) {
    console.error('Error fetching roles:', error)
    return []
  }

  return data || []
}

export async function getRoleById(id: number): Promise<Role | null> {
  const { data, error } = await queuedSupabaseQuery<Role>(
    async () => supabase
      .from('roles')
      .select('*')
      .eq('id', id)
      .single(),
    `getRoleById_${id}`
  )

  if (error) {
    console.error('Error fetching role:', error)
    return null
  }

  return data
}

export async function getUserWithRole(userId: number): Promise<(User & { role: Role }) | null> {
  const { data, error } = await queuedSupabaseQuery<any>(
    async () => supabase
      .from('users')
      .select(`
        *,
        role:roles(id, role_name)
      `)
      .eq('id', userId)
      .single(),
    `getUserWithRole_${userId}`
  )

  if (error) {
    console.error('Error fetching user with role:', error)
    return null
  }

  if (!data || !data.role) {
    return null
  }

  return {
    ...data,
    role: Array.isArray(data.role) ? data.role[0] : data.role
  }
}

export async function getAllProjects(): Promise<(Project & { user?: User })[]> {
  const { data, error } = await queuedSupabaseQuery<any[]>(
    async () => supabase
      .from('projects')
      .select(`
        *,
        users(id, surname, name, middle_name, email)
      `)
      .order('date_added', { ascending: false }),
    'getAllProjects'
  )

  if (error) {
    console.error('Error fetching projects:', error)
    return []
  }

  // Обробляємо дані - беремо першого користувача з проекту
  return (data || []).map((project: any) => ({
    ...project,
    user: Array.isArray(project.users) && project.users.length > 0 ? project.users[0] : undefined,
  }))
}

export async function getProjectById(id: number): Promise<Project | null> {
  const { data, error } = await queuedSupabaseQuery<Project>(
    async () => supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single(),
    `getProjectById_${id}`
  )

  if (error) {
    console.error('Error fetching project:', error)
    return null
  }

  return data
}

export async function createProject(projectData: {
  name: string
  status?: string
  surname?: string
  middle_name?: string
  phone?: string
  company_name?: string
  company_code?: string
  email?: string
}): Promise<Project | null> {
  const { data, error } = await queuedSupabaseQuery<Project>(
    async () => supabase
      .from('projects')
      .insert(projectData)
      .select()
      .single(),
    'createProject'
  )

  if (error) {
    console.error('Error creating project:', error)
    return null
  }

  return data
}

export async function getUsersByProject(projectId: number, limit?: number, offset?: number): Promise<User[]> {
  const { data, error } = await queuedSupabaseQuery<User[]>(async () => {
    let query = supabase
      .from('users')
      .select('*')
      .eq('project_id', projectId)
      .order('date_added', { ascending: false })

    if (limit !== undefined) {
      query = query.limit(limit)
    }
    if (offset !== undefined) {
      query = query.range(offset, offset + (limit || 1000) - 1)
    }

    return query
  }, `getUsersByProject_${projectId}_${limit}_${offset}`)

  if (error) {
    console.error('Error fetching users by project:', error)
    return []
  }

  return data || []
}

/**
 * Отримує загальну кількість користувачів проекту
 */
export async function getUsersByProjectCount(projectId: number): Promise<number> {
  const result = await queuedSupabaseQuery<any>(
    async () => supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId),
    `getUsersByProjectCount_${projectId}`
  )
  const { count, error } = result

  if (error) {
    console.error('Error fetching users count by project:', error)
    return 0
  }

  return count || 0
}

export async function updateProjectStatus(projectId: number, status: string): Promise<boolean> {
  const { error: projectError } = await queuedSupabaseQuery<any>(
    async () => supabase
      .from('projects')
      .update({ status })
      .eq('id', projectId),
    `updateProjectStatus_${projectId}`
  )

  if (projectError) {
    console.error('Error updating project status:', projectError)
    return false
  }

  // Якщо проект деактивований, автоматично деактивуємо всіх користувачів цього проекту
  if (status === 'Деактивований') {
    const { error: usersError } = await queuedSupabaseQuery<any>(
      async () => supabase
        .from('users')
        .update({ status: 'inactive' })
        .eq('project_id', projectId)
        .neq('status', 'inactive'),
      `deactivateProjectUsers_${projectId}`
    )

    if (usersError) {
      console.error('Error deactivating project users:', usersError)
      return false
    }
  }

  return true
}

export async function updateUserStatus(userId: number, status: string): Promise<boolean> {
  const { error } = await queuedSupabaseQuery<any>(
    async () => supabase
      .from('users')
      .update({ status })
      .eq('id', userId),
    `updateUserStatus_${userId}`
  )

  if (error) {
    console.error('Error updating user status:', error)
    return false
  }

  return true
}

export async function updateUser(userId: number, userData: {
  surname?: string
  name?: string
  middle_name?: string
  phone?: string
  email?: string
  role_id?: number
  status?: string
}): Promise<boolean> {
  const { error } = await queuedSupabaseQuery<any>(
    async () => supabase
      .from('users')
      .update(userData)
      .eq('id', userId),
    `updateUser_${userId}`
  )

  if (error) {
    console.error('Error updating user:', error)
    return false
  }

  return true
}

// ========== DEPARTMENTS FUNCTIONS ==========

export async function getAllDepartments(): Promise<Department[]> {
  const { data, error } = await queuedSupabaseQuery<Department[]>(
    async () => supabase
      .from('departments')
      .select('*')
      .order('department_name'),
    'getAllDepartments'
  )

  if (error) {
    console.error('Error fetching departments:', error)
    return []
  }

  return data || []
}

export async function getDepartmentsByProject(projectId: number): Promise<Department[]> {
  const { data, error } = await queuedSupabaseQuery<Department[]>(
    async () => supabase
      .from('departments')
      .select('*')
      .eq('project_id', projectId)
      .order('department_name'),
    `getDepartmentsByProject_${projectId}`
  )

  if (error) {
    console.error('Error fetching departments by project:', error)
    return []
  }

  return data || []
}

export async function getDepartmentById(id: number): Promise<Department | null> {
  const { data, error } = await queuedSupabaseQuery<Department>(
    async () => supabase
      .from('departments')
      .select('*')
      .eq('id', id)
      .single(),
    `getDepartmentById_${id}`
  )

  if (error) {
    console.error('Error fetching department:', error)
    return null
  }

  return data
}

export async function createDepartment(departmentData: {
  department_name: string
  project_id: number
}): Promise<Department | null> {
  const { data, error } = await queuedSupabaseQuery<Department>(
    async () => supabase
      .from('departments')
      .insert(departmentData)
      .select()
      .single(),
    'createDepartment'
  )

  if (error) {
    console.error('Error creating department:', error)
    return null
  }

  return data
}

export async function updateDepartment(departmentId: number, departmentData: {
  department_name?: string
  project_id?: number
}): Promise<boolean> {
  const { error } = await queuedSupabaseQuery<any>(
    async () => supabase
      .from('departments')
      .update(departmentData)
      .eq('id', departmentId),
    `updateDepartment_${departmentId}`
  )

  if (error) {
    console.error('Error updating department:', error)
    return false
  }

  return true
}

export async function deleteDepartment(departmentId: number): Promise<boolean> {
  const { error } = await queuedSupabaseQuery<any>(
    async () => supabase
      .from('departments')
      .delete()
      .eq('id', departmentId),
    `deleteDepartment_${departmentId}`
  )

  if (error) {
    console.error('Error deleting department:', error)
    return false
  }

  return true
}

// ========== USER DEPARTMENTS FUNCTIONS ==========

export async function getUserDepartments(userId: number): Promise<Department[]> {
  const { data, error } = await queuedSupabaseQuery<any[]>(
    async () => supabase
      .from('user_departments')
      .select(`
        department_id,
        departments (id, department_name, project_id)
      `)
      .eq('user_id', userId),
    `getUserDepartments_${userId}`
  )

  if (error) {
    console.error('Error fetching user departments:', error)
    return []
  }

  return (data || []).map((item: any) => 
    Array.isArray(item.departments) ? item.departments[0] : item.departments
  ).filter(Boolean)
}

export async function getUserWithDepartments(userId: number): Promise<UserWithDepartments | null> {
  const user = await getUserById(userId)
  if (!user) {
    return null
  }

  const departments = await getUserDepartments(userId)
  return {
    ...user,
    departments
  }
}

export async function setUserDepartments(userId: number, departmentIds: number[]): Promise<boolean> {
  // Спочатку видаляємо всі існуючі зв'язки
  const { error: deleteError } = await queuedSupabaseQuery<any>(
    async () => supabase
      .from('user_departments')
      .delete()
      .eq('user_id', userId),
    `deleteUserDepartments_${userId}`
  )

  if (deleteError) {
    console.error('Error deleting user departments:', deleteError)
    return false
  }

  // Якщо немає департаментів для додавання, просто повертаємо успіх
  if (departmentIds.length === 0) {
    return true
  }

  // Додаємо нові зв'язки
  const userDepartments = departmentIds.map(departmentId => ({
    user_id: userId,
    department_id: departmentId
  }))

  const { error: insertError } = await queuedSupabaseQuery<any>(
    async () => supabase
      .from('user_departments')
      .insert(userDepartments),
    `setUserDepartments_${userId}_${departmentIds.length}`
  )

  if (insertError) {
    console.error('Error setting user departments:', insertError)
    return false
  }

  return true
}

export async function addUserDepartment(userId: number, departmentId: number): Promise<boolean> {
  const { error } = await queuedSupabaseQuery<any>(
    async () => supabase
      .from('user_departments')
      .insert({
        user_id: userId,
        department_id: departmentId
      }),
    `addUserDepartment_${userId}_${departmentId}`
  )

  if (error) {
    // Якщо зв'язок вже існує, це не помилка
    if (error.code === '23505') {
      return true
    }
    console.error('Error adding user department:', error)
    return false
  }

  return true
}

export async function removeUserDepartment(userId: number, departmentId: number): Promise<boolean> {
  const { error } = await queuedSupabaseQuery<any>(
    async () => supabase
      .from('user_departments')
      .delete()
      .eq('user_id', userId)
      .eq('department_id', departmentId),
    `removeUserDepartment_${userId}_${departmentId}`
  )

  if (error) {
    console.error('Error removing user department:', error)
    return false
  }

  return true
}

export async function getUsersByDepartment(departmentId: number): Promise<User[]> {
  const { data, error } = await queuedSupabaseQuery<any[]>(
    async () => supabase
      .from('user_departments')
      .select(`
        user_id,
        users (id, surname, name, middle_name, email, phone, status, role_id, group_id, project_id, date_added)
      `)
      .eq('department_id', departmentId),
    `getUsersByDepartment_${departmentId}`
  )

  if (error) {
    console.error('Error fetching users by department:', error)
    return []
  }

  return (data || []).map((item: any) => 
    Array.isArray(item.users) ? item.users[0] : item.users
  ).filter(Boolean)
}

// ========== TEAM LEAD GROUP FUNCTIONS ==========

/**
 * Отримує всіх співробітників, які належать до групи тім ліда
 * @param teamLeadId - ID тім ліда
 * @returns Масив співробітників групи
 */
export async function getTeamLeadGroupMembers(teamLeadId: number): Promise<User[]> {
  const { data, error } = await queuedSupabaseQuery<User[]>(
    async () => supabase
      .from('users')
      .select('*')
      .eq('group_id', teamLeadId)
      .order('surname')
      .order('name'),
    `getTeamLeadGroupMembers_${teamLeadId}`
  )

  if (error) {
    console.error('Error fetching team lead group members:', error)
    return []
  }

  return data || []
}

/**
 * Отримує всіх співробітників без групи (які не є тім лідами)
 * @param projectId - ID проекту
 * @param departmentIds - Опціональний масив ID відділів для фільтрації
 * @returns Масив співробітників без групи
 */
export async function getUsersWithoutGroup(projectId: number, departmentIds?: number[]): Promise<User[]> {
  // Спочатку отримуємо ID ролі "Тім лід"
  const { data: teamLeadRole, error: roleError } = await queuedSupabaseQuery<any>(
    async () => supabase
      .from('roles')
      .select('id')
      .eq('role_name', 'Тім лід')
      .single(),
    'getTeamLeadRole'
  )

  if (roleError || !teamLeadRole) {
    console.error('Error fetching team lead role:', roleError)
    return []
  }

  // Якщо вказані відділи, отримуємо користувачів через user_departments
  if (departmentIds && departmentIds.length > 0) {
    // Отримуємо всіх користувачів, які належать до вказаних відділів
    // Оптимізовано: вибираємо тільки id для фільтрації
    const { data: usersByDept, error: deptError } = await queuedSupabaseQuery<any[]>(
      async () => supabase
        .from('user_departments')
        .select(`
          user_id,
          users (id)
        `)
        .in('department_id', departmentIds),
      `getUsersByDepartments_${departmentIds.length}`
    )

    if (deptError) {
      console.error('Error fetching users by departments:', deptError)
      return []
    }

    // Отримуємо ID ролі "Тім лід" для фільтрації
    const userIds = (usersByDept || [])
      .map((item: any) => {
        const user = Array.isArray(item.users) ? item.users[0] : item.users
        return user?.id
      })
      .filter(Boolean)

    if (userIds.length === 0) {
      return []
    }

    // Отримуємо користувачів, які:
    // 1. Не є тім лідами (role_id != teamLeadRole.id)
    // 2. Не мають group_id (group_id IS NULL)
    // 3. Належать до вказаних відділів
    const { data, error } = await queuedSupabaseQuery<User[]>(
      async () => supabase
        .from('users')
        .select('*')
        .in('id', userIds)
        .eq('project_id', projectId)
        .neq('role_id', teamLeadRole.id)
        .is('group_id', null)
        .order('surname')
        .order('name'),
      `getUsersWithoutGroup_withDepts_${projectId}_${departmentIds.length}`
    )

    if (error) {
      console.error('Error fetching users without group:', error)
      return []
    }

    return data || []
  }

  // Якщо відділи не вказані, повертаємо всіх без групи (стара логіка)
  const { data, error } = await queuedSupabaseQuery<User[]>(
    async () => supabase
      .from('users')
      .select('*')
      .eq('project_id', projectId)
      .neq('role_id', teamLeadRole.id)
      .is('group_id', null)
      .order('surname')
      .order('name'),
    `getUsersWithoutGroup_${projectId}`
  )

  if (error) {
    console.error('Error fetching users without group:', error)
    return []
  }

  return data || []
}

/**
 * Отримує всіх співробітників для тім ліда:
 * - Своїх працівників (з group_id = teamLeadId)
 * - Працівників без групи (group_id IS NULL і не є тім лідами), які належать до відділів тім ліда
 * @param teamLeadId - ID тім ліда
 * @param projectId - ID проекту
 * @param departmentIds - Масив ID відділів тім ліда
 * @returns Об'єкт з двома масивами: groupMembers та withoutGroup
 */
export async function getTeamLeadEmployees(teamLeadId: number, projectId: number, departmentIds?: number[]): Promise<{
  groupMembers: User[]
  withoutGroup: User[]
}> {
  const [groupMembers, withoutGroup] = await Promise.all([
    getTeamLeadGroupMembers(teamLeadId),
    getUsersWithoutGroup(projectId, departmentIds)
  ])

  return {
    groupMembers,
    withoutGroup
  }
}
