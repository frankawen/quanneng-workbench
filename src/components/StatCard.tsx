interface Props {
  label: string
  value: string | number
  unit?: string
  trend?: { value: number; positive: boolean }
  className?: string
}

export default function StatCard({ label, value, unit, trend, className = '' }: Props) {
  return (
    <div className={`app-card p-4 ${className}`}>
      <p className="text-sm text-stone-400 mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-stone-700">{value}</span>
        {unit && <span className="text-sm text-stone-400">{unit}</span>}
      </div>
      {trend && (
        <p className={`text-xs mt-2 ${trend.positive ? 'text-rose-500' : 'text-emerald-500'}`}>
          {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
        </p>
      )}
    </div>
  )
}
