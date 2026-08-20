import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Card from '../components/Card'
import { Newspaper, BookOpen, MessageSquare, PenTool } from 'lucide-react'

type TabType = 'news' | 'shijing' | 'quotes' | 'comments'

interface NewsItem {
  id?: string
  title: string
  source: string
  url: string
  date: string
  category: string
}

interface ShijingPoem {
  id?: string
  title: string
  section: string
  content: string
}

interface FamousQuote {
  id?: string
  quote: string
  author: string
  source?: string
}

interface Comment {
  id?: string
  title: string
  subtitle?: string
  author?: string
  date: string
  type: string
  url: string
}

export default function DailyRead() {
  const [activeTab, setActiveTab] = useState<TabType>('news')
  const [news, setNews] = useState<NewsItem[]>([])
  const [shijing, setShijing] = useState<ShijingPoem[]>([])
  const [quotes, setQuotes] = useState<FamousQuote[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [newsRes, shijingRes, quotesRes, commentsRes] = await Promise.all([
        supabase.from('news').select('*').order('date', { ascending: false }).limit(5),
        supabase.from('shijing').select('*').order('title').limit(10),
        supabase.from('quotes').select('*').order('crawled_at', { ascending: false }).limit(10),
        supabase.from('comments').select('*').order('date', { ascending: false }).limit(5),
      ])

      if (newsRes.error) throw newsRes.error
      if (shijingRes.error) throw shijingRes.error
      if (quotesRes.error) throw quotesRes.error
      if (commentsRes.error) throw commentsRes.error

      setNews(newsRes.data || [])
      setShijing(shijingRes.data || [])
      setQuotes(quotesRes.data || [])
      setComments(commentsRes.data || [])
    } catch (err) {
      console.error('加载每日一读数据失败:', err)
      setError('数据加载失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'news', label: '新闻', icon: <Newspaper className="w-4 h-4" /> },
    { id: 'shijing', label: '诗经', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'quotes', label: '名句', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'comments', label: '评论', icon: <PenTool className="w-4 h-4" /> },
  ]

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
        <h1 className="text-2xl font-bold text-stone-700">每日一读</h1>
        <button onClick={loadData} className="text-sm text-stone-500 hover:text-stone-700">
          刷新
        </button>
      </div>

      {/* 标签导航 */}
      <div className="flex gap-1 p-1 bg-stone-100 rounded-xl overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-stone-700 shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* 新闻栏目 */}
      {activeTab === 'news' && (
        <Card title="界面快报">
          <div className="space-y-3">
            {news.length === 0 ? (
              <p className="text-center text-stone-400 py-8">暂无新闻数据</p>
            ) : (
              news.map((item, idx) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-stone-50 transition-colors"
                >
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xs font-medium">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-stone-700 line-clamp-2">{item.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-stone-400">{item.source}</span>
                      <span className="text-xs text-stone-300">·</span>
                      <span className="text-xs text-stone-400">{item.date}</span>
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        </Card>
      )}

      {/* 诗经栏目 */}
      {activeTab === 'shijing' && (
        <Card title="诗经选读">
          <div className="grid gap-4">
            {shijing.length === 0 ? (
              <p className="text-center text-stone-400 py-8">暂无诗经数据</p>
            ) : (
              shijing.slice(0, 5).map((poem) => (
                <div key={poem.id} className="p-4 bg-stone-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-stone-700">{poem.title}</h3>
                    <span className="text-xs px-2 py-1 bg-rose-100 text-rose-600 rounded-full">
                      {poem.section}
                    </span>
                  </div>
                  <p className="text-stone-600 text-sm line-clamp-3 leading-relaxed">{poem.content}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* 名句栏目 */}
      {activeTab === 'quotes' && (
        <Card title="历代名句">
          <div className="space-y-3">
            {quotes.length === 0 ? (
              <p className="text-center text-stone-400 py-8">暂无名句数据</p>
            ) : (
              quotes.map((quote) => (
                <div key={quote.id} className="p-4 bg-stone-50 rounded-lg">
                  <p className="text-stone-700 leading-relaxed mb-2">"{quote.quote}"</p>
                  <p className="text-sm text-stone-400">
                    {quote.author && <span>—— {quote.author}</span>}
                    {quote.author && quote.source && <span> · </span>}
                    {quote.source && <span>{quote.source}</span>}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* 评论栏目 */}
      {activeTab === 'comments' && (
        <Card title="人民日报评论">
          <div className="space-y-3">
            {comments.length === 0 ? (
              <p className="text-center text-stone-400 py-8">暂无评论数据</p>
            ) : (
              comments.map((comment, idx) => (
                <a
                  key={comment.id}
                  href={comment.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 bg-stone-50 rounded-lg hover:bg-stone-100 transition-colors"
                >
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-medium text-stone-700">{comment.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      comment.type === '人民时评' ? 'bg-rose-100 text-rose-600' :
                      comment.type === '纵深' ? 'bg-blue-100 text-blue-600' :
                      'bg-amber-100 text-amber-600'
                    }`}>
                      {comment.type}
                    </span>
                  </div>
                  {comment.subtitle && (
                    <p className="text-sm text-stone-500 mb-1">{comment.subtitle}</p>
                  )}
                  <p className="text-xs text-stone-400">{comment.date}</p>
                </a>
              ))
            )}
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
