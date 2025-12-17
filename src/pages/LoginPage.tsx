import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { resetPasswordForEmail } from '../lib/auth'
import './LoginPage.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await signIn(email, password)
      navigate('/dashboard')
    } catch (err: any) {
      let errorMessage = 'Помилка входу. Перевірте email та пароль.'
      
      if (err.message) {
        // Перекладаємо помилки від Supabase на українську
        if (err.message.includes('Invalid login credentials') || err.message.includes('invalid_credentials')) {
          errorMessage = 'Невірний email або пароль. Перевірте дані та спробуйте ще раз.'
        } else if (err.message.includes('Email not confirmed')) {
          errorMessage = 'Email не підтверджено. Перевірте вашу пошту.'
        } else if (err.message.includes('User not found')) {
          errorMessage = 'Користувача не знайдено. Перевірте email.'
        } else {
          errorMessage = err.message
        }
      }
      
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setResetLoading(true)

    try {
      await resetPasswordForEmail(resetEmail)
      setResetSuccess(true)
    } catch (err: any) {
      setError(err.message || 'Помилка відправки email для скидання пароля.')
    } finally {
      setResetLoading(false)
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
          <h1 className="login-title">
            {showForgotPassword ? 'Скидання пароля' : 'Вітаємо!'}
          </h1>
          <p className="login-subtitle">
            {showForgotPassword 
              ? 'Введіть вашу електронну пошту, щоб отримати посилання для скидання пароля'
              : 'Введіть свою електронну пошту та пароль, щоб увійти у свій аккаунт'
            }
          </p>
        </div>

        <form className="login-form" onSubmit={showForgotPassword ? handleForgotPassword : handleSubmit}>
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          {resetSuccess && (
            <div style={{ 
              padding: '12px', 
              backgroundColor: '#d4edda', 
              color: '#155724', 
              borderRadius: '8px',
              marginBottom: '16px',
              textAlign: 'center'
            }}>
              Перевірте вашу пошту. Ми надіслали посилання для скидання пароля.
            </div>
          )}
          
          {!showForgotPassword ? (
            <>
              <div className="form-group">
                <label htmlFor="email" className="form-label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  placeholder="juliasavchyn@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  Пароль
                </label>
                <div className="password-input-wrapper">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Jul12sav45"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Приховати пароль' : 'Показати пароль'}
                  >
                    {showPassword ? (
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

              <div className="form-options">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Запам'ятати мене</span>
                </label>
                <button
                  type="button"
                  className="forgot-password"
                  onClick={() => {
                    setShowForgotPassword(true)
                    setError(null)
                    setResetSuccess(false)
                  }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Забули пароль?
                </button>
              </div>

              <button 
                type="submit" 
                className="login-button"
                disabled={loading}
              >
                {loading ? 'Вхід...' : 'Увійти'}
              </button>
            </>
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="resetEmail" className="form-label">
                  Email для скидання пароля
                </label>
                <input
                  id="resetEmail"
                  type="email"
                  className="form-input"
                  placeholder="example@email.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  type="submit" 
                  className="login-button"
                  disabled={resetLoading || !resetEmail}
                  style={{ flex: 1 }}
                >
                  {resetLoading ? 'Відправка...' : 'Відправити'}
                </button>
                <button 
                  type="button" 
                  className="login-button"
                  onClick={() => {
                    setShowForgotPassword(false)
                    setResetEmail('')
                    setResetSuccess(false)
                    setError(null)
                  }}
                  style={{ 
                    flex: 1, 
                    backgroundColor: '#e2e8f0',
                    color: '#2d3748'
                  }}
                >
                  Назад
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )
}

