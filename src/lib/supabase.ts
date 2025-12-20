import { createClient } from '@supabase/supabase-js'
import { queuedRequest } from './requestQueue'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fstvavndcscqisatuyxn.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('⚠️ VITE_SUPABASE_ANON_KEY не знайдено. Перевірте файл .env.local')
  console.warn('⚠️ Аутентифікація може не працювати без правильного ключа')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
})

/**
 * Обгортка для Supabase запитів з автоматичною чергою та retry логікою
 * Використовуйте цю функцію замість прямого виклику supabase запитів
 * 
 * @example
 * const { data, error } = await queuedSupabaseQuery(
 *   () => supabase.from('clients').select('*')
 * )
 * 
 * @example Для count запитів:
 * const result = await queuedSupabaseQuery(
 *   () => supabase.from('clients').select('*', { count: 'exact', head: true })
 * )
 * const count = (result as any).count
 */
export async function queuedSupabaseQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any; count?: number | null }>,
  requestId?: string
): Promise<{ data: T | null; error: any; count?: number | null }> {
  return queuedRequest(queryFn, requestId)
}

