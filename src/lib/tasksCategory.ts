import { supabase } from './supabase'
import type { TaskCategory } from '../types/database'

export async function getTaskCategoriesByProject(projectId: number): Promise<TaskCategory[]> {
  const { data, error } = await supabase
    .from('tasks_category')
    .select('*')
    .eq('project_id', projectId)
    .order('name', { ascending: true })

  if (error) {
    console.error('Error fetching task categories:', error)
    return []
  }

  return data || []
}

export async function searchTaskCategories(projectId: number, searchTerm: string): Promise<TaskCategory[]> {
  const { data, error } = await supabase
    .from('tasks_category')
    .select('*')
    .eq('project_id', projectId)
    .ilike('name', `%${searchTerm}%`)
    .order('name', { ascending: true })
    .limit(20)

  if (error) {
    console.error('Error searching task categories:', error)
    return []
  }

  return data || []
}

export async function createTaskCategory(name: string, projectId: number): Promise<TaskCategory | null> {
  const { data, error } = await supabase
    .from('tasks_category')
    .insert({
      name: name.trim(),
      project_id: projectId
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating task category:', error)
    return null
  }

  return data
}

export async function updateTaskCategory(id: number, name: string): Promise<boolean> {
  const { error } = await supabase
    .from('tasks_category')
    .update({ name: name.trim() })
    .eq('id', id)

  if (error) {
    console.error('Error updating task category:', error)
    return false
  }

  return true
}

export async function deleteTaskCategory(id: number): Promise<boolean> {
  const { error } = await supabase
    .from('tasks_category')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting task category:', error)
    return false
  }

  return true
}

