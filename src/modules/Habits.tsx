import { CheckSquare, Target, Flame } from 'lucide-react';
import { MODULE_META, MODULES } from '../constants';

export default function Habits() {
  return (
    <div className="module active">
      <header className="mhead">
        <h1>{MODULE_META[MODULES.HABITS].label}</h1>
        <p>习惯养成 · 打卡记录 · 连续天数</p>
      </header>
      <div className="card">
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ink-soft)' }}>
          <CheckSquare size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
          <h3 style={{ marginBottom: 8 }}>模块开发中</h3>
          <p>将包含：多类型习惯、打卡日历、连续天数、数据可视化</p>
        </div>
      </div>
    </div>
  );
}