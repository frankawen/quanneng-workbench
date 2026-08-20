import { useEffect, useState } from 'react'
import { supabase, ensureAnonymousLogin } from '../lib/supabase'
import Card from '../components/Card'
import { Camera, Plus, Trash2, ShoppingBag } from 'lucide-react'
import { recognizeImage } from '../utils/recognize'

interface WishlistItem {
  id?: string
  name: string
  price?: number
  urgency: 'high' | 'medium' | 'low'
  purchased?: boolean
  createdAt?: string
}

export default function Wishlist() {
  const [items, setItems] = useState<WishlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', price: '', urgency: 'medium' as 'high' | 'medium' | 'low' })
  const [error, setError] = useState<string | null>(null)
  const [recognizing, setRecognizing] = useState(false)

  useEffect(() => {
    ensureAnonymousLogin()
    loadItems()
  }, [])

  async function loadItems() {
    try {
      const { data, error } = await supabase
        .from('wishlist')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setItems(data || [])
    } catch (err) {
      console.error('加载待买清单失败:', err)
      setError('数据加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddItem() {
    if (!newItem.name.trim()) return

    const { error } = await supabase.from('wishlist').insert([{
      name: newItem.name,
      price: newItem.price ? parseFloat(newItem.price) : null,
      urgency: newItem.urgency,
    }])

    if (error) {
      setError('添加失败，请重试')
      return
    }

    setItems([{ ...newItem, id: Date.now().toString(), price: newItem.price ? parseFloat(newItem.price) : undefined }, ...items])
    setShowForm(false)
    setNewItem({ name: '', price: '', urgency: 'medium' })
  }

  async function handleDeleteItem(id: string) {
    const { error } = await supabase.from('wishlist').delete().eq('id', id)
    if (error) {
      setError('删除失败，请重试')
      return
    }
    setItems(items.filter(item => item.id !== id))
  }

  async function handleTogglePurchased(id: string) {
    const item = items.find(i => i.id === id)
    if (!item) return

    const { error } = await supabase
      .from('wishlist')
      .update({ purchased: !item.purchased })
      .eq('id', id)

    if (error) {
      setError('操作失败，请重试')
      return
    }
    setItems(items.map(i => i.id === id ? { ...i, purchased: !i.purchased } : i))
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
        const match = text.match(/商品名[:：]?\s*(.+)/) || text.match(/(.{2,20}?)[,.，。]/)
        if (match) {
          setNewItem({ name: match[1].trim(), price: '', urgency: 'medium' })
          setShowForm(true)
        }
      }
    } catch (err) {
      console.error('AI识别失败:', err)
    }
  }

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
          <h1 className="section-title">待买清单</h1>
          <p className="section-subtitle">记录想买的商品，理性消费不踩坑</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => handleImageRecognition('camera')}
            disabled={recognizing}
            className="btn-secondary"
            style={{ opacity: recognizing ? 0.5 : 1 }}
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">拍照识图</span>
          </button>
          <button
            onClick={() => handleImageRecognition('upload')}
            disabled={recognizing}
            className="btn-secondary"
            style={{ opacity: recognizing ? 0.5 : 1 }}
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">上传图片</span>
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn-primary"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">手动添加</span>
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <Card title="添加商品">
          <div className="space-y-4">
            <div>
              <label className="block" style={{ fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-light)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                商品名称
              </label>
              <input
                type="text"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                className="form-input"
                placeholder="输入商品名称"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block" style={{ fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-light)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  预估价格
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newItem.price}
                  onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                  className="form-input"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block" style={{ fontFamily: 'var(--font-ui)', fontSize: '12px', color: 'var(--text-light)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  优先级
                </label>
                <select
                  value={newItem.urgency}
                  onChange={(e) => setNewItem({ ...newItem, urgency: e.target.value as 'high' | 'medium' | 'low' })}
                  className="form-input"
                >
                  <option value="high">紧急</option>
                  <option value="medium">一般</option>
                  <option value="low">不急</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleAddItem}
                className="btn-primary flex-1 justify-center"
              >
                确认添加
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

      {/* Items List */}
      <Card title={`待购买 (${items.filter(i => !i.purchased).length})`}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-light)', fontFamily: 'var(--font-ui)', fontSize: '14px' }}>
            清单是空的，开始添加想买的商品吧
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: '10px',
                  background: item.purchased ? 'var(--bg-sidebar)' : 'white',
                  opacity: item.purchased ? 0.6 : 1,
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <button
                    onClick={() => handleTogglePurchased(item.id!)}
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      border: `2px solid ${item.purchased ? 'var(--color-success)' : 'var(--border)'}`,
                      background: item.purchased ? 'var(--color-success)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'all 0.15s',
                    }}
                  >
                    {item.purchased && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                  <div style={{ minWidth: 0 }}>
                    <p style={{
                      fontFamily: 'var(--font-ui)',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: item.purchased ? 'var(--text-light)' : 'var(--text-dark)',
                      textDecoration: item.purchased ? 'line-through' : 'none',
                    }}>
                      {item.name}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      {item.price && (
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '13px', color: 'var(--text-light)' }}>
                          ¥{item.price}
                        </span>
                      )}
                      <span className={`badge ${
                        item.urgency === 'high' ? 'badge-pink' :
                        item.urgency === 'medium' ? 'badge-amber' :
                        'badge-green'
                      }`}>
                        {item.urgency === 'high' ? '紧急' : item.urgency === 'medium' ? '一般' : '不急'}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => item.id && handleDeleteItem(item.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    color: 'var(--text-light)',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-accent-pink)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-light)')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {error && (
        <div style={{ padding: '16px', background: 'var(--color-accent-pink-light)', borderRadius: '12px', textAlign: 'center', fontFamily: 'var(--font-ui)', fontSize: '14px', color: '#B06868' }}>
          {error} -{' '}
          <button
            onClick={loadItems}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
          >
            重试
          </button>
        </div>
      )}
    </div>
  )
}
