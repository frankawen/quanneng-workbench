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
    <div className="page-layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar-card hidden md:flex md:w-56 md:flex-shrink-0">
        <div>
          {/* Logo */}
          <div className="sidebar-logo">
            <div className="sidebar-logo-text">全能工作台</div>
            <div className="sidebar-logo-sub">Life Dashboard</div>
          </div>

          {/* Nav Items */}
          <nav className="flex flex-col gap-1 mt-4">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? 'active' : ''}`
                  }
                >
                  <Icon />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </nav>
        </div>

        {/* Footer */}
        <div className="mt-auto px-4 py-4 text-center">
          <p className="text-xs" style={{ color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
            数据存于云端 · 多端同步
          </p>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 min-w-0">
        {/* Mobile Header */}
        <header className="md:hidden sticky top-0 z-50 bg-[#FAF7F2]/90 backdrop-blur-md border-b border-[#E8E0D5] px-4 py-3 flex items-center justify-between">
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, color: 'var(--text-dark)' }}>
            全能工作台
          </span>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: '11px', color: 'var(--text-light)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Life Dashboard
          </span>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="mobile-nav md:hidden">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `mobile-nav-item ${isActive ? 'active' : ''}`
              }
            >
              <Icon />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
