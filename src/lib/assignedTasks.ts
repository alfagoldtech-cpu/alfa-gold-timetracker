import { supabase, queuedSupabaseQuery } from './supabase'
import type { Task, User, Client } from '../types/database'

export interface AssignedTask {
  id: number
  task_id: number
  client_id: number
  department_id?: number | null
  group_id?: number | null
  executor_id?: number | null
  is_active: boolean
  task_status?: string | null
  completion_date?: string | null
  completion_time_minutes?: number | null
  created_at: string
  updated_at: string
}

export interface AssignedTaskWithDetails extends AssignedTask {
  task?: Task
  executor?: User
  client?: Pick<Client, 'id' | 'legal_name' | 'group_company_id'>
}

/**
 * Нормалізує relation з Supabase (може бути масивом або об'єктом)
 */
function normalizeRelation<T>(relation: T | T[] | null | undefined): T | null {
  if (!relation) return null
  return Array.isArray(relation) ? relation[0] : relation
}

/**
 * Отримує кількість активних призначених задач для клієнта
 */
export async function getActiveAssignedTasksCount(clientId: number): Promise<number> {
  const result = await queuedSupabaseQuery(
    () => supabase
      .from('assigned_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('is_active', true),
    `getActiveAssignedTasksCount_${clientId}`
  )
  const { count, error } = result

  if (error) {
    console.error('Error fetching assigned tasks count:', error)
    return 0
  }

  return count || 0
}

/**
 * Отримує кількість активних призначених задач для кількох клієнтів одночасно
 */
export async function getActiveAssignedTasksCountForClients(clientIds: number[]): Promise<Map<number, number>> {
  if (clientIds.length === 0) {
    return new Map()
  }

  const { data, error } = await queuedSupabaseQuery(
    () => supabase
      .from('assigned_tasks')
      .select('client_id')
      .in('client_id', clientIds)
      .eq('is_active', true),
    `getActiveAssignedTasksCountForClients_${clientIds.length}`
  )

  if (error) {
    console.error('Error fetching assigned tasks count for clients:', error)
    return new Map()
  }

  // Підраховуємо кількість задач для кожного клієнта
  const counts = new Map<number, number>()
  
  // Ініціалізуємо всі клієнти з нульовою кількістю
  clientIds.forEach(id => counts.set(id, 0))
  
  // Підраховуємо задачі
  data?.forEach(task => {
    const currentCount = counts.get(task.client_id) || 0
    counts.set(task.client_id, currentCount + 1)
  })

  return counts
}

/**
 * Отримує всі призначені задачі для клієнта з деталями
 */
export async function getAssignedTasksByClient(clientId: number): Promise<AssignedTaskWithDetails[]> {
  const { data, error } = await queuedSupabaseQuery(
    () => supabase
      .from('assigned_tasks')
      .select(`
        *,
        task:tasks(id, task_name, planned_date, task_type, description, category_id),
        executor:users!assigned_tasks_executor_id_fkey(id, surname, name, middle_name, email)
      `)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    `getAssignedTasksByClient_${clientId}`
  )

  if (error) {
    console.error('Error fetching assigned tasks:', error)
    return []
  }

  return (data || []).map(item => ({
    ...item,
    task: normalizeRelation(item.task),
    executor: normalizeRelation(item.executor)
  }))
}

/**
 * Отримує задачі співробітника (виконавця) з фільтрацією по group_id тім ліда
 */
export async function getAssignedTasksByExecutorAndGroup(executorId: number, teamLeadGroupId: number): Promise<AssignedTaskWithDetails[]> {
  const { data, error } = await queuedSupabaseQuery(
    () => supabase
      .from('assigned_tasks')
      .select(`
        *,
        task:tasks(id, task_name, planned_date, task_type, description, category_id),
        executor:users!assigned_tasks_executor_id_fkey(id, surname, name, middle_name, email),
        client:clients(id, legal_name, group_company_id)
      `)
      .eq('executor_id', executorId)
      .eq('group_id', teamLeadGroupId)
      .order('created_at', { ascending: false }),
    `getAssignedTasksByExecutorAndGroup_${executorId}_${teamLeadGroupId}`
  )

  if (error) {
    console.error('Error fetching assigned tasks by executor and group:', error)
    return []
  }

  return (data || []).map(item => ({
    ...item,
    task: normalizeRelation(item.task),
    executor: normalizeRelation(item.executor),
    client: normalizeRelation(item.client)
  }))
}

/**
 * Отримує задачі клієнта з фільтрацією по group_id тім ліда
 */
export async function getAssignedTasksByClientAndGroup(clientId: number, teamLeadGroupId: number): Promise<AssignedTaskWithDetails[]> {
  const { data, error } = await queuedSupabaseQuery(
    () => supabase
      .from('assigned_tasks')
      .select(`
        *,
        task:tasks(id, task_name, planned_date, task_type, description, category_id),
        executor:users!assigned_tasks_executor_id_fkey(id, surname, name, middle_name, email),
        client:clients(id, legal_name, group_company_id)
      `)
      .eq('client_id', clientId)
      .eq('group_id', teamLeadGroupId)
      .order('created_at', { ascending: false }),
    `getAssignedTasksByClientAndGroup_${clientId}_${teamLeadGroupId}`
  )

  if (error) {
    console.error('Error fetching assigned tasks by client and group:', error)
    return []
  }

  return (data || []).map(item => ({
    ...item,
    task: normalizeRelation(item.task),
    executor: normalizeRelation(item.executor),
    client: normalizeRelation(item.client)
  }))
}

/**
 * Створює призначену задачу
 */
export async function createAssignedTask(taskData: {
  task_id: number
  client_id: number
  department_id?: number | null
  group_id?: number | null
  executor_id?: number | null
  is_active?: boolean
}): Promise<AssignedTask | null> {
  let groupId = taskData.group_id

  // Якщо group_id вже встановлено, залишаємо його (навіть якщо немає executor_id)
  // Це важливо для тім ліда, який створює задачі - group_id має бути завжди
  if (!groupId && taskData.executor_id) {
    // Якщо group_id не встановлено, але є executor_id, беремо group_id з виконавця
    const { data: executor, error: executorError } = await queuedSupabaseQuery(
      () => supabase
        .from('users')
        .select('group_id')
        .eq('id', taskData.executor_id)
        .single(),
      `getExecutorGroupId_${taskData.executor_id}`
    )

    if (executorError) {
      console.error('Error fetching executor for group_id:', executorError)
    } else if (executor) {
      groupId = executor.group_id
      if (groupId) {
      }
    }
  }
  // Якщо group_id не встановлено і немає executor_id, залишаємо null
  // (це може бути для старих записів або інших випадків)

  const { data, error } = await queuedSupabaseQuery(
    () => supabase
      .from('assigned_tasks')
      .insert({
        ...taskData,
        group_id: groupId,
        is_active: taskData.is_active !== undefined ? taskData.is_active : true
      })
      .select()
      .single(),
    'createAssignedTask'
  )

  if (error) {
    console.error('Error creating assigned task:', error)
    return null
  }

  return data
}

/**
 * Створює кілька призначених задач одночасно
 * Якщо group_id не встановлено, але є executor_id, беремо group_id з виконавця
 */
export async function createMultipleAssignedTasks(tasks: Array<{
  task_id: number
  client_id: number
  department_id?: number | null
  group_id?: number | null
  executor_id?: number | null
  is_active?: boolean
}>): Promise<AssignedTask[]> {
  if (tasks.length === 0) {
    return []
  }

  // Отримуємо унікальні executor_id, для яких потрібно отримати group_id
  const executorIdsToFetch = new Set<number>()
  tasks.forEach(task => {
    if (!task.group_id && task.executor_id) {
      executorIdsToFetch.add(task.executor_id)
    }
  })

  // Завантажуємо group_id з виконавців, якщо потрібно
  const executorGroupMap = new Map<number, number | null>()
  if (executorIdsToFetch.size > 0) {
    const { data: executors, error: executorsError } = await queuedSupabaseQuery(
      () => supabase
        .from('users')
        .select('id, group_id')
        .in('id', Array.from(executorIdsToFetch)),
      `getExecutorsGroupIds_${executorIdsToFetch.size}`
    )

    if (executorsError) {
      console.error('Error fetching executors for group_id:', executorsError)
    } else {
      executors?.forEach(executor => {
        executorGroupMap.set(executor.id, executor.group_id)
      })
    }
  }

  // Підготовлюємо задачі для вставки
  const tasksToInsert = tasks.map(task => {
    let groupId = task.group_id
    
    // Якщо group_id вже встановлено, залишаємо його (навіть якщо немає executor_id)
    // Це важливо для тім ліда, який створює задачі - group_id має бути завжди
    if (groupId) {
      // group_id вже встановлений, залишаємо як є
    } else if (task.executor_id) {
      // Якщо group_id не встановлено, але є executor_id, беремо group_id з виконавця
      groupId = executorGroupMap.get(task.executor_id) || null
      if (groupId) {
      }
    }
    // Якщо group_id не встановлено і немає executor_id, залишаємо null
    // (це може бути для старих записів або інших випадків)

    return {
      ...task,
      group_id: groupId,
      is_active: task.is_active !== undefined ? task.is_active : true
    }
  })

  if (tasksToInsert.length === 0) {
    return []
  }

  const { data, error } = await queuedSupabaseQuery(
    () => supabase
      .from('assigned_tasks')
      .insert(tasksToInsert)
      .select(),
    `createMultipleAssignedTasks_${tasksToInsert.length}`
  )

  if (error) {
    console.error('Error creating assigned tasks:', error)
    
    // Якщо помилка унікальності, намагаємося вставити задачі по одній, щоб визначити, які саме не вдалося вставити
    if (error.code === '23505') { // Unique violation
      const successfullyCreated: AssignedTask[] = []
      
      for (const task of tasksToInsert) {
        const { data: singleData, error: singleError } = await queuedSupabaseQuery(
          () => supabase
            .from('assigned_tasks')
            .insert(task)
            .select()
            .single(),
          `createAssignedTask_single_${task.task_id}_${task.client_id}`
        )
        
        if (singleError) {
          if (singleError.code === '23505') {
            console.warn(`Task ${task.task_id} already assigned to client ${task.client_id}. Skipping.`)
          } else {
            console.error(`Error inserting task ${task.task_id}:`, singleError)
          }
        } else if (singleData) {
          successfullyCreated.push(singleData)
        }
      }
      
      return successfullyCreated
    }
    
    return []
  }

  return data || []
}

/**
 * Оновлює призначену задачу
 */
export async function updateAssignedTask(
  id: number,
  updates: Partial<Omit<AssignedTask, 'id' | 'created_at' | 'updated_at'>>
): Promise<boolean> {
  const { error } = await queuedSupabaseQuery(
    () => supabase
      .from('assigned_tasks')
      .update(updates)
      .eq('id', id),
    `updateAssignedTask_${id}`
  )

  if (error) {
    console.error('Error updating assigned task:', error)
    return false
  }

  return true
}

/**
 * Видаляє призначену задачу
 */
export async function deleteAssignedTask(id: number): Promise<boolean> {
  const { error } = await queuedSupabaseQuery(
    () => supabase
      .from('assigned_tasks')
      .delete()
      .eq('id', id),
    `deleteAssignedTask_${id}`
  )

  if (error) {
    console.error('Error deleting assigned task:', error)
    return false
  }

  return true
}

/**
 * Отримує всі призначені задачі для виконавця (поточного користувача)
 */
/**
 * Отримує призначені задачі для виконавця з опціональною фільтрацією по даті
 * @param executorId - ID виконавця
 * @param startDate - Початкова дата для фільтрації (опціонально)
 * @param endDate - Кінцева дата для фільтрації (опціонально)
 */
export async function getAssignedTasksForExecutor(
  executorId: number,
  startDate?: Date,
  endDate?: Date
): Promise<AssignedTaskWithDetails[]> {
  const { data, error } = await queuedSupabaseQuery(async () => {
    let query = supabase
      .from('assigned_tasks')
      .select(`
        *,
        task:tasks(id, task_name, planned_date, task_type, description, category_id),
        executor:users!assigned_tasks_executor_id_fkey(id, surname, name, middle_name, email),
        client:clients(id, legal_name, group_company_id)
      `)
      .eq('executor_id', executorId)

    // Додаємо фільтрацію по даті, якщо вказано
    // В Supabase для фільтрації по зв'язаних таблицях використовуємо синтаксис через вкладені поля
    // Але оскільки це може не працювати, завантажуємо дані і фільтруємо на клієнті
    // Це все одно краще, ніж завантажувати всі задачі, бо ми завантажуємо тільки для поточного періоду

    query = query.order('created_at', { ascending: false })

    return query
  }, `getAssignedTasksForExecutor_${executorId}_${startDate?.toISOString()}_${endDate?.toISOString()}`)

  if (error) {
    console.error('Error fetching assigned tasks for executor:', error)
    return []
  }

  let filteredData = (data || []).map(item => ({
    ...item,
    task: normalizeRelation(item.task),
    executor: normalizeRelation(item.executor),
    client: normalizeRelation(item.client)
  }))

  // Фільтруємо по даті на клієнті, якщо вказано
  // (Supabase не підтримує фільтрацію по вкладених полях через join)
  if (startDate || endDate) {
    filteredData = filteredData.filter(item => {
      const plannedDate = item.task?.planned_date
      if (!plannedDate) return false
      
      const taskDate = new Date(plannedDate)
      taskDate.setHours(0, 0, 0, 0)
      
      if (startDate && endDate) {
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        return taskDate >= start && taskDate <= end
      } else if (startDate) {
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        return taskDate >= start
      } else if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        return taskDate <= end
      }
      return true
    })
  }

  return filteredData
}

