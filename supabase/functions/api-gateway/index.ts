// ============================================================
// API 网关 Edge Function
// 统一对外接口：鉴权、限流、缓存、日志
// 部署: supabase functions deploy api-gateway --no-verify-jwt
// ============================================================
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

// 简单内存限流（生产建议用 Redis/Upstash）
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // 每分钟请求数
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (record.count >= RATE_LIMIT) return false;
  record.count++;
  return true;
}

// 简单内存缓存（stale-while-revalidate）
const cache = new Map<string, { data: any; staleAt: number; expiryAt: number }>();
const CACHE_TTL_MS = 30_000;      // 30s 强缓存
const CACHE_STALE_MS = 5 * 60_000; // 5min 过期但可 stale 返回

async function cachedFetch(key: string, fetcher: () => Promise<any>): Promise<any> {
  const now = Date.now();
  const hit = cache.get(key);

  if (hit) {
    if (now < hit.staleAt) {
      // 强缓存命中
      return { data: hit.data, cached: true, fresh: true };
    }
    if (now < hit.expiryAt) {
      // Stale 但可用，后台刷新
      fetcher().then(fresh => {
        cache.set(key, { data: fresh, staleAt: Date.now() + CACHE_TTL_MS, expiryAt: Date.now() + CACHE_STALE_MS });
      }).catch(() => {});
      return { data: hit.data, cached: true, fresh: false };
    }
  }

  // 缓存未命中或过期
  const fresh = await fetcher();
  cache.set(key, { data: fresh, staleAt: now + CACHE_TTL_MS, expiryAt: now + CACHE_STALE_MS });
  return { data: fresh, cached: false, fresh: true };
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  // CORS 预检
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 限流
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
    });
  }

  // 鉴权：需要 apikey 或 Authorization Bearer
  const authHeader = req.headers.get('authorization');
  const apikey = req.headers.get('apikey') || authHeader?.replace('Bearer ', '');
  if (!apikey) {
    return new Response(JSON.stringify({ error: 'Missing API key' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 初始化 Supabase 客户端（使用 service_role 绕过 RLS）
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean); // ["api-gateway", "table", ...]
    const resource = pathParts[1]; // 表名或资源名
    const id = pathParts[2]; // 可选 ID

    // 只允许的表（白名单）
    const allowedTables = [
      'expenses', 'budgets', 'habits', 'habit_records',
      'body_records', 'workout_plans', 'wishlist',
      'news', 'shijing', 'quotes', 'comments'
    ];

    if (!allowedTables.includes(resource)) {
      return new Response(JSON.stringify({ error: 'Resource not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result: any;

    // GET - 查询
    if (req.method === 'GET') {
      const cacheKey = `${req.method}:${resource}:${url.search}`;
      const cached = await cachedFetch(cacheKey, async () => {
        let query = supabase.from(resource).select('*');

        // 查询参数映射
        url.searchParams.forEach((value, key) => {
          if (key === 'select') query = query.select(value);
          else if (key === 'order') query = query.order(value.replace('.', ''), { ascending: !value.startsWith('-') });
          else if (key === 'limit') query = query.limit(parseInt(value));
          else if (key === 'offset') query = query.range(parseInt(value), parseInt(value) + 99);
          else if (key.startsWith('filter.')) {
            const [, field, op] = key.split('.');
            if (field && op) {
              const isBool = value === 'true' || value === 'false';
              const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
              if (isBool) query = query.filter(field, op, value === 'true');
              else if (isUuid) query = query.filter(field, op, value);
              else query = query.filter(field, op, value);
            }
          }
        });

        const { data, error } = await query;
        if (error) throw error;
        return data;
      });

      result = cached.data;
      // 返回缓存元信息
      return new Response(JSON.stringify({ data: result, meta: { cached: cached.cached, fresh: cached.fresh } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Request-ID': requestId },
      });
    }

    // POST - 插入
    if (req.method === 'POST') {
      const body = await req.json();
      const isBatch = Array.isArray(body);
      const records = isBatch ? body : [body];

      // 基础验证
      for (const r of records) {
        if (resource === 'expenses' && (!r.type || !r.amount || !r.category || !r.date)) {
          throw new Error('expenses 缺少必填字段: type, amount, category, date');
        }
        if (resource === 'habits' && (!r.name || !r.type)) {
          throw new Error('habits 缺少必填字段: name, type');
        }
      }

      const { data, error } = await supabase.from(resource).insert(records).select();
      if (error) throw error;

      // 清除相关缓存
      for (const key of cache.keys()) {
        if (key.includes(`:${resource}:`)) cache.delete(key);
      }

      result = data;
      return new Response(JSON.stringify({ data: result }), {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Request-ID': requestId },
      });
    }

    // PATCH - 更新
    if (req.method === 'PATCH' && id) {
      const body = await req.json();
      const { data, error } = await supabase.from(resource).update(body).eq('id', id).select();
      if (error) throw error;

      for (const key of cache.keys()) {
        if (key.includes(`:${resource}:`)) cache.delete(key);
      }

      result = data;
      return new Response(JSON.stringify({ data: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Request-ID': requestId },
      });
    }

    // DELETE - 删除
    if (req.method === 'DELETE' && id) {
      const { error } = await supabase.from(resource).delete().eq('id', id);
      if (error) throw error;

      for (const key of cache.keys()) {
        if (key.includes(`:${resource}:`)) cache.delete(key);
      }

      return new Response(null, { status: 204, headers: { ...corsHeaders, 'X-Request-ID': requestId } });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(`[${requestId}] Error:`, err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Request-ID': requestId },
    });
  } finally {
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] ${req.method} ${req.url} - ${duration}ms`);
  }
});