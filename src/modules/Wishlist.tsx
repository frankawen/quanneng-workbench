import { Heart, Tag, Gift } from 'lucide-react';
import { MODULE_META, MODULES } from '../constants';

export default function Wishlist() {
  return (
    <div className="module active">
      <header className="mhead">
        <h1>{MODULE_META[MODULES.WISHLIST].label}</h1>
        <p>心愿清单 · 优先级 · 进度追踪</p>
      </header>
      <div className="card">
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ink-soft)' }}>
          <Heart size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
          <h3 style={{ marginBottom: 8 }}>模块开发中</h3>
          <p>将包含：分类管理、优先级排序、价格追踪、达成记录</p>
        </div>
      </div>
    </div>
  );
}