import { FileText, Plus, Search, Camera } from 'lucide-react';
import { MODULE_META, MODULES } from '../constants';

export default function Wordbank() {
  return (
    <div className="module active">
      <header className="mhead">
        <h1>{MODULE_META[MODULES.WORDBANK].label}</h1>
        <p>自定义添加 · 拍照 OCR · 分类浏览 · 每日一读收藏</p>
      </header>
      <div className="card">
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-ink-soft)' }}>
          <FileText size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
          <h3 style={{ marginBottom: 8 }}>模块开发中</h3>
          <p>将包含：词条 CRUD、OCR 识别、标签分类、每日推送、一键收藏</p>
        </div>
      </div>
    </div>
  );
}