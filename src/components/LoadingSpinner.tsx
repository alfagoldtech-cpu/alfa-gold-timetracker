interface LoadingSpinnerProps {
  message?: string
}

export default function LoadingSpinner({ message = 'Завантаження...' }: LoadingSpinnerProps) {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      fontSize: '18px',
      color: '#2d3748'
    }}>
      {message}
    </div>
  )
}