/**
 * Отримує одну призначену задачу за ID з деталями
 */
export async function getAssignedTaskById(assignedTaskId: number): Promise<AssignedTaskWithDetails | null> {
  const { data, error } = await queuedSupabaseQuery(
    () => supabase
      .from('assigned_tasks')
      .select(`
        *,
        task:tasks(id, task_name, planned_date, task_type, description, category_id),
        executor:users!assigned_tasks_executor_id_fkey(id, surname, name, middle_name, email),
        client:clients(id, legal_name, group_company_id)
      `)
      .eq('id', assignedTaskId)
      .single(),
    `getAssignedTaskById_${assignedTaskId}`
  )

  if (error) {
    console.error('Error fetching assigned task by ID:', error)
    return null
  }

  if (!data) {
    return null
  }

  return {
    ...data,
    task: normalizeRelation(data.task),
    executor: normalizeRelation(data.executor),
    client: normalizeRelation(data.client)
  }
}

/**
 * Отримує всі активні призначені задачі для тім ліда
 * Фільтрує по group_id тім ліда та is_active = true
 */
/**
 * Отримує всі активні призначені задачі для тім ліда з опціональною фільтрацією по даті
 * Фільтрує по group_id тім ліда та is_active = true
 * @param teamLeadGroupId - ID групи тім ліда
 * @param startDate - Початкова дата для фільтрації (опціонально)
 * @param endDate - Кінцева дата для фільтрації (опціонально)
 */
