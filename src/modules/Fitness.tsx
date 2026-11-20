import { Dumbbell, Activity, Zap } from 'lucide-react';
import { MODULE_META, MODULES } from '../constants';

export default function Fitness() {
  return (
    <div className="module active">
      <header className="mhead">
        <h1>{MODULE_META[MODULES.FITNESS].label}</h1>
        <p>训练计划 · 动作记录 · 身体数据</p>
      </header>
      <div className="card">
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ink-soft)' }}>
          <Dumbbell size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
          <h3 style={{ marginBottom: 8 }}>模块开发中</h3>
          <p>将包含：训练模板、组数记录、体测追踪、进度图表</p>
        </div>
      </div>
    </div>
  );
}