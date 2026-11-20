import { useState, useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Wallet,
  CheckSquare,
  Dumbbell,
  Heart,
  FileText,
  Sun,
  Moon,
} from 'lucide-react';
import { MODULES, MODULE_META, BUILD_VERSION } from './constants';

const Overview = lazy(() => import('./modules/Overview'));
const Read = lazy(() => import('./modules/Read'));
const Finance = lazy(() => import('./modules/Finance'));
const Habits = lazy(() => import('./modules/Habits'));
const Fitness = lazy(() => import('./modules/Fitness'));
const Wishlist = lazy(() => import('./modules/Wishlist'));
const Wordbank = lazy(() => import('./modules/Wordbank'));

const MODULE_COMPONENTS: Record<string, React.ComponentType> = {
  [MODULES.OVERVIEW]: Overview,
  [MODULES.READ]: Read,
  [MODULES.FINANCE]: Finance,
  [MODULES.HABITS]: Habits,
  [MODULES.FITNESS]: Fitness,
  [MODULES.WISHLIST]: Wishlist,
  [MODULES.WORDBANK]: Wordbank,
};

const ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  LayoutDashboard,
  BookOpen,
  Wallet,
  CheckSquare,
  Dumbbell,
  Heart,
  FileText,
};

const MODULE_ORDER = Object.values(MODULES).sort((a, b) => MODULE_META[a].order - MODULE_META[b].order);

function Sidebar({ currentModule, onNavigate }: { currentModule: string; onNavigate: (m: string) => void }) {
  return (
    <aside className="sidebar" role="navigation" aria-label="主导航">
      <div className="brand">
        <div className="brand-name">栖·生活工作台</div>
        <div className="brand-sub">QI LIFE WORKBENCH</div>
      </div>
      <nav className="nav">
        {MODULE_ORDER.map((mod) => {
          const meta = MODULE_META[mod];
          const Icon = ICON_MAP[meta.icon];
          const isActive = currentModule === mod;
          return (
            <button
              key={mod}
              className={`nav-btn ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(mod)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{meta.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="side-foot">
        <div>版本: v{BUILD_VERSION}</div>
        <div style={{ marginTop: 4 }}>数据源: Supabase + Agnes AI</div>
      </div>
    </aside>
  );
}

function Topbar({ currentModule }: { currentModule: string }) {
  const meta = MODULE_META[currentModule];
  return (
    <header className="topbar" role="banner">
      <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-ink)' }}>{meta?.label || '栖·生活工作台'}</h1>
    </header>
  );
}

function ModuleOutlet({ module }: { module: string }) {
  const Component = MODULE_COMPONENTS[module];
  if (!Component) return <div className="module active">模块开发中...</div>;

  return (
    <Suspense fallback={<div className="module active"><div className="sk-block" /><div className="sk-block" /></div>}>
      <Component />
    </Suspense>
  );
}

function App() {
  const [currentModule, setCurrentModule] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('qnwb_last_module') || MODULES.OVERVIEW;
    }
    return MODULES.OVERVIEW;
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('qnwb_theme') as 'light' | 'dark') || 'light';
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('qnwb_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('qnwb_last_module', currentModule);
  }, [currentModule]);

  const navigate = (mod: string) => {
    setCurrentModule(mod);
  };

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  return (
    <BrowserRouter>
      <div className="app">
        <Sidebar currentModule={currentModule} onNavigate={navigate} />
        <main className="main">
          <Topbar currentModule={currentModule} />
          <div className="content">
            <Routes>
              {MODULE_ORDER.map((mod) => (
                <Route key={mod} path={`/${mod}`} element={<ModuleOutlet module={mod} />} />
              ))}
              <Route path="/" element={<Navigate to={`/${MODULES.OVERVIEW}`} replace />} />
              <Route path="*" element={<Navigate to={`/${MODULES.OVERVIEW}`} replace />} />
            </Routes>
          </div>
        </main>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
          style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 30 }}
        >
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
      </div>
    </BrowserRouter>
  );
}

export default App;