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

export async function createTask(taskData: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task | null> {
  console.log('createTask called with:', taskData)
  const { data, error } = await supabase
    .from('tasks')
    .insert(taskData)
    .select()
    .single()

  if (error) {
    console.error('Error creating task:', error)
    console.error('Error details:', JSON.stringify(error, null, 2))
    console.error('Task data that failed:', JSON.stringify(taskData, null, 2))
    return null
  }

  console.log('Task created successfully:', data)
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

