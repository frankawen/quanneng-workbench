import { useEffect, useState } from 'react'
import { supabase, ensureAnonymousLogin } from '../lib/supabase'
import Card from '../components/Card'
import { TrendingUp, TrendingDown, Camera, Plus, Trash2, ShoppingBag } from 'lucide-react'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { recognizeImage } from '../utils/recognize'

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
  const [recognizing, setRecognizing] = useState(false)

  const categories = ['餐饮', '交通', '购物', '娱乐', '医疗', '教育', '住房', '收入', '其他']

  useEffect(() => {
    ensureAnonymousLogin()
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
    await ensureAnonymousLogin()
    
    const newExpense: Expense = {
      ...formData,
      amount: parseFloat(formData.amount),
    }

    const { error } = await supabase.from('expenses').insert([newExpense])
    if (error) {
      console.error('插入错误详情:', error)
      setError(`添加失败: ${error.message}，请重试`)
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

  async function handleImageRecognition(inputType: 'camera' | 'upload') {
    setRecognizing(true)
    try {
      let imageBase64: string
      
      if (inputType === 'camera') {
        const cameraInput = document.createElement('input')
        cameraInput.type = 'file'
        cameraInput.accept = 'image/*'
        cameraInput.capture = 'environment'
        cameraInput.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0]
          if (file) {
            imageBase64 = await readFileAsBase64(file)
            await processImage(imageBase64)
          }
        }
        cameraInput.click()
      } else {
        const fileInput = document.createElement('input')
        fileInput.type = 'file'
        fileInput.accept = 'image/*'
        fileInput.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0]
          if (file) {
            imageBase64 = await readFileAsBase64(file)
            await processImage(imageBase64)
          }
        }
        fileInput.click()
      }
    } catch (err) {
      console.error('识别失败:', err)
      setError('识图失败，请重试')
    } finally {
      setRecognizing(false)
    }
  }

  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function processImage(base64: string) {
    try {
      const result = await recognizeImage(base64)
      if (result?.data?.choices?.[0]?.message?.content) {
        const text = result.data.choices[0].message.content
        const amountMatch = text.match(/金额[:：]?\s*([\d.]+)/)
        const categoryMatch = text.match(/分类[:：]?\s*(\w+)/)
        
        if (amountMatch) {
          setFormData({
            ...formData,
            amount: amountMatch[1],
          })
          if (categoryMatch && categories.includes(categoryMatch[1])) {
            setFormData({
              ...formData,
              amount: amountMatch[1],
              category: categoryMatch[1],
            })
          }
        }
      }
    } catch (err) {
      console.error('AI识别失败:', err)
    }
  }

  const todayExpenses = expenses
    .filter(e => e.type === 'expense' && e.date === format(new Date(), 'yyyy-MM-dd'))
    .reduce((sum: number, e: { amount: number }) => sum + e.amount, 0)
  
  const todayIncome = expenses
    .filter(e => e.type === 'income' && e.date === format(new Date(), 'yyyy-MM-dd'))
    .reduce((sum: number, e: { amount: number }) => sum + e.amount, 0)

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
          <h1 className="section-title">记账理财</h1>
          <p className="section-subtitle" style={{ marginBottom: 0 }}>管理你的收支，记录每一笔开销</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" />
          <span>记一笔</span>
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="stat-card" style={{ borderTop: '3px solid var(--color-accent-pink)' }}>
          <p className="stat-label">今日支出</p>
          <div className="stat-value" style={{ color: 'var(--color-accent-pink)' }}>
            ¥{todayExpenses.toFixed(2)}
          </div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--color-success)' }}>
          <p className="stat-label">今日收入</p>
          <div className="stat-value" style={{ color: 'var(--color-success)' }}>
            ¥{todayIncome.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <Card title="记一笔" subtitle="填写收支信息">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Image Recognition Buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleImageRecognition('camera')}
                disabled={recognizing}
                className="btn-secondary"
                style={{ borderColor: 'var(--color-accent-blue)', color: 'var(--color-accent-blue)' }}
              >
                <Camera className="w-4 h-4" />
                <span>拍照识图</span>
              </button>
              <button
                type="button"
                onClick={() => handleImageRecognition('upload')}
                disabled={recognizing}
                className="btn-secondary"
                style={{ borderColor: 'var(--color-accent-pink)', color: 'var(--color-accent-pink)' }}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>上传图片</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-mid)', marginBottom: '6px' }}>金额</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="form-input"
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-mid)', marginBottom: '6px' }}>类型</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'income' | 'expense' })}
                  className="form-input"
                >
                  <option value="expense">支出</option>
                  <option value="income">收入</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-mid)', marginBottom: '6px' }}>分类</label>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFormData({ ...formData, category: cat })}
                    className={`badge ${formData.category === cat ? 'badge-pink' : ''}`}
                    style={formData.category === cat ? { background: 'var(--color-accent-pink-light)', color: '#B06868' } : { background: 'var(--bg-sidebar)', color: 'var(--text-mid)' }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-mid)', marginBottom: '6px' }}>备注</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="form-input"
                placeholder="添加备注..."
              />
            </div>

            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-mid)', marginBottom: '6px' }}>日期</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="form-input"
              />
            </div>

            <div className="flex gap-3">
              <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                确认
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn-secondary"
              >
                取消
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Expense List */}
      <Card title="最近记录" subtitle="近10笔交易">
        {expenses.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-light)', fontFamily: 'var(--font-ui)', fontSize: '13px' }}>
            还没有记录，点击"记一笔"开始记账吧
          </div>
        ) : (
          <div>
            {expenses.slice(0, 10).map((expense) => (
              <div key={expense.id} className="expense-row">
                <div className="expense-left">
                  <div className={`expense-icon ${expense.type}`}>
                    {expense.type === 'income' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="expense-name">{expense.category}</div>
                    <div className="expense-desc">{expense.description || expense.date}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`expense-amount ${expense.type}`}>
                    {expense.type === 'income' ? '+' : '-'}¥{expense.amount.toFixed(2)}
                  </span>
                  <button
                    onClick={() => expense.id && handleDelete(expense.id)}
                    className="p-1 text-[var(--text-light)] hover:text-[var(--color-accent-pink)] transition-colors"
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
        <div style={{ padding: '12px 16px', background: 'var(--color-accent-pink-light)', borderRadius: '10px', fontFamily: 'var(--font-ui)', fontSize: '13px', color: '#B06868', textAlign: 'center' }}>
          {error} - <button onClick={loadExpenses} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>重试</button>
        </div>
      )}
    </div>
  )
}
