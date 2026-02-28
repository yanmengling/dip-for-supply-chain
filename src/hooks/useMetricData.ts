/**
 * 指标数据 Hook
 *
 * 用于在组件中获取指标模型的真实数据
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { metricModelApi, createCurrentYearRange, createLastDaysRange } from '../api';
import type { MetricQueryResult, MetricQueryRequest } from '../api';

// ============================================================================
// 全局请求缓存 - 防止重复请求
// ============================================================================

/** 请求缓存项 */
interface RequestCacheItem {
  /** 正在进行的请求 Promise */
  promise: Promise<MetricQueryResult>;
  /** 缓存时间戳 */
  timestamp: number;
}

/** 全局请求缓存 Map（存储 Promise，用于去重并发请求） */
const requestCache = new Map<string, RequestCacheItem>();

/** 已解析结果缓存（存储实际数据，用于同步初始化 hook 状态，消除 loading 闪烁） */
interface ResolvedCacheItem {
  result: MetricQueryResult;
  timestamp: number;
}
const resolvedValueCache = new Map<string, ResolvedCacheItem>();

/** 缓存有效期 (毫秒)
 *  与 API 层（metricModelApi）的缓存对齐，覆盖页面切换的时间窗口。
 *  即使快速在页面间来回切换，3 分钟内同参数的请求只发起一次。
 */
const CACHE_TTL = 3 * 60 * 1000; // 3 分钟

/**
 * 构建缓存 Key（将 start/end 对齐到 TTL 窗口，保证同一窗口内 key 稳定）
 */
function buildCacheKey(
  modelId: string,
  instant: boolean,
  startRaw: number | undefined,
  endRaw: number | undefined,
  step: string,
): string {
  const alignedNow = Math.floor(Date.now() / CACHE_TTL) * CACHE_TTL;
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const s = startRaw !== undefined ? Math.floor(startRaw / CACHE_TTL) * CACHE_TTL : alignedNow - ONE_DAY;
  const e = endRaw !== undefined ? Math.floor(endRaw / CACHE_TTL) * CACHE_TTL : alignedNow;
  return `${modelId}-${instant}-${s}-${e}-${step}`;
}

/**
 * 清理过期的缓存
 */
function cleanExpiredCache(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];

  requestCache.forEach((item, key) => {
    if (now - item.timestamp > CACHE_TTL) keysToDelete.push(key);
  });
  keysToDelete.forEach(key => requestCache.delete(key));

  const resolvedKeysToDelete: string[] = [];
  resolvedValueCache.forEach((item, key) => {
    if (now - item.timestamp > CACHE_TTL) resolvedKeysToDelete.push(key);
  });
  resolvedKeysToDelete.forEach(key => resolvedValueCache.delete(key));
}

// 定期清理过期缓存 (每10秒)
if (typeof window !== 'undefined') {
  setInterval(cleanExpiredCache, 10000);
}

// ============================================================================
// 类型定义
// ============================================================================

/** 指标数据状态 */
export interface MetricDataState<T = number | null> {
  /** 数据值 */
  value: T;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 原始响应 */
  rawData?: MetricQueryResult;
  /** 刷新数据 */
  refresh: () => void;
}

/** Hook 配置选项 */
export interface UseMetricDataOptions {
  /** 是否立即加载 */
  immediate?: boolean;
  /** 是否使用即时查询（默认范围查询） */
  instant?: boolean;
  /** 开始时间（毫秒时间戳） */
  start?: number;
  /** 结束时间（毫秒时间戳） */
  end?: number;
  /** 步长（如 1M, 1d） */
  step?: string;
  /** 分析维度（用于分组查询） */
  analysisDimensions?: string[];
  /** 数据转换函数 */
  transform?: (result: MetricQueryResult) => number | null;
  /** 是否包含模型信息 */
  includeModel?: boolean;
}

/** 带维度的数据项 */
export interface DimensionDataItem {
  labels: Record<string, string>;
  value: number | null;
}

