/**
 * 任务级 PO 数据共享 hook
 *
 * 让 PR / PO / 供应商概览三个模块共享一次取数，避免重复反查 PR + PO。
 * 缓存键：taskId + includeClosed + filter 序列化。
 *
 * 注意：仅做内存缓存，不持久化；任务/过滤/包含已关闭变化都会触发重取。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProcurementTaskFilter } from '../../types/procurementWorkbench';
import { fetchAllPoByTask, type PoFullResult } from '../../services/procurementPoService';

interface UseTaskPoDataOptions {
  taskId: string;
  filter: ProcurementTaskFilter;
  includeClosed: boolean;
  /** 是否启用：若 false（如 PR 模块不需要），不会触发请求 */
  enabled?: boolean;
}

interface UseTaskPoDataResult {
  data: PoFullResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

interface CacheEntry {
  promise: Promise<PoFullResult>;
  data?: PoFullResult;
  error?: string;
}

const cache = new Map<string, CacheEntry>();

function makeKey(taskId: string, filter: ProcurementTaskFilter, includeClosed: boolean): string {
  return `${taskId}::${includeClosed}::${JSON.stringify(filter)}`;
}

/** 清除指定任务的所有缓存条目（不限 includeClosed/filter） */
export function invalidateTaskPoCache(taskId: string): void {
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(`${taskId}::`)) cache.delete(key);
  }
}

export function useTaskPoData({
  taskId,
  filter,
  includeClosed,
  enabled = true,
}: UseTaskPoDataOptions): UseTaskPoDataResult {
  const key = useMemo(() => makeKey(taskId, filter, includeClosed), [taskId, filter, includeClosed]);
  const [data, setData] = useState<PoFullResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback((forceReload = false) => {
    if (!enabled) return;
    if (forceReload) cache.delete(key);

    let entry = cache.get(key);
    if (!entry) {
      const promise = fetchAllPoByTask(filter, { includeClosed });
      entry = { promise };
      cache.set(key, entry);
      // 在 promise 完成时把结果回写到 entry，便于后续同 key 的订阅者直接拿到
      promise
        .then((result) => {
          const e = cache.get(key);
          if (e) e.data = result;
        })
        .catch((err) => {
          const e = cache.get(key);
          if (e) e.error = err instanceof Error ? err.message : String(err);
          // 出错的 entry 删除，下次重试
          cache.delete(key);
        });
    }

    // 若已有结果，直接同步设置；否则进入 loading
    if (entry.data) {
      setData(entry.data);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    entry.promise
      .then((result) => {
        if (!mountedRef.current) return;
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : '查询失败');
        setLoading(false);
        setData(null);
      });
  }, [key, enabled, filter, includeClosed]);

  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(() => {
    load(true);
  }, [load]);

  return { data, loading, error, refresh };
}
