import { NavLink, Outlet } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Wallet, 
  Heart, 
  Activity, 
  ShoppingBag, 
  BookOpen 
} from 'lucide-react'

const navItems = [
  { path: '/', label: '今日概览', icon: LayoutDashboard },
  { path: '/finance', label: '记账理财', icon: Wallet },
  { path: '/habits', label: '习惯健康', icon: Heart },
  { path: '/fitness', label: '减脂健身', icon: Activity },
  { path: '/wishlist', label: '待买清单', icon: ShoppingBag },
  { path: '/daily-read', label: '每日一读', icon: BookOpen },
]

export default function Layout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#faf8f5] to-[#f5f0eb]">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-white/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-stone-700 tracking-tight">
            全能工作台
          </h1>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-rose-100 text-rose-600 shadow-sm'
                        : 'text-stone-500 hover:bg-stone-100 hover:text-stone-700'
                    }`
                  }
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
        </div>
      </header>

      {/* 移动端底部导航 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-stone-200 z-50">
        <div className="flex justify-around py-2">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'text-rose-500'
                      : 'text-stone-400'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                <span className="text-xs">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-4 py-6 pb-24 md:pb-6">
        <Outlet />
      </main>
    </div>
  )
}
