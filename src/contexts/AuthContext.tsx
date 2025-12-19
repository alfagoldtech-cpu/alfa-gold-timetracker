import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { User } from '../types/database'

interface AuthContextType {
  user: User | null
  authUser: SupabaseUser | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUser = async (authUserId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', authUserId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          console.warn('Користувач не знайдений в таблиці users. Створіть запис для auth_user_id:', authUserId)
        } else {
          console.error('Error loading user:', error)
          // Логуємо детальну інформацію про помилку мережі
          if (error.message?.includes('Failed to fetch') || error.code === -102 || error.message?.includes('network')) {
            console.error('❌ Помилка підключення до Supabase при завантаженні користувача:', {
              message: error.message,
              code: error.code,
              hint: 'Перевірте підключення до інтернету та налаштування Supabase URL'
            })
          }
        }
        setUser(null)
      } else {
        setUser(data)
      }
    } catch (err: any) {
      console.error('Error in loadUser:', err)
      // Логуємо детальну інформацію про помилку мережі
      if (err?.message?.includes('Failed to fetch') || err?.code === -102 || err?.message?.includes('network')) {
        console.error('❌ Помилка підключення до Supabase при завантаженні користувача:', {
          message: err?.message,
          code: err?.code,
          hint: 'Перевірте підключення до інтернету та налаштування Supabase URL'
        })
      }
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true

    // Перевіряємо флаг виходу
    const isLoggingOut = localStorage.getItem('isLoggingOut') === 'true'
    if (isLoggingOut) {
      // Якщо це вихід, очищаємо стан і не завантажуємо сесію
      setUser(null)
      setAuthUser(null)
      setLoading(false)
      localStorage.removeItem('isLoggingOut')
      return
    }

    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (!mounted) return
        
        // Перевіряємо флаг виходу знову (на випадок якщо він встановився під час завантаження)
        const isLoggingOutNow = localStorage.getItem('isLoggingOut') === 'true'
        if (isLoggingOutNow) {
          setUser(null)
          setAuthUser(null)
          setLoading(false)
          localStorage.removeItem('isLoggingOut')
          return
        }
        
        if (error) {
          console.error('Error getting session:', error)
          // Логуємо детальну інформацію про помилку мережі
          if (error.message?.includes('Failed to fetch') || error.code === -102 || error.message?.includes('network')) {
            console.error('❌ Помилка підключення до Supabase:', {
              message: error.message,
              code: error.code,
              hint: 'Перевірте підключення до інтернету та налаштування Supabase URL'
            })
          }
          setLoading(false)
          return
        }

        setAuthUser(session?.user ?? null)
        if (session?.user) {
          loadUser(session.user.id)
        } else {
          setLoading(false)
        }
      })
      .catch((err) => {
        console.error('Error in getSession:', err)
        // Логуємо детальну інформацію про помилку мережі
        if (err.message?.includes('Failed to fetch') || err.code === -102 || err.message?.includes('network')) {
          console.error('❌ Помилка підключення до Supabase:', {
            message: err.message,
            code: err.code,
            hint: 'Перевірте підключення до інтернету та налаштування Supabase URL'
          })
        }
        if (mounted) {
          setLoading(false)
        }
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return
      
      // Перевіряємо флаг виходу
      const isLoggingOut = localStorage.getItem('isLoggingOut') === 'true'
      if (isLoggingOut || event === 'SIGNED_OUT') {
        setUser(null)
        setAuthUser(null)
        setLoading(false)
        localStorage.removeItem('isLoggingOut')
        return
      }
      
      setAuthUser(session?.user ?? null)
      if (session?.user) {
        loadUser(session.user.id)
      } else {
        setUser(null)
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw error
    }
  }

  async function signOut() {
    // Встановлюємо флаг виходу в localStorage перед очищенням
    localStorage.setItem('isLoggingOut', 'true')
    
    // Спочатку очищаємо локальний стан
    setUser(null)
    setAuthUser(null)
    setLoading(false)
    
    // Потім виходимо з Supabase (scope: 'global' для виходу з усіх пристроїв)
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) {
      console.error('Error signing out:', error)
      // Навіть якщо є помилка, стан вже очищено
    }
  }

  return (
    <AuthContext.Provider value={{ user, authUser, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

