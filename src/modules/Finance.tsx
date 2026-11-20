import { Wallet, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { MODULE_META, MODULES } from '../constants';

export default function Finance() {
  return (
    <div className="module active">
      <header className="mhead">
        <h1>{MODULE_META[MODULES.FINANCE].label}</h1>
        <p>收支记录 · 预算管理 · 趋势分析</p>
      </header>
      <div className="card">
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ink-soft)' }}>
          <Wallet size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
          <h3 style={{ marginBottom: 8 }}>模块开发中</h3>
          <p>将包含：快速记账、分类统计、月度预算、数据导出</p>
        </div>
      </div>
    </div>
  );
}