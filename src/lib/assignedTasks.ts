import { supabase } from './supabase'
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
  client?: Pick<Client, 'id' | 'legal_name'>
}

/**
 * Отримує кількість активних призначених задач для клієнта
 */
export async function getActiveAssignedTasksCount(clientId: number): Promise<number> {
  const { count, error } = await supabase
    .from('assigned_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('is_active', true)

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

  const { data, error } = await supabase
    .from('assigned_tasks')
    .select('client_id')
    .in('client_id', clientIds)
    .eq('is_active', true)

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
  const { data, error } = await supabase
    .from('assigned_tasks')
    .select(`
      *,
      task:tasks(*),
      executor:users!assigned_tasks_executor_id_fkey(*)
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching assigned tasks:', error)
    return []
  }

  return (data || []).map(item => ({
    ...item,
    task: Array.isArray(item.task) ? item.task[0] : item.task,
    executor: Array.isArray(item.executor) ? item.executor[0] : item.executor
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

  // Якщо group_id не встановлено, але є executor_id, беремо group_id з виконавця
  if (!groupId && taskData.executor_id) {
    const { data: executor, error: executorError } = await supabase
      .from('users')
      .select('group_id')
      .eq('id', taskData.executor_id)
      .single()

    if (executorError) {
      console.error('Error fetching executor for group_id:', executorError)
    } else if (executor) {
      groupId = executor.group_id
      if (groupId) {
        console.log(`Встановлено group_id ${groupId} з виконавця ${taskData.executor_id}`)
      }
    }
  }

  const { data, error } = await supabase
    .from('assigned_tasks')
    .insert({
      ...taskData,
      group_id: groupId,
      is_active: taskData.is_active !== undefined ? taskData.is_active : true
    })
    .select()
    .single()

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
    const { data: executors, error: executorsError } = await supabase
      .from('users')
      .select('id, group_id')
      .in('id', Array.from(executorIdsToFetch))

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
    
    // Якщо group_id не встановлено, але є executor_id, беремо group_id з виконавця
    if (!groupId && task.executor_id) {
      groupId = executorGroupMap.get(task.executor_id) || null
      if (groupId) {
        console.log(`Встановлено group_id ${groupId} з виконавця ${task.executor_id}`)
      }
    }

    return {
      ...task,
      group_id: groupId,
      is_active: task.is_active !== undefined ? task.is_active : true
    }
  })

  const { data, error } = await supabase
    .from('assigned_tasks')
    .insert(tasksToInsert)
    .select()

  if (error) {
    console.error('Error creating assigned tasks:', error)
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
  const { error } = await supabase
    .from('assigned_tasks')
    .update(updates)
    .eq('id', id)

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
  const { error } = await supabase
    .from('assigned_tasks')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting assigned task:', error)
    return false
  }

  return true
}

/**
 * Отримує всі активні призначені задачі для тім ліда
 * Фільтрує по group_id тім ліда та is_active = true
 */
export async function getActiveAssignedTasksForTeamLead(teamLeadGroupId: number): Promise<AssignedTaskWithDetails[]> {
  console.log('Запит активних задач для тім ліда з group_id:', teamLeadGroupId)
  
  const { data, error } = await supabase
    .from('assigned_tasks')
    .select(`
      *,
      task:tasks(*),
      executor:users!assigned_tasks_executor_id_fkey(*),
      client:clients(id, legal_name)
    `)
    .eq('group_id', teamLeadGroupId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Помилка запиту активних задач для тім ліда:', error)
    return []
  }
  
  console.log('Знайдено активних задач для тім ліда (group_id:', teamLeadGroupId, '):', data?.length || 0)

  const mapped = (data || []).map(item => {
    const task = Array.isArray(item.task) ? item.task[0] : item.task
    const executor = Array.isArray(item.executor) ? item.executor[0] : item.executor
    const client = Array.isArray(item.client) ? item.client[0] : item.client
    
    // Логування для діагностики
    if (!task) {
      console.warn('Assigned task without task data:', item.id, 'task_id:', item.task_id)
    }
    
    return {
      ...item,
      task,
      executor,
      client
    }
  })
  
  console.log('Mapped assigned tasks:', mapped.length, 'tasks with task data:', mapped.filter(t => t.task).length)
  
  return mapped
}

