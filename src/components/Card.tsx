interface Props {
  title?: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export default function Card({ title, subtitle, action, children, className = '' }: Props) {
  return (
    <div className={`app-card fade-in ${className}`}>
      {(title || subtitle || action) && (
        <div className="app-card-header flex items-center justify-between">
          <div>
            {title && (
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, color: 'var(--text-dark)', margin: 0 }}>
                {title}
              </h2>
            )}
            {subtitle && (
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-light)', margin: '4px 0 0' }}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="app-card-body">
        {children}
      </div>
    </div>
  )
}
