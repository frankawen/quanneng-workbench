import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('请配置 Supabase 环境变量')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 确保匿名登录（必须在首次操作前调用）
export async function ensureAnonymousLogin() {
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) {
    console.error('匿名登录失败:', error)
    return false
  }
  return true
}