/** 带维度的数据状态 */
export interface DimensionDataState {
  /** 数据列表 */
  items: DimensionDataItem[];
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 原始响应 */
  rawData?: MetricQueryResult;
  /** 刷新数据 */
  refresh: () => void;
}

// ============================================================================
// 默认转换函数
// ============================================================================

/**
 * 默认数据转换：取最新一个值
 */
function defaultTransform(result: MetricQueryResult): number | null {
  if (!result.datas || result.datas.length === 0) {
    return null;
  }

  // 获取第一个数据系列的最后一个值
  const firstSeries = result.datas[0];
  if (!firstSeries.values || firstSeries.values.length === 0) {
    return null;
  }

  // 返回最后一个非空值
  for (let i = firstSeries.values.length - 1; i >= 0; i--) {
    if (firstSeries.values[i] !== null) {
      return firstSeries.values[i];
    }
  }

  return null;
}

/**
 * 求和转换：将所有系列的所有值求和
 */
export function sumTransform(result: MetricQueryResult): number | null {
  if (!result.datas || result.datas.length === 0) {
    return null;
  }

  let sum = 0;
  let hasValue = false;

  for (const series of result.datas) {
    if (series.values) {
      for (const value of series.values) {
        if (value !== null) {
          sum += value;
          hasValue = true;
        }
      }
    }
  }

  return hasValue ? sum : null;
}

/**
 * 最新值转换：取所有系列中时间最新的值
 */
export function latestValueTransform(result: MetricQueryResult): number | null {
  if (!result.datas || result.datas.length === 0) {
    return null;
  }

  let latestTime = -Infinity;  // 修复：使用负无穷大作为初始值
  let latestValue: number | null = null;

  for (const series of result.datas) {
    if (series.times && series.values) {
      for (let i = 0; i < series.times.length; i++) {
        const time = series.times[i];
        const value = series.values[i];
        if (value !== null && time >= latestTime) {  // 修复：使用 >= 而不是 >
          latestTime = time;
          latestValue = value;
        }
      }
    }
  }

  return latestValue;
}

/**
 * 计数转换：统计所有数据点的个数
 */
export function countTransform(result: MetricQueryResult): number | null {
  if (!result.datas || result.datas.length === 0) {
    return null;
  }

  let count = 0;
  for (const series of result.datas) {
    if (series.values) {
      count += series.values.filter(v => v !== null).length;
    }
  }

  return count;
}

// ============================================================================
// Hook 实现
// ============================================================================

/**
 * 获取单个指标模型数据
 *
 * @param modelId - 指标模型 ID
 * @param options - 配置选项
 */
