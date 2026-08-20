import { useEffect, useState } from 'react'
import { supabase, ensureAnonymousLogin } from '../lib/supabase'
import Card from '../components/Card'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { Plus, Trash2, Check } from 'lucide-react'

interface Habit {
  id?: string
  name: string
  type: 'checkbox' | 'counter' | 'value'
  target?: number
  records?: { id?: string; date: string; value: number }[]
}

export default function Habits() {
  const [habits, setHabits] = useState<Habit[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newHabit, setNewHabit] = useState({ name: '', type: 'checkbox' as Habit['type'], target: 1 })
  const [currentMonth, setCurrentMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ensureAnonymousLogin()
    loadHabits()
  }, [])

  async function loadHabits() {
    try {
      const { data, error } = await supabase
        .from('habits')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setHabits(data || [])
    } catch (err) {
      console.error('加载习惯数据失败:', err)
      setError('数据加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddHabit() {
    if (!newHabit.name.trim()) return
    await ensureAnonymousLogin()

    const { error } = await supabase.from('habits').insert([{
      name: newHabit.name,
      type: newHabit.type,
      target: newHabit.target,
    }])

    if (error) {
      setError('添加失败，请重试')
      return
    }

    setHabits([{ ...newHabit, id: Date.now().toString() }, ...habits])
    setShowForm(false)
    setNewHabit({ name: '', type: 'checkbox', target: 1 })
  }

  async function handleDeleteHabit(id: string) {
    const { error } = await supabase.from('habits').delete().eq('id', id)
    if (error) {
      setError('删除失败，请重试')
      return
    }
    setHabits(habits.filter(h => h.id !== id))
  }

  async function handleToggleHabit(habitId: string, date: string) {
    const habit = habits.find(h => h.id === habitId)
    if (!habit) return

    const existingRecord = habit.records?.find(r => r.date === date)
    
    if (existingRecord) {
      const { error } = await supabase.from('habit_records').delete().eq('id', existingRecord.id)
      if (error) {
        setError('操作失败，请重试')
        return
      }
      setHabits(habits.map(h => 
        h.id === habitId 
          ? { ...h, records: h.records?.filter(r => r.id !== existingRecord.id) }
          : h
      ))
    } else {
      const { error } = await supabase.from('habit_records').insert([{
        habit_id: habitId,
        date,
        value: 1,
      }])
      if (error) {
        setError('操作失败，请重试')
        return
      }
      setHabits(habits.map(h =>
        h.id === habitId
          ? { ...h, records: [...(h.records || []), { id: Date.now().toString(), date, value: 1 }] }
          : h
      ))
    }
  }

  const monthStart = startOfMonth(new Date(currentMonth))
  const monthEnd = endOfMonth(new Date(currentMonth))
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

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
          <h1 className="section-title">习惯健康</h1>
          <p className="section-subtitle" style={{ marginBottom: 0 }}>培养好习惯，遇见更好的自己</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          <Plus className="w-4 h-4" />
          <span>新增习惯</span>
        </button>
      </div>

      {/* Add Form */}
      {showForm && (
        <Card title="新增习惯" subtitle="设定你的每日目标">
          <div className="space-y-4">
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-mid)', marginBottom: '6px' }}>习惯名称</label>
              <input
                type="text"
                value={newHabit.name}
                onChange={(e) => setNewHabit({ ...newHabit, name: e.target.value })}
                className="form-input"
                placeholder="例如：每天喝水8杯"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-mid)', marginBottom: '6px' }}>打卡方式</label>
              <div className="flex gap-2">
                {(['checkbox', 'counter', 'value'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setNewHabit({ ...newHabit, type })}
                    className={`badge ${newHabit.type === type ? 'badge-green' : ''}`}
                    style={newHabit.type === type ? { background: 'var(--color-success-light)', color: '#4A7060' } : { background: 'var(--bg-sidebar)', color: 'var(--text-mid)' }}
                  >
                    {type === 'checkbox' ? '✓ 勾选' : type === 'counter' ? '数 计数' : '值 数值'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={handleAddHabit} className="btn-primary" style={{ flex: 1 }}>确认添加</button>
              <button onClick={() => setShowForm(false)} className="btn-secondary">取消</button>
            </div>
          </div>
        </Card>
      )}

      {/* Habits List */}
      <div className="space-y-4">
        {habits.map(habit => (
          <Card
            key={habit.id}
            title={habit.name}
            subtitle={`共 ${habit.records?.length || 0} 次打卡`}
            action={
              <button onClick={() => habit.id && handleDeleteHabit(habit.id)} className="p-1 text-[var(--text-light)] hover:text-[var(--color-accent-pink)] transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            }
          >
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => habit.id && handleToggleHabit(habit.id, format(new Date(), 'yyyy-MM-dd'))}
                className={`btn-secondary ${habit.records?.some(r => r.date === format(new Date(), 'yyyy-MM-dd') && r.value > 0) ? 'active' : ''}`}
                style={habit.records?.some(r => r.date === format(new Date(), 'yyyy-MM-dd') && r.value > 0) ? { background: 'var(--color-success-light)', borderColor: 'var(--color-success)', color: 'var(--color-success)' } : {}}
              >
                <Check className="w-4 h-4 inline mr-1" />
                今日已打卡
              </button>
            </div>
          </Card>
        ))}
      </div>

      {/* Heatmap */}
      <Card title="打卡热力图" subtitle={`${currentMonth} 月`}>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {
              const prev = new Date(currentMonth)
              prev.setMonth(prev.getMonth() - 1)
              setCurrentMonth(format(prev, 'yyyy-MM'))
            }}
            className="btn-secondary"
            style={{ padding: '6px 12px' }}
          >
            ←
          </button>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: '13px', color: 'var(--text-mid)' }}>{currentMonth}</span>
          <button
            onClick={() => {
              const next = new Date(currentMonth)
              next.setMonth(next.getMonth() + 1)
              setCurrentMonth(format(next, 'yyyy-MM'))
            }}
            className="btn-secondary"
            style={{ padding: '6px 12px' }}
          >
            →
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
          {weekDays.map(day => (
            <div key={day} style={{ textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '11px', color: 'var(--text-light)', padding: '4px' }}>
              {day}
            </div>
          ))}
          {days.map((day: Date, idx: number) => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const hasRecord = habits.some(h => 
              h.records?.some(r => r.date === dateStr && r.value > 0)
            )
            return (
              <div
                key={idx}
                style={{
                  aspectRatio: '1',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontFamily: 'var(--font-ui)',
                  backgroundColor: hasRecord ? 'var(--color-success)' : format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? 'var(--bg-sidebar)' : 'var(--bg-sidebar)',
                  color: hasRecord ? 'white' : 'var(--text-mid)',
                }}
              >
                {format(day, 'd')}
              </div>
            )
          })}
        </div>
      </Card>

      {error && (
        <div style={{ padding: '12px 16px', background: 'var(--color-accent-pink-light)', borderRadius: '10px', fontFamily: 'var(--font-ui)', fontSize: '13px', color: '#B06868', textAlign: 'center' }}>
          {error} - <button onClick={loadHabits} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>重试</button>
        </div>
      )}
    </div>
  )
}
