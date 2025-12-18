import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
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
  const location = useLocation()
  const { authUser, loading } = useAuth()

  // Зберігаємо поточний URL в sessionStorage при зміні локації
  useEffect(() => {
    if (authUser && location.pathname !== '/login' && location.pathname !== '/') {
      // Зберігаємо поточний URL для можливості повернення після оновлення
      const currentUrl = location.pathname + location.search
      sessionStorage.setItem('returnUrl', currentUrl)
    }
  }, [location.pathname, location.search, authUser])

  try {
    // Показуємо спінер під час завантаження
    if (loading) {
      return <LoadingSpinner />
    }

    // Якщо користувач не авторизований, зберігаємо поточний URL і перенаправляємо на login
    if (!authUser) {
      // Зберігаємо поточний URL перед перенаправленням на login
      const currentPath = location.pathname + location.search
      if (currentPath !== '/login' && currentPath !== '/') {
        sessionStorage.setItem('returnUrl', currentPath)
      }
      return <Navigate to="/login" replace />
    }

    // Якщо користувач авторизований, показуємо дочірній компонент
    return <>{children}</>
  } catch (error) {
    console.error('Error in ProtectedRoute:', error)
    // Зберігаємо поточний URL перед перенаправленням на login
    const currentPath = location.pathname + location.search
    if (currentPath !== '/login' && currentPath !== '/') {
      sessionStorage.setItem('returnUrl', currentPath)
    }
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

  // Якщо користувач авторизований і це не вихід
  if (authUser) {
    // Перевіряємо, чи є збережений URL для повернення (з ProtectedRoute)
    const returnUrl = sessionStorage.getItem('returnUrl')
    if (returnUrl && returnUrl !== '/login' && returnUrl !== '/dashboard' && returnUrl !== '/') {
      sessionStorage.removeItem('returnUrl')
      // Перенаправляємо на збережений URL
      return <Navigate to={returnUrl} replace />
    }
    // Якщо немає збереженого URL або це /login, перенаправляємо на дашборд
    // Але тільки якщо користувач дійсно на сторінці входу (не редирект)
    // Перевіряємо, чи це навмисний перехід на /login (немає returnUrl або returnUrl = /login)
    const isIntentionalLogin = !returnUrl || returnUrl === '/login' || returnUrl === '/'
    if (isIntentionalLogin) {
      // Очищаємо returnUrl, якщо він є
      if (returnUrl) {
        sessionStorage.removeItem('returnUrl')
      }
      return <Navigate to="/dashboard" replace />
    }
    // Якщо є returnUrl, але він не оброблений вище, залишаємо на login
    // (це не повинно статися в нормальних умовах)
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

