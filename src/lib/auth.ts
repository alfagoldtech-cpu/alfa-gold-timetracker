import { supabase } from './supabase'
import type { User } from '../types/database'

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

export async function signUp(email: string, password: string, userData: {
  project_id?: number
  role_id: number
  surname?: string
  name?: string
  middle_name?: string
  phone?: string
  status?: string
}) {
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  })

  if (authError) {
    throw authError
  }

  if (authData.user) {
    const { data: userDataResult, error: userError } = await supabase
      .from('users')
      .insert({
        auth_user_id: authData.user.id,
        ...userData,
      })
      .select()
      .single()

    if (userError) {
      throw userError
    }

    return { auth: authData, user: userDataResult }
  }

  return { auth: authData, user: null }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw error
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const { data: { user: authUser } } = await supabase.auth.getUser()

  if (!authUser) {
    return null
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authUser.id)
    .single()

  if (error) {
    console.error('Error fetching user:', error)
    return null
  }

  return data
}

export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) {
    throw error
  }
  return session
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

