import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { updatePassword } from '../lib/auth'
import './LoginPage.css'

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setError('Нові паролі не співпадають')
      return
    }

    if (newPassword.length < 6) {
      setError('Пароль повинен містити мінімум 6 символів')
      return
    }

    setLoading(true)

    try {
      await updatePassword(newPassword)
      setSuccess(true)
      setTimeout(() => {
        navigate('/dashboard')
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Помилка зміни пароля')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-content">
        <div className="logo-section">
          <div className="logo">
            <span className="logo-alfa">alfa</span>
            <span className="logo-gold"> gold</span>
          </div>
          <div className="logo-subtitle">ACCOUNTING SERVICE</div>
        </div>

        <div className="login-header">
          <h1 className="login-title">Зміна пароля</h1>
          <p className="login-subtitle">
            Введіть новий пароль для вашого облікового запису
          </p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {success && (
            <div style={{ 
              padding: '12px', 
              backgroundColor: '#d4edda', 
              color: '#155724', 
              borderRadius: '8px',
              marginBottom: '16px',
              textAlign: 'center'
            }}>
              Пароль успішно змінено! Перенаправлення...
            </div>
          )}

          <div className="form-group">
            <label htmlFor="newPassword" className="form-label">
              Новий пароль
            </label>
            <div className="password-input-wrapper">
              <input
                id="newPassword"
                type={showPasswords.new ? 'text' : 'password'}
                className="form-input"
                placeholder="Мінімум 6 символів"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                aria-label={showPasswords.new ? 'Приховати пароль' : 'Показати пароль'}
              >
                {showPasswords.new ? (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7zM10 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                      fill="currentColor"
                    />
                    <path
                      d="M2 2L18 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7zM10 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                      fill="currentColor"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword" className="form-label">
              Підтвердіть новий пароль
            </label>
            <div className="password-input-wrapper">
              <input
                id="confirmPassword"
                type={showPasswords.confirm ? 'text' : 'password'}
                className="form-input"
                placeholder="Введіть пароль ще раз"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                aria-label={showPasswords.confirm ? 'Приховати пароль' : 'Показати пароль'}
              >
                {showPasswords.confirm ? (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7zM10 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                      fill="currentColor"
                    />
                    <path
                      d="M2 2L18 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M10 3C5 3 1.73 7.11 1 10c.73 2.89 4 7 9 7s8.27-4.11 9-7c-.73-2.89-4-7-9-7zM10 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                      fill="currentColor"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              type="submit" 
              className="login-button"
              disabled={loading || success}
              style={{ flex: 1 }}
            >
              {loading ? 'Зміна...' : 'Змінити пароль'}
            </button>
            <button 
              type="button" 
              className="login-button"
              onClick={() => navigate('/dashboard')}
              style={{ 
                flex: 1, 
                backgroundColor: '#e2e8f0',
                color: '#2d3748'
              }}
            >
              Скасувати
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

