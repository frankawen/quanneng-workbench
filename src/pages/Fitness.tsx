import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Card from '../components/Card'
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
      <div className="flex items-center justify-center py-20">
        <div className="text-stone-400">加载中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-700">减脂健身</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPlanForm(!showPlanForm)}
            className="px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-sm"
          >
            周计划
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-sm"
          >
            <Plus className="w-4 h-4 inline mr-1" />
            记录体重
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="当前体重">
          <p className="text-3xl font-bold text-stone-700">{records[0]?.weight || '--'}<span className="text-base font-normal text-stone-400 ml-1">kg</span></p>
        </Card>
        <Card title="体脂率">
          <p className="text-3xl font-bold text-stone-700">{records[0]?.bodyFat || '--'}<span className="text-base font-normal text-stone-400 ml-1">%</span></p>
        </Card>
        <Card title="BMI">
          <p className="text-3xl font-bold text-stone-700">{records[0]?.bmi || '--'}</p>
        </Card>
        <Card title="本周运动">
          <p className="text-3xl font-bold text-stone-700">{plans.filter(p => p.week === format(new Date(), 'yyyy-Www')).length}<span className="text-base font-normal text-stone-400 ml-1">次</span></p>
        </Card>
      </div>

      {/* 体重趋势图 */}
      <Card title="7日体重趋势">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="weight" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316' }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* 添加体重表单 */}
      {showForm && (
        <Card title="记录体重">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">体重 (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={newRecord.weight}
                  onChange={(e) => setNewRecord({ ...newRecord, weight: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-300"
                  placeholder="65.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">体脂率 (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={newRecord.bodyFat}
                  onChange={(e) => setNewRecord({ ...newRecord, bodyFat: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-300"
                  placeholder="20.5"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-600 mb-1">备注</label>
              <input
                type="text"
                value={newRecord.notes}
                onChange={(e) => setNewRecord({ ...newRecord, notes: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-300"
                placeholder="今天感觉不错"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSubmitRecord}
                className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                确认记录
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* 周计划表单 */}
      {showPlanForm && (
        <Card title="编辑周计划">
          <div className="space-y-3">
            {plans.map((plan, idx) => (
              <div key={plan.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg">
                <span className="px-2 py-1 bg-orange-100 text-orange-600 rounded text-sm font-medium">
                  周{plan.day}
                </span>
                <span className="flex-1 text-stone-700">{plan.exercise}</span>
                {plan.sets && <span className="text-sm text-stone-400">{plan.sets}组×{plan.reps}</span>}
                <button onClick={() => supabase.from('workout_plans').delete().eq('id', plan.id).then(() => loadData())} className="text-stone-400 hover:text-rose-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="添加运动项目..."
                className="flex-1 px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
              <button className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">
                添加
              </button>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <div className="p-4 bg-rose-50 text-rose-600 rounded-lg text-center">
          {error} - <button onClick={loadData} className="underline">重试</button>
        </div>
      )}
    </div>
  )
}
