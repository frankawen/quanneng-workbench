interface Props {
  title: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}

export default function Card({ title, subtitle, children, className = '' }: Props) {
  return (
    <div className={`app-card p-5 ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && (
            <h2 className="text-lg font-semibold text-stone-700">{title}</h2>
          )}
          {subtitle && (
            <p className="text-sm text-stone-400 mt-1">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
