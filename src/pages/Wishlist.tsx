import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
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
        // 调用相机
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
        // 上传图片
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
        // 提取商品名称
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
      <div className="flex items-center justify-center py-20">
        <div className="text-stone-400">加载中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-700">待买清单</h1>
        <div className="flex gap-2">
          <button
            onClick={() => handleImageRecognition('camera')}
            disabled={recognizing}
            className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50 text-sm"
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">拍照识图</span>
          </button>
          <button
            onClick={() => handleImageRecognition('upload')}
            disabled={recognizing}
            className="flex items-center gap-2 px-3 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors disabled:opacity-50 text-sm"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">上传图片</span>
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">手动添加</span>
          </button>
        </div>
      </div>

      {/* 添加表单 */}
      {showForm && (
        <Card title="添加商品">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-600 mb-1">商品名称</label>
              <input
                type="text"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                placeholder="输入商品名称"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">预估价格</label>
                <input
                  type="number"
                  step="0.01"
                  value={newItem.price}
                  onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-600 mb-1">优先级</label>
                <select
                  value={newItem.urgency}
                  onChange={(e) => setNewItem({ ...newItem, urgency: e.target.value as 'high' | 'medium' | 'low' })}
                  className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-300"
                >
                  <option value="high">紧急</option>
                  <option value="medium">一般</option>
                  <option value="low">不急</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleAddItem}
                className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
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

      {/* 清单列表 */}
      <Card title={`待购买 (${items.filter(i => !i.purchased).length})`}>
        {items.length === 0 ? (
          <p className="text-center text-stone-400 py-8">清单是空的，开始添加想买的商品吧</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                  item.purchased ? 'bg-stone-50 opacity-50' : 'bg-white hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleTogglePurchased(item.id!)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      item.purchased ? 'bg-emerald-500 border-emerald-500' : 'border-stone-300 hover:border-emerald-400'
                    }`}
                  >
                    {item.purchased && <Check className="w-4 h-4 text-white" />}
                  </button>
                  <div>
                    <p className={`font-medium ${item.purchased ? 'line-through text-stone-400' : 'text-stone-700'}`}>
                      {item.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {item.price && <span className="text-sm text-stone-400">¥{item.price}</span>}
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        item.urgency === 'high' ? 'bg-rose-100 text-rose-600' :
                        item.urgency === 'medium' ? 'bg-amber-100 text-amber-600' :
                        'bg-emerald-100 text-emerald-600'
                      }`}>
                        {item.urgency === 'high' ? '紧急' : item.urgency === 'medium' ? '一般' : '不急'}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => item.id && handleDeleteItem(item.id)}
                  className="p-1 text-stone-400 hover:text-rose-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {error && (
        <div className="p-4 bg-rose-50 text-rose-600 rounded-lg text-center">
          {error} - <button onClick={loadItems} className="underline">重试</button>
        </div>
      )}
    </div>
  )
}

function Check({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
