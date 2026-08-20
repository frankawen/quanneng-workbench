import { useEffect, useState } from 'react'
import { supabase, ensureAnonymousLogin } from '../lib/supabase'
import Card from '../components/Card'
import StatCard from '../components/StatCard'
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'

interface QuickAction {
  label: string
  path: string
  icon: React.ReactNode
  color: string
  bg: string
}

export default function Dashboard() {
  const [todayExpenses, setTodayExpenses] = useState(0)
  const [todayIncome, setTodayIncome] = useState(0)
  const [habitsProgress, setHabitsProgress] = useState({ done: 0, total: 0 })
  const [latestWeight, setLatestWeight] = useState<number | null>(null)
  const [wishlistCount, setWishlistCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ensureAnonymousLogin()
    loadDashboardData()
  }, [])

  async function loadDashboardData() {
    try {
      const today = new Date().toISOString().split('T')[0]
      setError(null)

      const [expensesRes, incomeRes, habitsRes, weightRes, wishlistRes] = await Promise.all([
        supabase.from('expenses').select('amount').eq('type', 'expense').gte('date', today),
        supabase.from('expenses').select('amount').eq('type', 'income').gte('date', today),
        supabase.from('habits').select('*'),
        supabase.from('body_records').select('weight').order('date', { ascending: false }).limit(1),
        supabase.from('wishlist').select('*', { count: 'exact', head: true }).eq('purchased', false),
      ])

      if (expensesRes.error) throw expensesRes.error
      if (incomeRes.error) throw incomeRes.error
      if (habitsRes.error) throw habitsRes.error
      if (weightRes.error) throw weightRes.error
      if (wishlistRes.error) throw wishlistRes.error

      setTodayExpenses(expensesRes.data?.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0) || 0)
      setTodayIncome(incomeRes.data?.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0) || 0)

      if (habitsRes.data) {
        let done = 0
        habitsRes.data.forEach((habit: { records?: { date: string; value: number }[] }) => {
          const record = habit.records?.find((r) => r.date === today && r.value > 0)
          if (record) done++
        })
        setHabitsProgress({ done, total: habitsRes.data.length })
      }

      if (weightRes.data?.[0]) {
        setLatestWeight(weightRes.data[0].weight)
      }

      setWishlistCount(wishlistRes.count || 0)
    } catch (err) {
      console.error('加载仪表盘数据失败:', err)
      setError('数据加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const quickActions: QuickAction[] = [
    { label: '记账理财', path: '/finance', icon: <ArrowRight className="w-5 h-5" />, color: 'var(--color-accent-pink)', bg: 'var(--color-accent-pink-light)' },
    { label: '习惯打卡', path: '/habits', icon: <ArrowRight className="w-5 h-5" />, color: 'var(--color-success)', bg: 'var(--color-success-light)' },
    { label: '减脂健身', path: '/fitness', icon: <ArrowRight className="w-5 h-5" />, color: 'var(--color-accent-amber)', bg: 'var(--color-accent-amber-light)' },
    { label: '待买清单', path: '/wishlist', icon: <ArrowRight className="w-5 h-5" />, color: 'var(--color-primary)', bg: 'var(--color-primary-light)' },
    { label: '每日一读', path: '/daily-read', icon: <ArrowRight className="w-5 h-5" />, color: 'var(--color-accent-blue)', bg: 'var(--color-accent-blue-light)' },
    { label: '设置', path: '/settings', icon: <ArrowRight className="w-5 h-5" />, color: 'var(--text-mid)', bg: 'var(--bg-sidebar)' },
  ]

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
      <div className="flex items-end justify-between">
        <div>
          <h1 className="section-title">今日概览</h1>
          <p className="section-subtitle" style={{ marginBottom: 0 }}>
            {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
        </div>
        {error && (
          <button onClick={loadDashboardData} style={{ fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--color-accent-pink)', background: 'none', border: 'none', cursor: 'pointer' }}>
            重试
          </button>
        )}
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <StatCard
          label="今日支出"
          value={`¥${todayExpenses.toFixed(2)}`}
          accent="pink"
        />
        <StatCard
          label="今日收入"
          value={`¥${todayIncome.toFixed(2)}`}
          accent="green"
        />
        <StatCard
          label="习惯打卡"
          value={`${habitsProgress.done}/${habitsProgress.total}`}
          unit="个"
          accent="blue"
        />
        <StatCard
          label="当前体重"
          value={latestWeight || '--'}
          unit="kg"
          accent="amber"
        />
      </div>

      {/* Quick Actions */}
      <Card title="快捷入口" subtitle="点击访问各功能模块">
        <div className="action-grid">
          {quickActions.map((action, idx) => (
            <a key={idx} href={action.path} className="action-item">
              <div className="action-icon" style={{ backgroundColor: action.bg, color: action.color }}>
                {action.icon}
              </div>
              <span className="action-label">{action.label}</span>
            </a>
          ))}
        </div>
      </Card>

      {/* Today's Highlight - Empty State */}
      <Card subtitle="今日暂无新动态，开始记录你的生活吧">
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-light)', fontFamily: 'var(--font-ui)', fontSize: '13px' }}>
          <div style={{ marginBottom: '8px', fontSize: '24px' }}>🌿</div>
          <p>打开一个模块，开始记录今天的点滴</p>
        </div>
      </Card>
    </div>
  )
}
