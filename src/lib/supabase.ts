import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fstvavndcscqisatuyxn.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('⚠️ VITE_SUPABASE_ANON_KEY не знайдено. Перевірте файл .env.local')
  console.warn('⚠️ Аутентифікація може не працювати без правильного ключа')
}

if (!supabaseUrl) {
  console.error('❌ VITE_SUPABASE_URL не налаштовано. Перевірте файл .env.local')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
})

