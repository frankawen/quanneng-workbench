// ============================================================
// 应用配置常量 - 统一管理所有环境变量与魔法值
// ============================================================

/** Supabase 配置 */
export const SUPABASE_CONFIG = {
  URL: import.meta.env.VITE_SUPABASE_URL ?? 'https://wentfvkdfecrfelgmdix.supabase.co',
  ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_JoMfWIeViOhdQONkYiGagQ_Oen6GgGJ',
} as const;

/** Agnes AI 配置 */
export const AGNES_CONFIG = {
  API_KEY: import.meta.env.VITE_AGNES_API_KEY ?? 'sk-GHilR4bfh8ulWTCtRBipDdEvosUniYt1OT2ur5Vi9JlfzZf5',
  BASE_URL: import.meta.env.VITE_AGNES_URL ?? 'https://apihub.agnes-ai.com/v1',
  MODEL: import.meta.env.VITE_AGNES_MODEL ?? 'agnes-2.5-flash',
} as const;

/** 应用版本号 - 由 Vite 从 git describe 注入 */
export const BUILD_VERSION = import.meta.env.VITE_BUILD_VERSION ?? 'dev';

/** 数据库表名 */
export const TABLES = {
  EXPENSES: 'expenses',
  BUDGETS: 'budgets',
  HABITS: 'habits',
  HABIT_RECORDS: 'habit_records',
  BODY_RECORDS: 'body_records',
  WORKOUT_PLANS: 'workout_plans',
  WISHLIST: 'wishlist',
  NEWS: 'news',
  SHIJING: 'shijing',
  QUOTES: 'quotes',
  COMMENTS: 'comments',
} as const;

/** 模块路由配置 */
export const MODULES = {
  OVERVIEW: 'overview',
  READ: 'read',
  FINANCE: 'finance',
  HABITS: 'habits',
  FITNESS: 'fitness',
  WISHLIST: 'wishlist',
  WORDBANK: 'wordbank',
} as const;

/** 模块显示配置 */
export const MODULE_META: Record<string, { label: string; icon: string; order: number }> = {
  [MODULES.OVERVIEW]: { label: '总览', icon: 'LayoutDashboard', order: 0 },
  [MODULES.READ]: { label: '每日一读', icon: 'BookOpen', order: 1 },
  [MODULES.FINANCE]: { label: '记账', icon: 'Wallet', order: 2 },
  [MODULES.HABITS]: { label: '习惯', icon: 'CheckSquare', order: 3 },
  [MODULES.FITNESS]: { label: '健身', icon: 'Dumbbell', order: 4 },
  [MODULES.WISHLIST]: { label: '心愿单', icon: 'Heart', order: 5 },
  [MODULES.WORDBANK]: { label: '词语积累', icon: 'FileText', order: 6 },
};

/** 新闻源配置 */
export const NEWS_SOURCES = {
  CHINANEWS: '中新网',
  ZAKER: 'ZAKER',
  SSPAI: '少数派',
  SSPAI_MORNING: '派早报',
  JIEMIAN: '界面快报',
  RMWB: '人民网',
  GUSHIWEN: '古诗文网',
  SHIJING: '诗经',
} as const;

/** 默认分页大小 */
export const DEFAULT_PAGE_SIZE = 20;

/** 请求重试配置 */
export const FETCH_RETRY = {
  MAX_RETRIES: 3,
  BASE_DELAY_MS: 800,
} as const;

/** 本地存储键 */
export const STORAGE_KEYS = {
  THEME: 'qnwb_theme',
  LAST_MODULE: 'qnwb_last_module',
  ONBOARDING_DONE: 'qnwb_onboarding_done',
} as const;

/** 日期格式 */
export const DATE_FORMATS = {
  ISO: 'yyyy-MM-dd',
  DISPLAY: 'MM月dd日',
  FULL: 'yyyy年MM月dd日',
  TIME: 'HH:mm',
} as const;

/** 预设起始日期（用于周/月统计） */
export const EPOCH_START = new Date(2026, 0, 1); // 2026-01-01

/** 动画时长 */
export const ANIMATION = {
  FAST: 150,
  NORMAL: 250,
  SLOW: 350,
} as const;

/** 阴影层级 */
export const SHADOWS = {
  XS: '0 1px 2px rgba(61,50,41,0.04)',
  SM: '0 2px 8px rgba(61,50,41,0.06)',
  MD: '0 4px 16px rgba(61,50,41,0.08)',
  LG: '0 8px 30px rgba(61,50,41,0.12)',
} as const;

/** 圆角规范 */
export const RADIUS = {
  SM: '10px',
  MD: '12px',
  LG: '16px',
} as const;

/** 间距规范 */
export const SPACING = {
  1: '8px',
  2: '12px',
  3: '16px',
  4: '20px',
  5: '28px',
} as const;

/** 字号规范 */
export const FONT_SIZE = {
  SM: '13px',
  BASE: '15px',
  LG: '17px',
} as const;