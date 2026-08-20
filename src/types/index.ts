// 记账相关类型
export interface Expense {
  id?: string
  amount: number
  type: 'income' | 'expense'
  category: string
  description: string
  date: string
  createdAt?: string
}

export interface Budget {
  id?: string
  month: string
  total: number
  categoryBudgets: { category: string; limit: number }[]
  createdAt?: string
}

// 习惯健康类型
export type HabitType = 'checkbox' | 'counter' | 'value'

export interface Habit {
  id?: string
  name: string
  type: HabitType
  target?: number // 目标值（counter/value 类型）
  createdAt?: string
  records?: HabitRecord[]
}

export interface HabitRecord {
  id?: string
  habitId: string
  date: string
  value: number // 打卡值（1=完成，其他=数值）
}

// 减脂健身类型
export interface BodyRecord {
  id?: string
  date: string
  weight: number
  bodyFat?: number
  bmi?: number
  notes?: string
}

export interface WorkoutPlan {
  id?: string
  week: string
  day: number
  exercise: string
  sets?: number
  reps?: number
  duration?: number
  caloriesBurned?: number
}

// 待买清单类型
export interface WishlistItem {
  id?: string
  name: string
  price?: number | null
  urgency: 'high' | 'medium' | 'low'
  purchased?: boolean
  createdAt?: string
}

// 每日一读 - 新闻类型
export interface NewsItem {
  id?: string
  title: string
  source: string
  url: string
  date: string
  category: '国内' | '国际' | '财经' | '科技'
  crawledAt?: string
}

// 每日一读 - 诗经类型
export interface ShijingPoem {
  id?: string
  title: string
  section: string // 国风/小雅/大雅/颂
  content: string
  translation?: string
  notes?: string
  appreciation?: string
  crawledAt?: string
}

// 每日一读 - 名句类型
export interface FamousQuote {
  id?: string
  quote: string
  author: string
  source?: string
  translation?: string
  notes?: string
  appreciation?: string
  crawledAt?: string
}

// 每日一读 - 评论类型
export interface Comment {
  id?: string
  title: string
  subtitle?: string
  author?: string
  date: string
  content?: string
  type: '人民时评' | '纵深' | '现场评论'
  url: string
  crawledAt?: string
}

// 首页数据汇总
export interface DashboardData {
  todayExpenses: number
  todayIncome: number
  habitsToday: number
  totalHabits: number
  latestWeight?: number
  wishlistCount: number
  newsCount: number
}
