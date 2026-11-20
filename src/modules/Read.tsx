import { BookOpen, Clock, Sparkles } from 'lucide-react';
import { MODULE_META, MODULES } from '../constants';

export default function Read() {
  return (
    <div className="module active">
      <header className="mhead">
        <h1>{MODULE_META[MODULES.READ].label}</h1>
        <p>每日一读 · 名句积累 · 阅读笔记</p>
      </header>
      <div className="card">
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ink-soft)' }}>
          <BookOpen size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
          <h3 style={{ marginBottom: 8 }}>模块开发中</h3>
          <p>将包含：每日推荐文章、名句收藏、阅读进度、OCR 识别入库</p>
        </div>
      </div>
    </div>
  );
}