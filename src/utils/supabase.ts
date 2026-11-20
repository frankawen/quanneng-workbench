// ============================================================
// Supabase 客户端与查询工具
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG, TABLES, FETCH_RETRY } from '../constants';

/** Supabase 客户端实例（浏览器端使用 anon key） */
export const supabase = createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY, {
  auth: { persistSession: false },
  global: { fetch: (url, opts = {}) => fetch(url, { ...opts, cache: 'no-store' }) },
});

/** 带重试的原始 fetch 封装 */
export async function sbFetch(url: string, opts: RequestInit = {}, retry = FETCH_RETRY.MAX_RETRIES): Promise<any> {
  for (let i = 0; i < retry; i++) {
    const res = await fetch(url, {
      cache: 'no-store',
      ...opts,
      headers: {
        apikey: SUPABASE_CONFIG.ANON_KEY,
        Authorization: `Bearer ${SUPABASE_CONFIG.ANON_KEY}`,
        Accept: 'application/json',
        ...(opts.headers || {}),
      },
    });

    if (res.ok) {
      const text = await res.text().catch(() => '');
      return text ? JSON.parse(text) : null;
    }

    if (res.status < 500) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
    }

    if (i < retry - 1) await new Promise(r => setTimeout(r, FETCH_RETRY.BASE_DELAY_MS * (i + 1)));
  }
  throw new Error('请求失败，请检查网络');
}

/** 通用查询构建器 */
export function buildQueryUrl(table: string, opts: {
  select?: string;
  order?: string;
  limit?: number;
  filter?: { property: string; operator: string; value: any }[];
  range?: [number, number];
} = {}): string {
  const qs: string[] = [];

  if (opts.select) qs.push(`select=${encodeURIComponent(opts.select)}`);
  if (opts.order) qs.push(`order=${encodeURIComponent(opts.order.replace(' ', '.'))}`);
  if (opts.limit) qs.push(`limit=${opts.limit}`);
  if (opts.range) qs.push(`range=${opts.range[0]},${opts.range[1]}`);

  if (opts.filter) {
    for (const f of opts.filter) {
      if (!f.property || !f.operator) continue;
      if (typeof f.value === 'boolean') {
        qs.push(`${f.property}.is.${f.value}`);
      } else if (typeof f.value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(f.value)) {
        qs.push(`${f.property}.${f.operator}.${f.value}`);
      } else {
        qs.push(`${f.property}=${f.operator}.${encodeURIComponent(String(f.value))}`);
      }
    }
  }

  return `${SUPABASE_CONFIG.URL}/rest/v1/${table}?${qs.join('&')}`;
}

/** 查询单表 */
export async function sbQuery<T = any>(table: string, opts: Parameters<typeof buildQueryUrl>[1] = {}): Promise<T[]> {
  const url = buildQueryUrl(table, opts);
  return sbFetch(url);
}

/** 插入记录 */
export async function sbInsert<T = any>(table: string, data: Record<string, any> | Record<string, any>[]): Promise<T[]> {
  const url = `${SUPABASE_CONFIG.URL}/rest/v1/${table}`;
  return sbFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
}

/** 更新记录 */
export async function sbUpdate<T = any>(table: string, id: string, data: Record<string, any>): Promise<T[]> {
  const url = `${SUPABASE_CONFIG.URL}/rest/v1/${table}?id=eq.${id}`;
  return sbFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(data),
  });
}

/** 删除记录 */
export async function sbDelete(table: string, id: string): Promise<void> {
  const url = `${SUPABASE_CONFIG.URL}/rest/v1/${table}?id=eq.${id}`;
  await sbFetch(url, { method: 'DELETE' });
}

/** Upsert（依赖表级 UNIQUE 约束） */
export async function sbUpsert<T = any>(table: string, data: Record<string, any> | Record<string, any>[], onConflict: string): Promise<T[]> {
  const url = `${SUPABASE_CONFIG.URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`;
  return sbFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(data),
  });
}