import { useAuth } from '../contexts/AuthContext'
import { useNavigate, Link } from 'react-router-dom'

export default function Dashboard() {
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

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '40px'
      }}>
        <h1 style={{ fontSize: '32px', color: '#2d3748' }}>Dashboard</h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Link
            to="/change-password"
            style={{
              padding: '10px 20px',
              background: '#4299e1',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              textDecoration: 'none'
            }}
          >
            Змінити пароль
          </Link>
          <button
            onClick={handleSignOut}
            style={{
              padding: '10px 20px',
              background: '#ff6b35',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: '600'
            }}
          >
            Вийти
          </button>
        </div>
      </div>

      <div style={{ 
        background: 'white', 
        padding: '24px', 
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ marginBottom: '20px', color: '#2d3748' }}>Інформація про користувача</h2>
        
        <div style={{ marginBottom: '16px' }}>
          <strong>Email:</strong> {authUser?.email}
        </div>
        
        {user && (
          <>
            <div style={{ marginBottom: '16px' }}>
              <strong>ID користувача:</strong> {user.id}
            </div>
            {user.name && (
              <div style={{ marginBottom: '16px' }}>
                <strong>Ім'я:</strong> {user.surname} {user.name} {user.middle_name}
              </div>
            )}
            {user.phone && (
              <div style={{ marginBottom: '16px' }}>
                <strong>Телефон:</strong> {user.phone}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

