/**
 * Helper функції для використання черги запитів з Supabase
 * 
 * Ці функції автоматично використовують чергу запитів для обмеження
 * кількості одночасних запитів та retry логіки
 */

import { supabase } from './supabase'
import { queuedSupabaseQuery } from './supabase'

/**
 * Виконує select запит через чергу
 */
export async function queuedSelect<T>(
  table: string,
  select: string = '*',
  filters?: Record<string, any>,
  options?: {
    orderBy?: string
    ascending?: boolean
    limit?: number
    offset?: number
    requestId?: string
  }
): Promise<{ data: T[] | null; error: any }> {
  return queuedSupabaseQuery(async () => {
    let query = supabase.from(table).select(select)

    // Додаємо фільтри
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (typeof value === 'object' && 'operator' in value) {
            // Підтримка операторів: { operator: 'eq', value: 123 }
            const { operator, value: filterValue } = value as { operator: string; value: any }
            query = (query as any)[operator](key, filterValue)
          } else {
            query = query.eq(key, value)
          }
        }
      })
    }

    // Додаємо сортування
    if (options?.orderBy) {
      query = query.order(options.orderBy, { ascending: options.ascending ?? true })
    }

    // Додаємо пагінацію
    if (options?.limit !== undefined) {
      query = query.limit(options.limit)
    }
    if (options?.offset !== undefined && options?.limit !== undefined) {
      query = query.range(options.offset, options.offset + options.limit - 1)
    }

    return query
  }, options?.requestId)
}

/**
 * Виконує insert запит через чергу
 */
export async function queuedInsert<T>(
  table: string,
  data: T | T[],
  requestId?: string
): Promise<{ data: T[] | null; error: any }> {
  return queuedSupabaseQuery(
    () => supabase.from(table).insert(data).select(),
    requestId
  )
}

/**
 * Виконує update запит через чергу
 */
export async function queuedUpdate<T>(
  table: string,
  id: number,
  data: Partial<T>,
  requestId?: string
): Promise<{ data: T[] | null; error: any }> {
  return queuedSupabaseQuery(
    () => supabase.from(table).update(data).eq('id', id).select(),
    requestId
  )
}

/**
 * Виконує delete запит через чергу
 */
export async function queuedDelete(
  table: string,
  id: number,
  requestId?: string
): Promise<{ error: any }> {
  return queuedSupabaseQuery(
    () => supabase.from(table).delete().eq('id', id),
    requestId
  )
}

/**
 * Виконує count запит через чергу
 */
export async function queuedCount(
  table: string,
  filters?: Record<string, any>,
  requestId?: string
): Promise<{ count: number | null; error: any }> {
  const result = await queuedSupabaseQuery(async () => {
    let query = supabase.from(table).select('*', { count: 'exact', head: true })

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value)
        }
      })
    }

    return query
  }, requestId)

  return {
    count: (result as any).count ?? null,
    error: result.error,
  }
}

