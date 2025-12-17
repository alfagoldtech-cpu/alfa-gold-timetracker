import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import Dashboard from './pages/Dashboard'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  try {
    const { authUser, loading } = useAuth()

    if (loading) {
      return (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '100vh',
          fontSize: '18px',
          color: '#2d3748'
        }}>
          Завантаження...
        </div>
      )
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

function LoginRoute() {
  try {
    const { authUser } = useAuth()

    if (authUser) {
      return <Navigate to="/dashboard" replace />
    }

    return <LoginPage />
  } catch (error) {
    console.error('Error in LoginRoute:', error)
    return <LoginPage />
  }
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
            <Dashboard />
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