export function useMetricData(
  modelId: string,
  options: UseMetricDataOptions = {}
): MetricDataState {
  const {
    immediate = true,
    instant = true,
    start,
    end,
    step = '1M',
    transform = defaultTransform,
  } = options;

  // 同步读取已解析缓存，避免页面切换时的 loading 闪烁和重复请求
  const _initKey = buildCacheKey(modelId, instant, start, end, step);
  const _initResolved = resolvedValueCache.get(_initKey);
  const _initValid = !!(_initResolved && Date.now() - _initResolved.timestamp < CACHE_TTL);
  const _initValue = _initValid ? (transform ?? defaultTransform)(_initResolved!.result) : null;

  const [value, setValue] = useState<number | null>(_initValue);
  const [loading, setLoading] = useState(!_initValid && immediate);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<MetricQueryResult | undefined>(
    _initValid ? _initResolved!.result : undefined
  );

  // 使用 ref 存储 transform 函数，避免引用变化导致的无限循环
  const transformRef = useRef(transform);
  transformRef.current = transform;

  // 使用 ref 存储 AbortController，用于取消请求
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // 对 options 中的原始参数进行 memo，确保即使 options 对象本身是不稳定的，提取出的值在内容一致时也是稳定的
  const startMemo = start;
  const endMemo = end;
  const instantMemo = instant;
  const stepMemo = step;

  const fetchData = useCallback(async () => {
    if (!modelId) {
      setError('指标模型 ID 不能为空');
      return;
    }

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();
    const currentController = abortControllerRef.current;

    const now = Date.now();

    // 生成缓存键（start/end 对齐到 TTL 窗口，保证同一窗口内 key 稳定）
    const cacheKey = buildCacheKey(modelId, instantMemo, startMemo, endMemo, stepMemo);

    // 计算实际查询时间范围（与 key 对齐，避免传给 API 的时间戳每次不同）
    const alignedNow = Math.floor(now / CACHE_TTL) * CACHE_TTL;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const queryStart = startMemo !== undefined
      ? Math.floor(startMemo / CACHE_TTL) * CACHE_TTL
      : alignedNow - ONE_DAY;
    const queryEnd = endMemo !== undefined
      ? Math.floor(endMemo / CACHE_TTL) * CACHE_TTL
      : alignedNow;

    // 先检查已解析缓存（同步结果），命中则直接返回，无需 loading
    const resolvedCached = resolvedValueCache.get(cacheKey);
    if (resolvedCached && now - resolvedCached.timestamp < CACHE_TTL) {
      if (currentController.signal.aborted || !isMountedRef.current) return;
      setRawData(resolvedCached.result);
      setValue(transformRef.current(resolvedCached.result));
      setLoading(false);
      return;
    }

    // 检查 in-flight 请求缓存（Promise 缓存，去重并发）
    const cached = requestCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      if (import.meta.env.DEV) {
        console.log(`[useMetricData] Using cached request for ${modelId}`);
      }
      try {
        const result = await cached.promise;

        if (currentController.signal.aborted || !isMountedRef.current) {
          return;
        }

        resolvedValueCache.set(cacheKey, { result, timestamp: now });
        setRawData(result);
        const transformedValue = transformRef.current(result);
        setValue(transformedValue);
        setLoading(false);
        return;
      } catch (err) {
        requestCache.delete(cacheKey);
      }
    }

    // 只有在非加载状态或 modelId 变化时才设置 loading，减少不必要的重绘
    setLoading(true);
    setError(null);

    try {
      const request: MetricQueryRequest = {
        instant: instantMemo,
        start: queryStart,
        end: queryEnd,
      };

      if (!instantMemo) {
        request.step = stepMemo;
      }

      // 创建新请求
      const requestPromise = metricModelApi.queryByModelId(modelId, request, {
        includeModel: options.includeModel ?? false,
      });

      // 将请求存入缓存
      requestCache.set(cacheKey, {
        promise: requestPromise,
        timestamp: now
      });

      if (import.meta.env.DEV) {
        console.log(`[useMetricData] Fetching metric ${modelId}`);
      }

      const result = await requestPromise;

      if (currentController.signal.aborted || !isMountedRef.current) {
        return;
      }

      // 写入已解析缓存
      resolvedValueCache.set(cacheKey, { result, timestamp: now });
      setRawData(result);
      const transformedValue = transformRef.current(result);
      setValue(transformedValue);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      if (!isMountedRef.current) {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : '获取指标数据失败';
      setError(errorMessage);
      console.error(`[useMetricData] 获取指标 ${modelId} 失败:`, err);
      requestCache.delete(cacheKey);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [modelId, instantMemo, startMemo, endMemo, stepMemo, options.includeModel]);

  useEffect(() => {
    isMountedRef.current = true;

    if (immediate) {
      fetchData();
    }

    // 清理函数：取消未完成的请求
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        console.log(`[useMetricData] Cleanup: aborted request for ${modelId}`);
      }
    };
  }, [immediate, fetchData, modelId]);

  return {
    value,
    loading,
    error,
    rawData,
    refresh: fetchData,
  };
}

/**
 * 批量获取多个指标模型数据
 *
 * @param modelIds - 指标模型 ID 数组
 * @param options - 配置选项
 */
