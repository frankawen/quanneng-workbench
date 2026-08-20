import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
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
      // 取消打卡
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
      // 打卡
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

  // 生成热力图日期
  const monthStart = startOfMonth(new Date(currentMonth))
  const monthEnd = endOfMonth(new Date(currentMonth))
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

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
        <h1 className="text-2xl font-bold text-stone-700">习惯健康</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-xl hover:bg-pink-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">新增习惯</span>
        </button>
      </div>

      {/* 添加习惯表单 */}
      {showForm && (
        <Card title="新增习惯">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-600 mb-1">习惯名称</label>
              <input
                type="text"
                value={newHabit.name}
                onChange={(e) => setNewHabit({ ...newHabit, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-pink-300"
                placeholder="例如：每天喝水8杯"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-600 mb-1">打卡方式</label>
              <div className="flex gap-2">
                {(['checkbox', 'counter', 'value'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setNewHabit({ ...newHabit, type })}
                    className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                      newHabit.type === type
                        ? 'bg-pink-500 text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {type === 'checkbox' ? '✓ 勾选' : type === 'counter' ? '数 计数' : '值 数值'}
                  </button>
                ))}
              </div>
            </div>
            {(newHabit.type === 'counter' || newHabit.type === 'value') && (
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">目标值</label>
                <input
                  type="number"
                  value={newHabit.target}
                  onChange={(e) => setNewHabit({ ...newHabit, target: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleAddHabit}
                className="flex-1 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
              >
                确认添加
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

      {/* 习惯列表 */}
      <div className="space-y-4">
        {habits.map(habit => (
          <Card
            key={habit.id}
            title={habit.name}
            subtitle={`共 ${habit.records?.length || 0} 次打卡`}
            className="relative"
          >
            <button
              onClick={() => habit.id && handleDeleteHabit(habit.id)}
              className="absolute top-4 right-4 p-1 text-stone-400 hover:text-rose-500 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => habit.id && handleToggleHabit(habit.id, format(new Date(), 'yyyy-MM-dd'))}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  habit.records?.some(r => r.date === format(new Date(), 'yyyy-MM-dd') && r.value > 0)
                    ? 'bg-pink-500 text-white'
                    : 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                }`}
              >
                <Check className="w-4 h-4 inline mr-1" />
                今日已打卡
              </button>
            </div>
          </Card>
        ))}
      </div>

      {/* 30天热力图 */}
      <Card title="打卡热力图">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {
              const prev = new Date(currentMonth)
              prev.setMonth(prev.getMonth() - 1)
              setCurrentMonth(format(prev, 'yyyy-MM'))
            }}
            className="px-3 py-1 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors"
          >
            ←
          </button>
          <span className="font-medium text-stone-700">{currentMonth}</span>
          <button
            onClick={() => {
              const next = new Date(currentMonth)
              next.setMonth(next.getMonth() + 1)
              setCurrentMonth(format(next, 'yyyy-MM'))
            }}
            className="px-3 py-1 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors"
          >
            →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekDays.map(day => (
            <div key={day} className="text-center text-xs text-stone-400 py-1">
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
                className={`aspect-square rounded flex items-center justify-center text-xs ${
                  hasRecord
                    ? 'bg-pink-500 text-white'
                    : format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                    ? 'bg-stone-200 text-stone-600'
                    : 'bg-stone-100 text-stone-400'
                }`}
              >
                {format(day, 'd')}
              </div>
            )
          })}
        </div>
      </Card>

      {error && (
        <div className="p-4 bg-rose-50 text-rose-600 rounded-lg text-center">
          {error} - <button onClick={loadHabits} className="underline">重试</button>
        </div>
      )}
    </div>
  )
}