export async function getActiveAssignedTasksForTeamLead(
  teamLeadGroupId: number,
  startDate?: Date,
  endDate?: Date
): Promise<AssignedTaskWithDetails[]> {
  // Запит показує всі задачі з правильним group_id, включаючи задачі без виконавця
  const { data, error } = await queuedSupabaseQuery(async () => {
    let query = supabase
      .from('assigned_tasks')
      .select(`
        *,
        task:tasks(id, task_name, planned_date, task_type, description, category_id),
        executor:users!assigned_tasks_executor_id_fkey(id, surname, name, middle_name, email),
        client:clients(id, legal_name, group_company_id)
      `)
      .eq('group_id', teamLeadGroupId)

    // Додаємо фільтрацію по даті, якщо вказано
    // В Supabase для фільтрації по зв'язаних таблицях використовуємо синтаксис через вкладені поля
    // Але оскільки це може не працювати, завантажуємо дані і фільтруємо на клієнті
    // Це все одно краще, ніж завантажувати всі задачі, бо ми завантажуємо тільки для поточного періоду

    query = query.order('created_at', { ascending: false })
    
    return query
  }, `getActiveAssignedTasksForTeamLead_${teamLeadGroupId}_${startDate?.toISOString()}_${endDate?.toISOString()}`)
  
  if (error) {
    console.error('Помилка запиту активних задач для тім ліда:', error)
    return []
  }
  
  let mapped = (data || []).map(item => {
    const task = normalizeRelation(item.task)
    const executor = normalizeRelation(item.executor)
    const client = normalizeRelation(item.client)
    
    return {
      ...item,
      task,
      executor,
      client
    }
  })

  // Фільтруємо по даті на клієнті, якщо вказано
  // (Supabase не підтримує фільтрацію по вкладених полях через join)
  if (startDate || endDate) {
    mapped = mapped.filter(item => {
      const plannedDate = item.task?.planned_date
      if (!plannedDate) return false
      
      const taskDate = new Date(plannedDate)
      taskDate.setHours(0, 0, 0, 0)
      
      if (startDate && endDate) {
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        return taskDate >= start && taskDate <= end
      } else if (startDate) {
        const start = new Date(startDate)
        start.setHours(0, 0, 0, 0)
        return taskDate >= start
      } else if (endDate) {
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        return taskDate <= end
      }
      return true
    })
  }
  
  return mapped
}

