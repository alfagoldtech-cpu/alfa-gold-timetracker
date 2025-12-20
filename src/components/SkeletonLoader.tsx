import './SkeletonLoader.css'

interface SkeletonLoaderProps {
  type?: 'table' | 'card' | 'list' | 'text' | 'button'
  rows?: number
  className?: string
}

export default function SkeletonLoader({ 
  type = 'text', 
  rows = 1,
  className = '' 
}: SkeletonLoaderProps) {
  if (type === 'table') {
    return (
      <div className={`skeleton-table ${className}`}>
        {Array.from({ length: rows || 5 }).map((_, i) => (
          <div key={i} className="skeleton-table-row">
            <div className="skeleton-cell" style={{ width: '20%' }} />
            <div className="skeleton-cell" style={{ width: '25%' }} />
            <div className="skeleton-cell" style={{ width: '15%' }} />
            <div className="skeleton-cell" style={{ width: '15%' }} />
            <div className="skeleton-cell" style={{ width: '15%' }} />
            <div className="skeleton-cell" style={{ width: '10%' }} />
          </div>
        ))}
      </div>
    )
  }

  if (type === 'card') {
    return (
      <div className={`skeleton-card ${className}`}>
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-line skeleton-text" />
        <div className="skeleton-line skeleton-text" style={{ width: '60%' }} />
      </div>
    )
  }

  if (type === 'list') {
    return (
      <div className={`skeleton-list ${className}`}>
        {Array.from({ length: rows || 3 }).map((_, i) => (
          <div key={i} className="skeleton-list-item">
            <div className="skeleton-line skeleton-text" />
          </div>
        ))}
      </div>
    )
  }

  if (type === 'button') {
    return <div className={`skeleton-button ${className}`} />
  }

  // Default: text
  return (
    <div className={`skeleton-text-container ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div 
          key={i} 
          className="skeleton-line skeleton-text"
          style={{ width: i === rows - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  )
}

