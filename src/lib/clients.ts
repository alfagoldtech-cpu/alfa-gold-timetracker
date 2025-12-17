import { supabase } from './supabase'
import type { Client, Kved, ClientWithRelations } from '../types/database'

export async function getAllClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching clients:', error)
    return []
  }

  return data || []
}

export async function getClientById(id: number): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching client:', error)
    return null
  }

  return data
}

export async function getClientWithRelations(id: number): Promise<ClientWithRelations | null> {
  const { data, error } = await supabase
    .from('clients')
    .select(`
      *,
      kveds (*),
      client_departments!inner (
        department_id,
        departments (*)
      ),
      client_employees!inner (
        user_id,
        users (*)
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching client with relations:', error)
    // Якщо помилка через відсутність зв'язків, спробуємо без inner join
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('clients')
      .select(`
        *,
        kveds (*),
        client_departments (
          department_id,
          departments (*)
        ),
        client_employees (
          user_id,
          users (*)
        )
      `)
      .eq('id', id)
      .single()

    if (fallbackError) {
      console.error('Error fetching client (fallback):', fallbackError)
      return null
    }

    if (!fallbackData) return null

    // Обробляємо відділи
    let departments: any[] = []
    if (fallbackData.client_departments) {
      if (Array.isArray(fallbackData.client_departments)) {
        departments = fallbackData.client_departments
          .map((cd: any) => cd.departments)
          .filter(Boolean)
      } else if (fallbackData.client_departments.departments) {
        departments = [fallbackData.client_departments.departments]
      }
    }

    // Обробляємо працівників
    let employees: any[] = []
    if (fallbackData.client_employees) {
      if (Array.isArray(fallbackData.client_employees)) {
        employees = fallbackData.client_employees
          .map((ce: any) => ce.users)
          .filter(Boolean)
      } else if (fallbackData.client_employees.users) {
        employees = [fallbackData.client_employees.users]
      }
    }

    return {
      ...fallbackData,
      kved: fallbackData.kveds || undefined,
      departments: departments,
      employees: employees,
    } as ClientWithRelations
  }

  if (!data) return null

  // Обробляємо відділи
  let departments: any[] = []
  if (data.client_departments) {
    if (Array.isArray(data.client_departments)) {
      departments = data.client_departments
        .map((cd: any) => cd.departments)
        .filter(Boolean)
    } else if (data.client_departments.departments) {
      departments = [data.client_departments.departments]
    }
  }

  // Обробляємо працівників
  let employees: any[] = []
  if (data.client_employees) {
    if (Array.isArray(data.client_employees)) {
      employees = data.client_employees
        .map((ce: any) => ce.users)
        .filter(Boolean)
    } else if (data.client_employees.users) {
      employees = [data.client_employees.users]
    }
  }

  return {
    ...data,
    kved: data.kveds || undefined,
    departments: departments,
    employees: employees,
  } as ClientWithRelations
}

export async function createClient(clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>): Promise<Client | null> {
  const { data, error } = await supabase
    .from('clients')
    .insert(clientData)
    .select()
    .single()

  if (error) {
    console.error('Error creating client:', error)
    return null
  }

  return data
}

export async function updateClient(id: number, clientData: Partial<Client>): Promise<boolean> {
  const { error } = await supabase
    .from('clients')
    .update(clientData)
    .eq('id', id)

  if (error) {
    console.error('Error updating client:', error)
    return false
  }

  return true
}

export async function deleteClient(id: number): Promise<boolean> {
  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting client:', error)
    return false
  }

  return true
}

export async function updateClientStatus(id: number, status: string): Promise<boolean> {
  return updateClient(id, { status })
}

export async function getAllKveds(): Promise<Kved[]> {
  try {
    const { data, error } = await supabase
      .from('kveds')
      .select('*')
      .order('code')

    if (error) {
      console.error('Error fetching kveds:', error)
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
      
      // Якщо таблиця не існує, повертаємо порожній масив
      if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
        console.warn('Таблиця kveds не існує. Виконайте міграцію 003_create_kveds.sql')
        return []
      }
      
      return []
    }

    console.log('Kveds loaded:', data?.length || 0, 'items')
    return data || []
  } catch (err) {
    console.error('Unexpected error fetching kveds:', err)
    return []
  }
}

export async function getKvedById(id: number): Promise<Kved | null> {
  const { data, error } = await supabase
    .from('kveds')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching kved:', error)
    return null
  }

  return data
}

