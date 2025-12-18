import { supabase } from './supabase'
import type { Task, User } from '../types/database'

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
  const { data, error } = await supabase
    .from('assigned_tasks')
    .insert({
      ...taskData,
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

  const tasksToInsert = tasks.map(task => ({
    ...task,
    is_active: task.is_active !== undefined ? task.is_active : true
  }))

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

