import { supabase, queuedSupabaseQuery } from './supabase'
import type { Client, Kved, ClientWithRelations } from '../types/database'

export async function getAllClients(limit?: number, offset?: number): Promise<Client[]> {
  const { data, error } = await queuedSupabaseQuery(async () => {
    let query = supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (limit !== undefined) {
      query = query.limit(limit)
    }
    if (offset !== undefined) {
      query = query.range(offset, offset + (limit || 1000) - 1)
    }

    return query
  }, `getAllClients_${limit}_${offset}`)

  if (error) {
    console.error('Error fetching clients:', error)
    return []
  }

  return data || []
}

/**
 * Отримує загальну кількість клієнтів
 */
export async function getClientsCount(): Promise<number> {
  const result = await queuedSupabaseQuery(
    () => supabase.from('clients').select('*', { count: 'exact', head: true }),
    'getClientsCount'
  )

  if (result.error) {
    console.error('Error fetching clients count:', result.error)
    return 0
  }

  return result.count || 0
}

/**
 * Отримує відділи для кількох клієнтів одночасно (batch-запит)
 */
export async function getClientsWithDepartments(clientIds: number[]): Promise<Map<number, any[]>> {
  if (clientIds.length === 0) {
    return new Map()
  }

  const { data, error } = await queuedSupabaseQuery(
    () => supabase
      .from('client_departments')
      .select(`
        client_id,
        departments (id, department_name, project_id)
      `)
      .in('client_id', clientIds),
    `getClientsWithDepartments_${clientIds.length}`
  )

  if (error) {
    console.error('Error fetching clients departments:', error)
    return new Map()
  }

  // Групуємо відділи по client_id
  const departmentsMap = new Map<number, any[]>()
  
  // Ініціалізуємо всі клієнти з порожніми масивами
  clientIds.forEach(id => departmentsMap.set(id, []))
  
  // Додаємо відділи
  if (data) {
    data.forEach((item: any) => {
      const clientId = item.client_id
      const department = Array.isArray(item.departments) ? item.departments[0] : item.departments
      if (department && departmentsMap.has(clientId)) {
        departmentsMap.get(clientId)!.push(department)
      }
    })
  }

  return departmentsMap
}

export async function getClientWithRelations(id: number): Promise<ClientWithRelations | null> {
  // Використовуємо звичайний join замість inner join, щоб не отримувати помилку
  // якщо у клієнта немає відділів або працівників
  // Оптимізовано: вибираємо тільки необхідні поля замість *
  const { data, error } = await queuedSupabaseQuery(
    () => supabase
      .from('clients')
      .select(`
        *,
        kveds (id, code, description),
        group_company (id, group_name, project_id),
        client_departments (
          department_id,
          departments (id, department_name, project_id)
        ),
        client_employees (
          user_id,
          users (id, surname, name, middle_name, email, phone, status)
        )
      `)
      .eq('id', id)
      .single(),
    `getClientWithRelations_${id}`
  )

  if (error) {
    console.error('Error fetching client with relations:', error)
    return null
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
    group_company: data.group_company || undefined,
    departments: departments,
    employees: employees,
  } as ClientWithRelations
}

export async function createClient(clientData: Omit<Client, 'id' | 'created_at' | 'updated_at'>): Promise<Client | null> {
  const { data, error } = await queuedSupabaseQuery(
    () => supabase
      .from('clients')
      .insert(clientData)
      .select()
      .single(),
    'createClient'
  )

  if (error) {
    console.error('Error creating client:', error)
    return null
  }

  return data
}

export async function updateClient(id: number, clientData: Partial<Client>): Promise<boolean> {
  const { error } = await queuedSupabaseQuery(
    () => supabase
      .from('clients')
      .update(clientData)
      .eq('id', id),
    `updateClient_${id}`
  )

  if (error) {
    console.error('Error updating client:', error)
    return false
  }

  return true
}

export async function deleteClient(id: number): Promise<boolean> {
  const { error } = await queuedSupabaseQuery(
    () => supabase
      .from('clients')
      .delete()
      .eq('id', id),
    `deleteClient_${id}`
  )

  if (error) {
    console.error('Error deleting client:', error)
    return false
  }

  return true
}

export async function updateClientStatus(id: number, status: string): Promise<boolean> {
  return updateClient(id, { status })
}

/**
 * Отримує всі КВЕДи з опціональною пагінацією та пошуком
 * @param limit - Максимальна кількість записів (за замовчуванням 100, якщо не вказано - всі)
 * @param offset - Зміщення для пагінації
 * @param search - Пошуковий запит (по коду або опису)
 */
export async function getAllKveds(limit?: number, offset?: number, search?: string): Promise<Kved[]> {
  try {
    const { data, error } = await queuedSupabaseQuery(async () => {
      let query = supabase
        .from('kveds')
        .select('*')
        .order('code')

      // Додаємо пошук, якщо вказано
      if (search && search.trim().length > 0) {
        const searchTerm = `%${search.trim()}%`
        query = query.or(`code.ilike.${searchTerm},description.ilike.${searchTerm}`)
      }

      // Додаємо пагінацію, якщо вказано
      if (limit !== undefined) {
        query = query.limit(limit)
      }
      if (offset !== undefined && limit !== undefined) {
        query = query.range(offset, offset + limit - 1)
      }

      return query
    }, `getAllKveds_${limit}_${offset}_${search || ''}`)

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

/**
 * Отримує загальну кількість КВЕДів
 * @param search - Пошуковий запит (опціонально)
 */
export async function getKvedsCount(search?: string): Promise<number> {
  try {
    const result = await queuedSupabaseQuery(async () => {
      let query = supabase
        .from('kveds')
        .select('*', { count: 'exact', head: true })

      // Додаємо пошук, якщо вказано
      if (search && search.trim().length > 0) {
        const searchTerm = `%${search.trim()}%`
        query = query.or(`code.ilike.${searchTerm},description.ilike.${searchTerm}`)
      }

      return query
    }, `getKvedsCount_${search || ''}`)

    const { count, error } = result

    if (error) {
      console.error('Error fetching kveds count:', error)
      return 0
    }

    return count || 0
  } catch (err) {
    console.error('Unexpected error fetching kveds count:', err)
    return 0
  }
}


