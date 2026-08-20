import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Card from '../components/Card'
import StatCard from '../components/StatCard'
import { TrendingUp, TrendingDown, Wallet, Heart, Activity, ShoppingBag } from 'lucide-react'

export default function Dashboard() {
  const [todayExpenses, setTodayExpenses] = useState(0)
  const [todayIncome, setTodayIncome] = useState(0)
  const [habitsProgress, setHabitsProgress] = useState({ done: 0, total: 0 })
  const [latestWeight, setLatestWeight] = useState<number | null>(null)
  const [wishlistCount, setWishlistCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    try {
      const today = new Date().toISOString().split('T')[0]
      setError(null)

      // 加载今日收支
      const [expensesRes, incomeRes] = await Promise.all([
        supabase.from('expenses').select('amount').eq('type', 'expense').gte('date', today),
        supabase.from('expenses').select('amount').eq('type', 'income').gte('date', today),
      ])
      if (expensesRes.error) throw expensesRes.error
      if (incomeRes.error) throw incomeRes.error
      
      setTodayExpenses(expensesRes.data?.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0) || 0)
      setTodayIncome(incomeRes.data?.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0) || 0)

      // 加载习惯数据
      const habitsRes = await supabase.from('habits').select('*')
      if (habitsRes.error) throw habitsRes.error
      if (habitsRes.data) {
        let done = 0
        habitsRes.data.forEach((habit: { records?: { date: string; value: number }[] }) => {
          const record = habit.records?.find((r) => r.date === today && r.value > 0)
          if (record) done++
        })
        setHabitsProgress({ done, total: habitsRes.data.length })
      }

      // 加载最新体重
      const weightRes = await supabase
        .from('body_records')
        .select('weight')
        .order('date', { ascending: false })
        .limit(1)
      if (!weightRes.error && weightRes.data?.[0]) {
        setLatestWeight(weightRes.data[0].weight)
      }

      // 加载待买清单数量
      const wishlistRes = await supabase
        .from('wishlist')
        .select('*', { count: 'exact', head: true })
        .eq('purchased', false)
      if (!wishlistRes.error) {
        setWishlistCount(wishlistRes.count || 0)
      }
    } catch (err) {
      console.error('加载仪表盘数据失败:', err)
      setError('数据加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-stone-400">加载中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 今日概览标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-700">今日概览</h1>
          <p className="text-stone-400 mt-1">
            {new Date().toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </p>
        </div>
        {error && (
          <button
            onClick={loadDashboardData}
            className="text-sm text-rose-500 hover:text-rose-600"
          >
            重试
          </button>
        )}
      </div>

      {/* 收支卡片 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="app-card p-4 bg-gradient-to-br from-rose-50 to-rose-100/50">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-5 h-5 text-rose-500" />
            <span className="text-sm text-stone-500">今日支出</span>
          </div>
          <p className="text-2xl font-semibold text-rose-600">¥{todayExpenses.toFixed(2)}</p>
        </div>
        <div className="app-card p-4 bg-gradient-to-br from-emerald-50 to-emerald-100/50">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            <span className="text-sm text-stone-500">今日收入</span>
          </div>
          <p className="text-2xl font-semibold text-emerald-600">¥{todayIncome.toFixed(2)}</p>
        </div>
      </div>

      {/* 快捷统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="习惯打卡"
          value={`${habitsProgress.done}/${habitsProgress.total}`}
          unit="个"
          trend={{ value: 5, positive: true }}
        />
        <StatCard
          label="当前体重"
          value={latestWeight || '--'}
          unit="kg"
        />
        <StatCard
          label="待买清单"
          value={wishlistCount}
          unit="件"
        />
        <StatCard
          label="本月预算"
          value="5000"
          unit="元"
          trend={{ value: 12, positive: false }}
        />
      </div>

      {/* 快捷入口 */}
      <Card title="快速入口">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '记账理财', icon: Wallet, path: '/finance', color: 'bg-rose-100 text-rose-600' },
            { label: '习惯打卡', icon: Heart, path: '/habits', color: 'bg-pink-100 text-pink-600' },
            { label: '减脂健身', icon: Activity, path: '/fitness', color: 'bg-orange-100 text-orange-600' },
            { label: '待买清单', icon: ShoppingBag, path: '/wishlist', color: 'bg-amber-100 text-amber-600' },
            { label: '每日一读', icon: '📖', path: '/daily-read', color: 'bg-blue-100 text-blue-600' },
            { label: '设置', icon: '⚙️', path: '/settings', color: 'bg-stone-100 text-stone-600' },
          ].map((item, idx) => (
            <a
              key={idx}
              href={item.path}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white/50 hover:bg-white hover:shadow-md transition-all duration-200"
            >
              <span className={`w-10 h-10 rounded-full ${item.color} flex items-center justify-center text-lg`}>
                {typeof item.icon === 'string' ? item.icon : <item.icon className="w-5 h-5" />}
              </span>
              <span className="text-xs text-stone-600">{item.label}</span>
            </a>
          ))}
        </div>
      </Card>
    </div>
  )
}
