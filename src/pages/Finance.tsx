import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Card from '../components/Card'
import { addDays, format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { TrendingUp, TrendingDown, Camera, Plus, Trash2 } from 'lucide-react'

interface Expense {
  id?: string
  amount: number
  type: 'income' | 'expense'
  category: string
  description: string
  date: string
  createdAt?: string
}

export default function Finance() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    amount: '',
    type: 'expense' as 'income' | 'expense',
    category: '餐饮',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
  })
  const [error, setError] = useState<string | null>(null)

  const categories = ['餐饮', '交通', '购物', '娱乐', '医疗', '教育', '住房', '收入', '其他']

  useEffect(() => {
    loadExpenses()
  }, [])

  async function loadExpenses() {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false })
        .limit(100)
      
      if (error) throw error
      setExpenses(data || [])
    } catch (err) {
      console.error('加载记账数据失败:', err)
      setError('数据加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    const newExpense: Expense = {
      ...formData,
      amount: parseFloat(formData.amount),
    }

    const { error } = await supabase.from('expenses').insert([newExpense])
    if (error) {
      setError('添加失败，请重试')
      return
    }

    setExpenses([newExpense, ...expenses])
    setShowForm(false)
    setFormData({
      amount: '',
      type: 'expense',
      category: '餐饮',
      description: '',
      date: format(new Date(), 'yyyy-MM-dd'),
    })
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) {
      setError('删除失败，请重试')
      return
    }
    setExpenses(expenses.filter(e => e.id !== id))
  }

  const todayExpenses = expenses
    .filter(e => e.type === 'expense' && e.date === format(new Date(), 'yyyy-MM-dd'))
    .reduce((sum, e) => sum + e.amount, 0)
  
  const todayIncome = expenses
    .filter(e => e.type === 'income' && e.date === format(new Date(), 'yyyy-MM-dd'))
    .reduce((sum, e) => sum + e.amount, 0)

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
        <h1 className="text-2xl font-bold text-stone-700">记账理财</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">记一笔</span>
        </button>
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

      {/* 添加表单 */}
      {showForm && (
        <Card title="记一笔">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">金额</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-rose-300"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">类型</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'income' | 'expense' })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-rose-300"
                >
                  <option value="expense">支出</option>
                  <option value="income">收入</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-600 mb-1">分类</label>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFormData({ ...formData, category: cat })}
                    className={`px-3 py-1 rounded-full text-sm transition-colors ${
                      formData.category === cat
                        ? 'bg-rose-500 text-white'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-600 mb-1">备注</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-rose-300"
                placeholder="添加备注..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-600 mb-1">日期</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition-colors"
              >
                确认
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 transition-colors"
              >
                取消
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* 记账列表 */}
      <Card title="最近记录">
        {expenses.length === 0 ? (
          <p className="text-center text-stone-400 py-8">还没有记录，点击"记一笔"开始记账吧</p>
        ) : (
          <div className="space-y-2">
            {expenses.slice(0, 10).map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-stone-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    expense.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                  }`}>
                    {expense.type === 'income' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="font-medium text-stone-700">{expense.category}</p>
                    <p className="text-sm text-stone-400">{expense.description || expense.date}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-semibold ${
                    expense.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                  }`}>
                    {expense.type === 'income' ? '+' : '-'}¥{expense.amount.toFixed(2)}
                  </span>
                  <button
                    onClick={() => handleDelete(expense.id!)}
                    className="p-1 text-stone-400 hover:text-rose-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {error && (
        <div className="p-4 bg-rose-50 text-rose-600 rounded-lg text-center">
          {error} - <button onClick={loadExpenses} className="underline">重试</button>
        </div>
      )}
    </div>
  )
}
