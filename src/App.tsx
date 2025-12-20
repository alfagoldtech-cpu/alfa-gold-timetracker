import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ActiveTaskProvider } from './contexts/ActiveTaskContext'
import LoadingSpinner from './components/LoadingSpinner'
import SkeletonLoader from './components/SkeletonLoader'

// Lazy load великі компоненти
const LoginPage = lazy(() => import('./pages/LoginPage'))
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'))
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard'))
const ProjectViewPage = lazy(() => import('./pages/ProjectViewPage'))
const ClientViewPage = lazy(() => import('./pages/ClientViewPage'))
const EmployeeViewPage = lazy(() => import('./pages/EmployeeViewPage'))

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
    return (
      <Suspense fallback={<SkeletonLoader type="card" />}>
        <AdminDashboard />
      </Suspense>
    )
  } else if (user?.role_id === 2) {
    return (
      <Suspense fallback={<SkeletonLoader type="card" />}>
        <ManagerDashboard />
      </Suspense>
    )
  }

  // Якщо роль не визначена, показуємо дашборд керівника виробництва за замовчуванням
  return (
    <Suspense fallback={<SkeletonLoader type="card" />}>
      <ManagerDashboard />
    </Suspense>
  )
}

function LoginRoute() {
  try {
    const { authUser } = useAuth()

    if (authUser) {
      return <Navigate to="/dashboard" replace />
    }

    return (
      <Suspense fallback={<LoadingSpinner />}>
        <LoginPage />
      </Suspense>
    )
  } catch (error) {
    console.error('Error in LoginRoute:', error)
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <LoginPage />
      </Suspense>
    )
  }
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route 
          path="/login" 
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <LoginRoute />
            </Suspense>
          } 
        />
        <Route 
          path="/reset-password" 
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <ResetPasswordPage />
            </Suspense>
          } 
        />
        <Route 
          path="/change-password" 
          element={
            <ProtectedRoute>
              <Suspense fallback={<SkeletonLoader type="card" />}>
                <ChangePasswordPage />
              </Suspense>
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
              <Suspense fallback={<SkeletonLoader type="card" />}>
                <ProjectViewPage />
              </Suspense>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/clients/:id" 
          element={
            <ProtectedRoute>
              <Suspense fallback={<SkeletonLoader type="card" />}>
                <ClientViewPage />
              </Suspense>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/employees/:id" 
          element={
            <ProtectedRoute>
              <Suspense fallback={<SkeletonLoader type="card" />}>
                <EmployeeViewPage />
              </Suspense>
            </ProtectedRoute>
          } 
        />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}

// Налаштування React Query з TTL для різних типів даних
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 хвилина за замовчуванням
      gcTime: 1000 * 60 * 5, // 5 хвилин (раніше cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ActiveTaskProvider>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppRoutes />
          </Router>
        </ActiveTaskProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App

