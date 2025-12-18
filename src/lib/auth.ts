import { supabase } from './supabase'

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw error
  }

  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw error
  }
}

export async function resetPasswordForEmail(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })

  if (error) {
    throw error
  }
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (error) {
    throw error
  }
}

/**
 * Оновлює email користувача в Supabase Auth через Admin API
 * @param authUserId - ID користувача в auth.users
 * @param newEmail - Новий email
 */
export async function updateUserEmailInAuth(authUserId: string, newEmail: string): Promise<boolean> {
  try {
    // Оновлюємо email через Admin API (потребує service role key)
    return await updateUserEmailDirectly(authUserId, newEmail)
  } catch (err) {
    console.error('Unexpected error updating user email:', err)
    return false
  }
}

/**
 * Пряме оновлення email через admin API (потребує service role key)
 */
async function updateUserEmailDirectly(authUserId: string, newEmail: string): Promise<boolean> {
  try {
    // Створюємо admin client з service role key
    const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fstvavndcscqisatuyxn.supabase.co'
    
    // Діагностика: перевіряємо всі змінні оточення
    console.log('🔍 Діагностика змінних оточення:')
    console.log('   VITE_SUPABASE_URL:', supabaseUrl ? '✅ знайдено' : '❌ не знайдено')
    console.log('   VITE_SUPABASE_SERVICE_ROLE_KEY:', serviceRoleKey ? '✅ знайдено' : '❌ не знайдено')
    
    if (!serviceRoleKey) {
      console.error('❌ VITE_SUPABASE_SERVICE_ROLE_KEY не знайдено в змінних оточення.')
      console.error('📝 Для оновлення email потрібно:')
      console.error('   1. Додати service role key в .env.local:')
      console.error('      VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key')
      console.error('   2. Перезапустити dev сервер (npm run dev)')
      console.error('📖 Отримати ключ: Supabase Dashboard → Settings → API → service_role key')
      return false
    }

    const { createClient } = await import('@supabase/supabase-js')
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log(`🔄 Оновлюю email для користувача ${authUserId} на ${newEmail}...`)

    const { data, error } = await adminClient.auth.admin.updateUserById(authUserId, {
      email: newEmail,
      email_confirm: false // Потрібно підтвердження нового email
    })

    if (error) {
      console.error('❌ Помилка оновлення email через Admin API:', error)
      console.error('Деталі помилки:', {
        message: error.message,
        status: error.status,
        name: error.name
      })
      return false
    }

    if (data?.user) {
      console.log('✅ Email успішно оновлено в Supabase Auth')
      return true
    }

    console.warn('⚠️ Оновлення виконано, але дані користувача не повернуто')
    return true
  } catch (err: any) {
    console.error('❌ Помилка в updateUserEmailDirectly:', err)
    console.error('Деталі:', err.message || err)
    return false
  }
}