export function useMultipleMetricData(
  modelIds: string[],
  options: UseMetricDataOptions = {}
): {
  data: Map<string, number | null>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const {
    immediate = true,
    instant = true,
    start,
    end,
    step = '1M',
    transform = defaultTransform,
  } = options;

  const [data, setData] = useState<Map<string, number | null>>(new Map());
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!modelIds || modelIds.length === 0) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const defaultRange = createLastDaysRange(1);
      const queryStart = start ?? defaultRange.start;
      const queryEnd = end ?? defaultRange.end;

      const baseRequest: MetricQueryRequest = {
        instant,
        start: queryStart,
        end: queryEnd,
      };

      if (!instant) {
        baseRequest.step = step;
      }

      const requests = modelIds.map(() => ({ ...baseRequest }));
      const results = await metricModelApi.queryByModelIds(modelIds, requests, {
        includeModel: true,
      });

      const newData = new Map<string, number | null>();
      results.forEach((result, index) => {
        const transformedValue = transform(result);
        newData.set(modelIds[index], transformedValue);
      });

      setData(newData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取指标数据失败';
      setError(errorMessage);
      console.error('[useMultipleMetricData] 获取指标失败:', err);
    } finally {
      setLoading(false);
    }
  }, [modelIds, instant, start, end, step, transform]);

  useEffect(() => {
    if (immediate) {
      fetchData();
    }
  }, [immediate, fetchData]);

  return {
    data,
    loading,
    error,
    refresh: fetchData,
  };
}

/**
 * 获取带维度分组的指标数据
 * 
 * 用于查询按某个维度分组的数据，如按产品名称分组的库存量
 *
 * @param modelId - 指标模型 ID
 * @param dimensions - 分组维度字段名数组
 * @param options - 配置选项
 */
