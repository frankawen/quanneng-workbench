// ============================================================
// 轻量级 SWR (stale-while-revalidate) 实现
// 支持：缓存、去重、自动重验证、乐观更新
// ============================================================
import { useState, useEffect, useCallback, useRef } from 'react';

interface SWRConfig<T> {
  revalidateOnFocus?: boolean;
  revalidateOnReconnect?: boolean;
  refreshInterval?: number;
  dedupeInterval?: number;
  onSuccess?: (data: T) => void;
  onError?: (err: Error) => void;
  fallbackData?: T;
}

interface SWRResponse<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  isValidating: boolean;
  mutate: (data?: T | Promise<T> | ((current: T | undefined) => T | Promise<T>), opts?: { revalidate?: boolean }) => Promise<T | undefined>;
}

const cache = new Map<string, { data: any; promise: Promise<any> | null; subscribers: Set<() => void>; timestamp: number }>();
const inflight = new Map<string, Promise<any>>();

const DEFAULT_DEDUPE_INTERVAL = 2000; // 2s 内相同 key 请求去重

function getCache(key: string) {
  if (!cache.has(key)) {
    cache.set(key, { data: undefined, promise: null, subscribers: new Set(), timestamp: 0 });
  }
  return cache.get(key)!;
}

function notify(key: string) {
  const entry = cache.get(key);
  if (entry) entry.subscribers.forEach(cb => cb());
}

async function fetchWithDedupe(key: string, fetcher: (key: string) => Promise<any>, dedupeInterval: number): Promise<any> {
  const entry = getCache(key);
  const now = Date.now();

  // 如果有进行中的请求且在去重窗口内，复用
  if (entry.promise && now - entry.timestamp < dedupeInterval) {
    return entry.promise;
  }

  const promise = fetcher(key).then(
    data => {
      entry.data = data;
      entry.promise = null;
      entry.timestamp = Date.now();
      notify(key);
      return data;
    },
    err => {
      entry.promise = null;
      notify(key);
      throw err;
    }
  );

  entry.promise = promise;
  entry.timestamp = now;
  notify(key);

  return promise;
}

export function useSWR<T = any>(
  key: string | null | (string | null)[],
  fetcher: (key: string) => Promise<T>,
  config: SWRConfig<T> = {}
): SWRResponse<T> {
  const keys = Array.isArray(key) ? key : [key];
  const primaryKey = keys.find(k => k !== null) ?? null;

  const [data, setData] = useState<T | undefined>(() => primaryKey ? getCache(primaryKey).data : config.fallbackData);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(primaryKey !== null && data === undefined);
  const [isValidating, setIsValidating] = useState(false);

  const configRef = useRef(config);
  configRef.current = config;

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // 重验证函数
  const revalidate = useCallback(async (force = false) => {
    if (!primaryKey) return undefined;

    const entry = getCache(primaryKey);
    if (!force && entry.data !== undefined && !isValidating) {
      setIsValidating(true);
    }

    try {
      const result = await fetchWithDedupe(
        primaryKey,
        fetcherRef.current,
        configRef.current.dedupeInterval ?? DEFAULT_DEDUPE_INTERVAL
      );
      setData(result);
      setError(null);
      configRef.current.onSuccess?.(result);
      return result;
    } catch (err) {
      setError(err as Error);
      configRef.current.onError?.(err as Error);
      throw err;
    } finally {
      setIsLoading(false);
      setIsValidating(false);
    }
  }, [primaryKey, isValidating]);

  // 初始加载 + 焦点/重连重验证
  useEffect(() => {
    if (!primaryKey) return;

    const entry = getCache(primaryKey);
    const cachedData = entry.data;

    // 有缓存数据则先渲染
    if (cachedData !== undefined) {
      setData(cachedData);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    // 订阅缓存更新
    const subscriber = () => {
      const latest = getCache(primaryKey).data;
      if (latest !== undefined) setData(latest);
    };
    entry.subscribers.add(subscriber);

    // 首次请求
    revalidate();

    // 定时轮询
    let timer: number | undefined;
    if (config.refreshInterval && config.refreshInterval > 0) {
      timer = window.setInterval(() => revalidate(true), config.refreshInterval);
    }

    // 页面聚焦重验证
    const onFocus = () => config.revalidateOnFocus && revalidate(true);
    const onReconnect = () => config.revalidateOnReconnect && revalidate(true);
    if (config.revalidateOnFocus) window.addEventListener('focus', onFocus);
    if (config.revalidateOnReconnect) window.addEventListener('online', onReconnect);

    return () => {
      entry.subscribers.delete(subscriber);
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onReconnect);
    };
  }, [primaryKey, config.refreshInterval, config.revalidateOnFocus, config.revalidateOnReconnect, revalidate]);

  // mutate 函数：乐观更新或手动触发重验证
  const mutate = useCallback(async (
    newData?: T | Promise<T> | ((current: T | undefined) => T | Promise<T>),
    opts: { revalidate?: boolean } = {}
  ) => {
    if (!primaryKey) return undefined;

    const entry = getCache(primaryKey);
    let resolvedData: T;

    if (typeof newData === 'function') {
      resolvedData = await (newData as (current: T | undefined) => T | Promise<T>)(entry.data);
    } else if (newData instanceof Promise) {
      resolvedData = await newData;
    } else {
      resolvedData = newData as T;
    }

    // 乐观更新
    entry.data = resolvedData;
    setData(resolvedData);
    notify(primaryKey);

    if (opts.revalidate !== false) {
      await revalidate(true);
    }

    return resolvedData;
  }, [primaryKey, revalidate]);

  return { data, error, isLoading, isValidating, mutate };
}

// 预加载工具
export function preloadSWR(key: string, fetcher: () => Promise<any>) {
  fetchWithDedupe(key, fetcher, DEFAULT_DEDUPE_INTERVAL).catch(() => {});
}

// 清除缓存
export function clearSWRCache(key?: string) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}