import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import AdminDashboard from './pages/AdminDashboard'
import ManagerDashboard from './pages/ManagerDashboard'
import ProjectViewPage from './pages/ProjectViewPage'
import ClientViewPage from './pages/ClientViewPage'
import LoadingSpinner from './components/LoadingSpinner'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  try {
    const { authUser, loading } = useAuth()

    if (loading) {
      return <LoadingSpinner />
    }

    if (!authUser) {
      return <Navigate to="/login" replace />
    }

    return <>{children}</>
  } catch (error) {
    console.error('Error in ProtectedRoute:', error)
    return <Navigate to="/login" replace />
  }
}

function DashboardRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingSpinner />
  }

  // role_id 1 = Адміністратор
  // role_id 2 = Керівник виробництва
  if (user?.role_id === 1) {
    return <AdminDashboard />
  } else if (user?.role_id === 2) {
    return <ManagerDashboard />
  }

  // Якщо роль не визначена, показуємо дашборд керівника виробництва за замовчуванням
  return <ManagerDashboard />
}

function LoginRoute() {
  const { authUser, loading } = useAuth()
  const searchParams = new URLSearchParams(window.location.search)
  const isLogout = searchParams.get('logout') === 'true'
  
  // Перевіряємо флаг виходу в localStorage
  const isLoggingOut = localStorage.getItem('isLoggingOut') === 'true'

  // Очищаємо сесію при монтуванні, якщо це вихід
  useEffect(() => {
    if (isLogout) {
      // Викликаємо signOut для очищення сесії
      supabase.auth.signOut({ scope: 'local' }).catch(() => {
        // Ігноруємо помилки, просто очищаємо storage
      })
      // Очищаємо localStorage та sessionStorage
      localStorage.removeItem('isLoggingOut')
      // Очищаємо Supabase keys з localStorage
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-')) {
          localStorage.removeItem(key)
        }
      })
      // Очищаємо sessionStorage
      sessionStorage.clear()
      window.history.replaceState({}, '', '/login')
    }
    if (isLoggingOut) {
      localStorage.removeItem('isLoggingOut')
    }
  }, [isLogout, isLoggingOut])

  // Якщо це вихід (через URL або localStorage), показуємо сторінку входу
  if (isLogout || isLoggingOut) {
    return <LoginPage />
  }

  // Якщо завантаження, показуємо спінер
  if (loading) {
    return <LoadingSpinner />
  }

  // Якщо користувач авторизований і це не вихід, перенаправляємо на дашборд
  if (authUser) {
    return <Navigate to="/dashboard" replace />
  }

  return <LoginPage />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route 
        path="/change-password" 
        element={
          <ProtectedRoute>
            <ChangePasswordPage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <DashboardRoute />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/projects/:id" 
        element={
          <ProtectedRoute>
            <ProjectViewPage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/clients/:id" 
        element={
          <ProtectedRoute>
            <ClientViewPage />
          </ProtectedRoute>
        } 
      />
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  )
}

export default App

