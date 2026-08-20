import { useEffect, useState } from 'react'
import { supabase, ensureAnonymousLogin } from '../lib/supabase'
import Card from '../components/Card'
import StatCard from '../components/StatCard'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Plus, Trash2 } from 'lucide-react'
import { format, addDays } from 'date-fns'

interface BodyRecord {
  id?: string
  date: string
  weight: number
  bodyFat?: number
  bmi?: number
  notes?: string
}

interface WorkoutPlan {
  id?: string
  week: string
  day: number
  exercise: string
  sets?: number
  reps?: number
  duration?: number
  caloriesBurned?: number
}

export default function Fitness() {
  const [records, setRecords] = useState<BodyRecord[]>([])
  const [plans, setPlans] = useState<WorkoutPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [newRecord, setNewRecord] = useState({ weight: '', bodyFat: '', notes: '' })
  const [newPlan, setNewPlan] = useState({ week: format(new Date(), 'yyyy-Www'), day: 1, exercise: '', sets: '', reps: '', duration: '', caloriesBurned: '' })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ensureAnonymousLogin()
    loadData()
  }, [])

  async function loadData() {
    try {
      const [recordsRes, plansRes] = await Promise.all([
        supabase.from('body_records').select('*').order('date', { ascending: false }).limit(30),
        supabase.from('workout_plans').select('*').order('week, day'),
      ])
      if (recordsRes.error) throw recordsRes.error
      if (plansRes.error) throw plansRes.error
      setRecords(recordsRes.data || [])
      setPlans(plansRes.data || [])
    } catch (err) {
      console.error('加载健身数据失败:', err)
      setError('数据加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmitRecord() {
    const bmi = newRecord.bodyFat ? parseFloat(newRecord.weight) / Math.pow(parseFloat(newRecord.bodyFat) / 100, 2) : undefined
    const record: BodyRecord = {
      date: format(new Date(), 'yyyy-MM-dd'),
      weight: parseFloat(newRecord.weight),
      bodyFat: newRecord.bodyFat ? parseFloat(newRecord.bodyFat) : undefined,
      bmi: bmi ? parseFloat(bmi.toFixed(2)) : undefined,
      notes: newRecord.notes,
    }

    const { error } = await supabase.from('body_records').insert([record])
    if (error) {
      setError('添加失败，请重试')
      return
    }
    setRecords([record, ...records])
    setShowForm(false)
    setNewRecord({ weight: '', bodyFat: '', notes: '' })
  }

  const chartData = records.slice(0, 7).reverse().map(r => ({
    date: format(new Date(r.date), 'MM/dd'),
    weight: r.weight,
    bodyFat: r.bodyFat,
    bmi: r.bmi,
  }))

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: '14px', color: 'var(--text-light)' }}>加载中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-title">减脂健身</h1>
          <p className="section-subtitle">记录体重变化，科学管理健康</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPlanForm(!showPlanForm)}
            className="btn-secondary"
          >
            周计划
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            记录体重
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard
          label="当前体重"
          value={records[0]?.weight?.toFixed(1) || '--'}
          unit="kg"
          accent="amber"
        />
        <StatCard
          label="体脂率"
          value={records[0]?.bodyFat?.toFixed(1) || '--'}
          unit="%"
          accent="green"
        />
        <StatCard
          label="BMI"
          value={records[0]?.bmi?.toFixed(1) || '--'}
          accent="blue"
        />
        <StatCard
          label="本周运动"
          value={String(plans.filter(p => p.week === format(new Date(), 'yyyy-Www')).length)}
          unit="次"
          accent="pink"
        />
      </div>

      {/* Weight Trend Chart */}
      <Card title="7日体重趋势">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fontFamily: 'var(--font-ui)', fill: 'var(--text-light)' }}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 12, fontFamily: 'var(--font-ui)', fill: 'var(--text-light)' }}
            />
            <Tooltip
              contentStyle={{
                fontFamily: 'var(--font-ui)',
                fontSize: '13px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-card)',
              }}
            />
            <Line
              type="monotone"
              dataKey="weight"
              stroke="var(--color-accent-amber)"
              strokeWidth={2}
              dot={{ fill: 'var(--color-accent-amber)', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Add Weight Form */}
      {showForm && (
        <Card title="记录体重">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block" style={{ fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-light)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  体重 (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={newRecord.weight}
                  onChange={(e) => setNewRecord({ ...newRecord, weight: e.target.value })}
                  className="form-input"
                  placeholder="65.5"
                />
              </div>
              <div>
                <label className="block" style={{ fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-light)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  体脂率 (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={newRecord.bodyFat}
                  onChange={(e) => setNewRecord({ ...newRecord, bodyFat: e.target.value })}
                  className="form-input"
                  placeholder="20.5"
                />
              </div>
            </div>
            <div>
              <label className="block" style={{ fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-light)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                备注
              </label>
              <input
                type="text"
                value={newRecord.notes}
                onChange={(e) => setNewRecord({ ...newRecord, notes: e.target.value })}
                className="form-input"
                placeholder="今天感觉不错"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSubmitRecord}
                className="btn-primary flex-1 justify-center"
              >
                确认记录
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="btn-secondary"
              >
                取消
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Weekly Plan */}
      {showPlanForm && (
        <Card title="编辑周计划">
          <div className="space-y-3">
            {plans.map((plan, idx) => (
              <div key={plan.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'var(--bg-sidebar)', borderRadius: '10px' }}>
                <span className="badge badge-amber">周{plan.day}</span>
                <span style={{ flex: 1, fontFamily: 'var(--font-ui)', fontSize: '14px', color: 'var(--text-dark)' }}>{plan.exercise}</span>
                {plan.sets && (
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-light)' }}>
                    {plan.sets}组 × {plan.reps}次
                  </span>
                )}
                <button
                  onClick={() => supabase.from('workout_plans').delete().eq('id', plan.id).then(() => loadData())}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-light)', transition: 'color 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent-pink)' }}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-light)')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <input
                type="text"
                placeholder="添加运动项目..."
                className="form-input flex-1"
              />
              <button className="btn-primary">
                添加
              </button>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <div style={{ padding: '16px', background: 'var(--color-accent-pink-light)', borderRadius: '12px', textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '14px', color: '#B06868' }}>
          {error} -{' '}
          <button
            onClick={loadData}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
          >
            重试
          </button>
        </div>
      )}
    </div>
  )
}
