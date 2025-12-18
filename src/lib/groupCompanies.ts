import { supabase } from './supabase'
import type { GroupCompany } from '../types/database'

export async function getGroupCompaniesByProject(projectId: number): Promise<GroupCompany[]> {
  const { data, error } = await supabase
    .from('group_company')
    .select('*')
    .eq('project_id', projectId)
    .order('group_name', { ascending: true })

  if (error) {
    console.error('Error fetching group companies:', error)
    return []
  }

  return data || []
}

export async function searchGroupCompanies(projectId: number, searchTerm: string): Promise<GroupCompany[]> {
  const { data, error } = await supabase
    .from('group_company')
    .select('*')
    .eq('project_id', projectId)
    .ilike('group_name', `%${searchTerm}%`)
    .order('group_name', { ascending: true })
    .limit(20)

  if (error) {
    console.error('Error searching group companies:', error)
    return []
  }

  return data || []
}

export async function createGroupCompany(groupName: string, projectId: number): Promise<GroupCompany | null> {
  const { data, error } = await supabase
    .from('group_company')
    .insert({
      group_name: groupName,
      project_id: projectId
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating group company:', error)
    return null
  }

  return data
}

export async function getGroupCompanyById(id: number): Promise<GroupCompany | null> {
  const { data, error } = await supabase
    .from('group_company')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching group company:', error)
    return null
  }

  return data
}

export async function updateGroupCompany(id: number, groupName: string): Promise<boolean> {
  const { error } = await supabase
    .from('group_company')
    .update({ group_name: groupName })
    .eq('id', id)

  if (error) {
    console.error('Error updating group company:', error)
    return false
  }

  return true
}

export async function deleteGroupCompany(id: number): Promise<boolean> {
  const { error } = await supabase
    .from('group_company')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting group company:', error)
    return false
  }

  return true
}

