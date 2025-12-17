import { useAuth } from '../contexts/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import './ManagerDashboard.css'

export default function ManagerDashboard() {
  const { user, authUser, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/login')
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const getFullName = () => {
    if (!user) return ''
    const parts = [user.surname, user.name, user.middle_name].filter(Boolean)
    return parts.join(' ') || 'Користувач'
  }

  return (
    <div className="manager-dashboard">
      <header className="manager-dashboard-header">
        <div className="header-left">
          <h1>AlfaGold Time Tracker</h1>
          <span className="user-info">
            {getFullName()} ({authUser?.email})
          </span>
        </div>
        <div className="header-right">
          <Link
            to="/change-password"
            className="btn-link"
          >
            Змінити пароль
          </Link>
          <button
            onClick={handleSignOut}
            className="btn-logout"
          >
            Вийти
          </button>
        </div>
      </header>

      <div className="manager-dashboard-content">
        <div className="welcome-section">
          <h2>Вітаємо, {getFullName()}!</h2>
          <p className="subtitle">Керівник виробництва</p>
        </div>

        <div className="dashboard-cards">
          <div className="dashboard-card">
            <h3>Мій проект</h3>
            <p>Інформація про ваш проект буде тут</p>
          </div>

          <div className="dashboard-card">
            <h3>Статистика</h3>
            <p>Статистика роботи буде тут</p>
          </div>
        </div>
      </div>
    </div>
  )
}