export function useDimensionMetricData(
  modelId: string,
  dimensions: string[],
  options: Omit<UseMetricDataOptions, 'transform' | 'analysisDimensions'> = {}
): DimensionDataState {
  const {
    immediate = true,
    instant = true,
    start,
    end,
    step = '1M',
  } = options;

  const [items, setItems] = useState<DimensionDataItem[]>([]);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<string | null>(null);
  const [rawData, setRawData] = useState<MetricQueryResult | undefined>();

  // 将 dimensions 数组序列化为字符串，避免引用变化导致的无限循环
  const dimensionsKey = JSON.stringify(dimensions);

  // 使用 ref 存储 AbortController，用于取消请求
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // 对 options 中的原始参数进行 memo
  const startMemo = start;
  const endMemo = end;
  const instantMemo = instant;
  const stepMemo = step;

  const fetchData = useCallback(async () => {
    if (!modelId) {
      setError('指标模型 ID 不能为空');
      return;
    }

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log(`[useDimensionMetricData] Aborted previous request for ${modelId}`);
    }

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController();
    const currentController = abortControllerRef.current;

    setLoading(true);
    setError(null);

    try {
      // 对齐到 TTL 窗口（3分钟），保证同一窗口内切换页面 key 不变
      const now = Date.now();
      const alignedEnd = Math.floor(now / CACHE_TTL) * CACHE_TTL;
      const ONE_DAY = 24 * 60 * 60 * 1000;
      const defaultRange = { start: alignedEnd - ONE_DAY, end: alignedEnd };
      const queryStart = startMemo ?? defaultRange.start;
      const queryEnd = endMemo ?? defaultRange.end;

      // 从序列化的字符串恢复 dimensions
      const parsedDimensions = JSON.parse(dimensionsKey) as string[];

      const request: MetricQueryRequest = {
        instant: instantMemo,
        start: queryStart,
        end: queryEnd,
        analysis_dimensions: parsedDimensions,
      };

      if (!instantMemo) {
        request.step = stepMemo;
      }

      // 生成缓存键 (基于请求参数)
      const cacheKey = `${modelId}-${instantMemo}-${queryStart}-${queryEnd}-${stepMemo}-${dimensionsKey}`;

      // 检查缓存中是否有相同的请求
      const cached = requestCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < CACHE_TTL) {
        if (import.meta.env.DEV) {
          console.log(`[useDimensionMetricData] Using cached request for ${modelId}`);
        }
        try {
          const result = await cached.promise;

          // 检查请求是否已被取消或组件已卸载
          if (currentController.signal.aborted || !isMountedRef.current) {
            // console.log(`[useDimensionMetricData] Request cancelled for ${modelId}`);
            return;
          }

          setRawData(result);

          // 转换数据：提取每个系列的标签和最新值
          const transformedItems: DimensionDataItem[] = [];

          if (result.datas && result.datas.length > 0) {
            for (const series of result.datas) {
              // 获取最新的值（最后一个非空值）
              let latestValue: number | null = null;
              if (series.values && series.values.length > 0) {
                for (let i = series.values.length - 1; i >= 0; i--) {
                  if (series.values[i] !== null) {
                    latestValue = series.values[i];
                    break;
                  }
                }
              }

              transformedItems.push({
                labels: series.labels || {},
                value: latestValue,
              });
            }
          }

          // 按值降序排序
          transformedItems.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

          setItems(transformedItems);
          setLoading(false);
          return;
        } catch (err) {
          // 缓存的请求失败了,清除缓存并继续执行新请求
          console.warn(`[useDimensionMetricData] Cached request failed for ${modelId}, retrying...`);
          requestCache.delete(cacheKey);
        }
      }

      // 创建新请求
      const requestPromise = metricModelApi.queryByModelId(modelId, request, {
        includeModel: options.includeModel ?? false,
      });

      // 将请求存入缓存
      requestCache.set(cacheKey, {
        promise: requestPromise,
        timestamp: now
      });

      if (import.meta.env.DEV) {
        console.log(`[useDimensionMetricData] Fetching metric ${modelId}`);
      }

      const result = await requestPromise;

      // 检查请求是否已被取消或组件已卸载
      if (currentController.signal.aborted || !isMountedRef.current) {
        // console.log(`[useDimensionMetricData] Request cancelled for ${modelId}`);
        return;
      }

      setRawData(result);

      // 转换数据：提取每个系列的标签和最新值
      const transformedItems: DimensionDataItem[] = [];

      if (result.datas && result.datas.length > 0) {
        for (const series of result.datas) {
          // 获取最新的值（最后一个非空值）
          let latestValue: number | null = null;
          if (series.values && series.values.length > 0) {
            for (let i = series.values.length - 1; i >= 0; i--) {
              if (series.values[i] !== null) {
                latestValue = series.values[i];
                break;
              }
            }
          }

          transformedItems.push({
            labels: series.labels || {},
            value: latestValue,
          });
        }
      }

      // 按值降序排序
      transformedItems.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

      setItems(transformedItems);
    } catch (err) {
      // 忽略 AbortError
      if (err instanceof Error && err.name === 'AbortError') {
        console.log(`[useDimensionMetricData] Request aborted for ${modelId}`);
        return;
      }

      // 检查组件是否已卸载
      if (!isMountedRef.current) {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : '获取指标数据失败';
      setError(errorMessage);
      console.error(`[useDimensionMetricData] 获取指标 ${modelId} 失败:`, err);
      // 请求失败时从缓存中移除（key 需与创建时保持一致：TTL 窗口对齐）
      const alignedEndErr = Math.floor(Date.now() / CACHE_TTL) * CACHE_TTL;
      const ONE_DAY_ERR = 24 * 60 * 60 * 1000;
      const errStart = startMemo ?? (alignedEndErr - ONE_DAY_ERR);
      const errEnd = endMemo ?? alignedEndErr;
      const cacheKey = `${modelId}-${instantMemo}-${errStart}-${errEnd}-${stepMemo}-${dimensionsKey}`;
      requestCache.delete(cacheKey);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId, dimensionsKey, instantMemo, startMemo, endMemo, stepMemo, options.includeModel]);

  useEffect(() => {
    isMountedRef.current = true;

    if (immediate) {
      fetchData();
    }

    // 清理函数:取消未完成的请求
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        console.log(`[useDimensionMetricData] Cleanup: aborted request for ${modelId}`);
      }
    };
  }, [immediate, fetchData, modelId]);

  return {
    items,
    loading,
    error,
    rawData,
    refresh: fetchData,
  };
}

export default useMetricData;

