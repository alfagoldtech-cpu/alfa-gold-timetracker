import { supabase } from './supabase'
import type { User, Role, Project } from '../types/database'

export async function getUserByEmail(email: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single()

  if (error) {
    console.error('Error fetching user:', error)
    return null
  }

  return data
}

export async function getUserById(id: number): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single()

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
  surname?: string
  name?: string
  middle_name?: string
  phone?: string
  status?: string
  email?: string
}): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .insert(userData)
    .select()
    .single()

  if (error) {
    console.error('Error creating user:', error)
    return null
  }

  return data
}

export async function getAllRoles(): Promise<Role[]> {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .order('role_name')

  if (error) {
    console.error('Error fetching roles:', error)
    return []
  }

  return data || []
}

export async function getRoleById(id: number): Promise<Role | null> {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching role:', error)
    return null
  }

  return data
}

export async function getUserWithRole(userId: number): Promise<(User & { role: Role }) | null> {
  const { data, error } = await supabase
    .from('users')
    .select(`
      *,
      role:roles(*)
    `)
    .eq('id', userId)
    .single()

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

export async function getAllProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('date_added', { ascending: false })

  if (error) {
    console.error('Error fetching projects:', error)
    return []
  }

  return data || []
}

export async function getProjectById(id: number): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

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
  const { data, error } = await supabase
    .from('projects')
    .insert(projectData)
    .select()
    .single()

  if (error) {
    console.error('Error creating project:', error)
    return null
  }

  return data
}

export async function getUsersByProject(projectId: number): Promise<User[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('project_id', projectId)

  if (error) {
    console.error('Error fetching users by project:', error)
    return []
  }

  return data || []
}
