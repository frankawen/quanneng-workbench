import {
  LayoutDashboard,
  TrendingUp,
  BookOpen,
  Heart,
  Dumbbell,
  CheckSquare,
  Wallet,
  FileText,
} from 'lucide-react';
import { MODULE_META, MODULES } from '../constants';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  LayoutDashboard,
  BookOpen,
  Wallet,
  CheckSquare,
  Dumbbell,
  Heart,
  FileText,
};

export default function Overview() {
  const stats = [
    { label: '今日阅读', value: '3', unit: '篇', icon: BookOpen, color: 'sage' },
    { label: '支出记录', value: '¥128', unit: '', icon: TrendingUp, color: 'accent' },
    { label: '打卡习惯', value: '5', unit: '/ 8', icon: CheckSquare, color: 'gold' },
    { label: '运动时长', value: '45', unit: 'min', icon: Dumbbell, color: 'pink' },
  ];

  const otherModules = Object.entries(MODULE_META).filter(([k]) => k !== MODULES.OVERVIEW);

  return (
    <div className="module active">
      <header className="mhead">
        <h1>{MODULE_META[MODULES.OVERVIEW].label}</h1>
        <p>今日概览 · 数据自动同步</p>
      </header>

      <div className="stats">
        {stats.map((s, i) => (
          <div key={i} className={`stat ${s.color}`}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">
              {s.value}
              <span className="stat-unit">{s.unit}</span>
            </div>
            <s.icon className="stat-icon" size={28} style={{ position: 'absolute', right: 16, top: 16, opacity: 0.2 }} />
          </div>
        ))}
      </div>

      <section className="card">
        <h2 className="card-title">快捷入口</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
          {otherModules.map(([key, meta]) => {
            const Icon = ICON_MAP[meta.icon];
            return (
              <a key={key} href={`/${key}`} className="card" style={{ textAlign: 'center', padding: '24px 12px', textDecoration: 'none', color: 'inherit' }}>
                <div style={{ marginBottom: 8, color: 'var(--color-accent)' }}>
                  <Icon size={28} />
                </div>
                <div style={{ fontWeight: 500 }}>{meta.label}</div>
              </a>
            );
          })}
        </div>
      </section>
    </div>
  );
}