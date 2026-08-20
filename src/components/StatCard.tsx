interface Props {
  label: string
  value: string | number
  unit?: string
  trend?: { value: number; positive: boolean }
  className?: string
  accent?: 'pink' | 'blue' | 'amber' | 'green'
}

export default function StatCard({ label, value, unit, trend, className = '', accent }: Props) {
  const accentColors: Record<string, string> = {
    pink: 'var(--color-accent-pink)',
    blue: 'var(--color-accent-blue)',
    amber: 'var(--color-accent-amber)',
    green: 'var(--color-success)',
  }
  const color = accent ? accentColors[accent] : 'var(--text-dark)'

  return (
    <div className={`stat-card ${className}`} style={{ borderColor: accent ? `${accentColors[accent]}30` : undefined }}>
      <p className="stat-label">{label}</p>
      <div className="stat-value" style={{ color }}>
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {trend && (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: '11px', color: trend.positive ? 'var(--color-accent-pink)' : 'var(--color-success)', marginTop: '6px' }}>
          {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
        </p>
      )}
    </div>
  )
}
