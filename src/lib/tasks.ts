import { supabase } from './supabase'
import type { Task } from '../types/database'

export async function getTasksByProject(projectId: number): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('planned_date', { ascending: true })

  if (error) {
    console.error('Error fetching tasks:', error)
    return []
  }

  return data || []
}

export async function getTaskById(id: number): Promise<Task | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching task:', error)
    return null
  }

  return data
}

export async function createTask(taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task | null> {
  const { data, error } = await supabase
    .from('tasks')
    .insert(taskData)
    .select()
    .single()

  if (error) {
    console.error('Error creating task:', error)
    return null
  }

  return data
}

export async function updateTask(id: number, taskData: Partial<Task>): Promise<boolean> {
  const { error } = await supabase
    .from('tasks')
    .update(taskData)
    .eq('id', id)

  if (error) {
    console.error('Error updating task:', error)
    return false
  }

  return true
}

export async function deleteTask(id: number): Promise<boolean> {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting task:', error)
    return false
  }

  return true
}

export async function updateTaskStatus(id: number, status: string): Promise<boolean> {
  return updateTask(id, { status })
}

