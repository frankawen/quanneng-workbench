// ============================================================
// API 客户端 - 对接 API 网关 Edge Function
// 替代直接调用 PostgREST
// ============================================================
import { SUPABASE_CONFIG } from '../constants';

const API_BASE = `${SUPABASE_CONFIG.URL}/functions/v1/api-gateway`;

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

function buildUrl(path: string, params?: Record<string, any>): string {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }
  return url.toString();
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { params, headers, ...fetchOpts } = opts;
  const url = buildUrl(path, params);

  const res = await fetch(url, {
    ...fetchOpts,
    cache: 'no-store',
    headers: {
      apikey: SUPABASE_CONFIG.ANON_KEY,
      Authorization: `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }

  if (res.status === 204) return undefined as any;
  return res.json();
}

// ============================================================
// 通用 CRUD
// ============================================================
export const api = {
  /** 查询列表 */
  list<T>(table: string, opts: {
    select?: string;
    order?: string;
    limit?: number;
    offset?: number;
    filters?: Record<string, string | number | boolean>;
  } = {}): Promise<{ data: T[]; meta: { cached: boolean; fresh: boolean } }> {
    const params: Record<string, any> = {};
    if (opts.select) params.select = opts.select;
    if (opts.order) params.order = opts.order;
    if (opts.limit) params.limit = opts.limit;
    if (opts.offset) params.offset = opts.offset;
    if (opts.filters) {
      Object.entries(opts.filters).forEach(([k, v]) => {
        params[`filter.${k}`] = v;
      });
    }
    return request(`/api-gateway/${table}`, { method: 'GET', params });
  },

  /** 单条查询 */
  get<T>(table: string, id: string): Promise<T> {
    return request(`/api-gateway/${table}/${id}`, { method: 'GET' });
  },

  /** 插入 */
  create<T>(table: string, data: Record<string, any> | Record<string, any>[]): Promise<T[]> {
    return request(`/api-gateway/${table}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** 更新 */
  update<T>(table: string, id: string, data: Record<string, any>): Promise<T[]> {
    return request(`/api-gateway/${table}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** 删除 */
  delete(table: string, id: string): Promise<void> {
    return request(`/api-gateway/${table}/${id}`, { method: 'DELETE' });
  },
};

// ============================================================
// 业务封装（结合 useSWR 使用）
// ============================================================
export const queries = {
  // 账本
  expenses: {
    list: (month?: string) => api.list('expenses', {
      order: '-date',
      limit: 100,
      filters: month ? { date: `gte.${month}-01`, 'date..lte': `${month}-31` } : undefined,
    }),
    create: (data: { type: 'expense' | 'income'; amount: number; category: string; date: string; note?: string }) =>
      api.create('expenses', data),
    update: (id: string, data: Partial<{ type: 'expense' | 'income'; amount: number; category: string; date: string; note?: string }>) =>
      api.update('expenses', id, data),
    delete: (id: string) => api.delete('expenses', id),
  },

  // 预算
  budgets: {
    list: () => api.list('budgets', { order: '-month', limit: 12 }),
    create: (data: { month: string; amount: number }) => api.create('budgets', data),
    update: (id: string, data: { amount: number }) => api.update('budgets', id, data),
  },

  // 习惯
  habits: {
    list: () => api.list('habits', { order: 'created_at' }),
    create: (data: { name: string; type: 'check' | 'count' | 'value' }) => api.create('habits', data),
    update: (id: string, data: Partial<{ name: string; type: 'check' | 'count' | 'value' }>) => api.update('habits', id, data),
    delete: (id: string) => api.delete('habits', id),
  },

  habitRecords: {
    list: (habitId: string, month?: string) => api.list('habit_records', {
      order: '-date',
      limit: 100,
      filters: { habit_id: habitId, ...(month ? { date: `gte.${month}-01`, 'date..lte': `${month}-31` } : {}) },
    }),
    upsert: (data: { habit_id: string; date: string; checked?: boolean; count?: number; value?: number }) =>
      api.create('habit_records', data),
  },

  // 身体记录
  bodyRecords: {
    list: (limit = 50) => api.list('body_records', { order: '-date', limit }),
    create: (data: { date: string; weight: number; body_fat?: number; height?: number; note?: string }) =>
      api.create('body_records', data),
  },

  // 健身计划
  workoutPlans: {
    list: (week?: string) => api.list('workout_plans', {
      order: 'day',
      filters: week ? { week } : undefined,
    }),
    create: (data: { week: string; day: number; exercise: string; sets?: number; reps?: number; duration?: number; calories_burned?: number }) =>
      api.create('workout_plans', data),
  },

  // 心愿单
  wishlist: {
    list: () => api.list('wishlist', { order: '-created_at' }),
    create: (data: { name: string; price?: number; priority: '高' | '中' | '低'; category?: string; note?: string }) =>
      api.create('wishlist', data),
    update: (id: string, data: Partial<{ name: string; price?: number; priority: '高' | '中' | '低'; category?: string; note?: string; purchased: boolean }>) =>
      api.update('wishlist', id, data),
    delete: (id: string) => api.delete('wishlist', id),
  },

  // 新闻
  news: {
    list: (source?: string, limit = 20) => api.list('news', {
      order: '-crawled_at',
      limit,
      filters: source ? { source } : undefined,
    }),
  },

  // 诗经
  shijing: {
    list: (limit = 20) => api.list('shijing', { order: '-crawled_at', limit }),
  },

  // 名句
  quotes: {
    list: (limit = 20) => api.list('quotes', { order: '-crawled_at', limit }),
  },

  // 评论
  comments: {
    list: (limit = 20) => api.list('comments', { order: '-crawled_at', limit }),
  },
};

// ============================================================
// SWR Key 生成器
// ============================================================
export const swrKeys = {
  expenses: (month?: string) => month ? ['expenses', month] : ['expenses', 'all'],
  budgets: () => ['budgets'],
  habits: () => ['habits'],
  habitRecords: (habitId: string, month?: string) => month ? ['habitRecords', habitId, month] : ['habitRecords', habitId],
  bodyRecords: (limit?: number) => ['bodyRecords', limit ?? 50],
  workoutPlans: (week?: string) => week ? ['workoutPlans', week] : ['workoutPlans'],
  wishlist: () => ['wishlist'],
  news: (source?: string, limit?: number) => ['news', source ?? 'all', limit ?? 20],
  shijing: (limit?: number) => ['shijing', limit ?? 20],
  quotes: (limit?: number) => ['quotes', limit ?? 20],
  comments: (limit?: number) => ['comments', limit ?? 20],
};