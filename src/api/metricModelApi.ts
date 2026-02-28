/**
 * 指标模型 API 服务
 *
 * 对接 mdl-uniquery 服务，用于查询指标模型数据
 * API 文档：uniquery-for-metricmodel.yaml
 */

import { httpClient, ApiError } from './httpClient';
import { getServiceConfig } from '../config/apiConfig';

// ============================================================================
// 类型定义
// ============================================================================

/** 过滤条件操作符 */
export type FilterOperation =
  | 'in'
  | '='
  | '!='
  | 'range'
  | 'out_range'
  | 'like'
  | 'not_like'
  | '>'
  | '>='
  | '<'
  | '<=';

/** 过滤条件 */
export interface MetricFilter {
  /** 过滤字段名称 */
  name: string;
  /** 过滤的值 */
  value: string | number | (string | number)[];
  /** 操作符 */
  operation: FilterOperation;
}

/** 指标查询请求参数 */
export interface MetricQueryRequest {
  /** 是否即时查询（true=即时查询，false=范围查询） */
  instant?: boolean;
  /** 开始时间（Unix 毫秒时间戳） */
  start: number;
  /** 结束时间（Unix 毫秒时间戳） */
  end: number;
  /** 范围查询步长（如 1m, 1h, 1d, 1M） */
  step?: string;
  /** 过滤条件数组 */
  filters?: MetricFilter[];
  /** 分析维度（下钻维度） */
  analysis_dimensions?: string[];
}

/** 指标数据点 */
export interface MetricData {
  /** 维度标签 */
  labels: Record<string, string>;
  /** 时间点数组（毫秒时间戳） */
  times: number[];
  /** 值数组 */
  values: (number | null)[];
  /** 增长值（同环比分析） */
  growth_values?: number[];
  /** 增长率（同环比分析） */
  growth_rates?: number[];
  /** 占比（占比分析） */
  proportions?: number[];
}

/** Label 对象（用于分析维度） */
export interface Label {
  name: string;
  type?: string;
}

/** 指标模型信息 */
export interface MetricModel {
  id: string;
  name: string;
  measure_name?: string;
  metric_type: 'atomic' | 'complex';
  data_view_id?: string;
  data_view_name?: string;
  query_type: 'promql' | 'dsl' | 'sql';
  formula?: string;
  date_field?: string;
  date_format?: string;
  measure_field?: string;
  unit_type?: 'numUnit' | 'storeUnit' | 'percent' | 'transmissionRate' | 'timeUnit';
  unit?: string;
  tags?: string[];
  comment?: string;
  update_time?: string;
  group_id?: string;
  group_name?: string;
  /** 分析维度。即在指标查询时可指定的下钻维度集合 */
  analysis_dimensions?: Label[] | string[];
}

/** 指标查询结果 */
export interface MetricQueryResult {
  /** 指标模型信息（当 include_model=true 时返回） */
  model?: MetricModel;
  /** 指标数据数组 */
  datas: MetricData[];
  /** 查询步长 */
  step: string;
  /** DSL 是否使用变量 */
  is_variable: boolean;
  /** 是否日历间隔 */
  is_calendar?: boolean;
  /** 状态码 */
  status_code?: number;
}

/** 字段值列表响应 */
export interface FieldValuesResponse {
  type: string;
  values: string[];
}

/** 查询选项 */
export interface QueryOptions {
  /** 是否返回模型信息 */
  includeModel?: boolean;
  /** 是否忽略持久化缓存 */
  ignoringStoreCache?: boolean;
  /** 是否忽略内存缓存 */
  ignoringMemoryCache?: boolean;
  /** 是否补空 */
  fillNull?: boolean;
  /** 过滤模式 */
  filterMode?: 'normal' | 'error' | 'ignore';
  /** 是否忽略高基查询保护（默认 false，传 true 可绕过高基数限制） */
  ignoringHcts?: boolean;
}

// ============================================================================
// 模块级 API 请求缓存（in-flight + 结果缓存）
// ============================================================================

interface ApiCacheItem {
  /** 请求 Promise（in-flight 期间和完成后均保留，用于去重和结果复用） */
  promise: Promise<MetricQueryResult>;
  /** 缓存时间戳 */
  timestamp: number;
}

interface ApiBatchCacheItem {
  promise: Promise<MetricQueryResult[]>;
  timestamp: number;
}

/** 单模型请求缓存 */
const _apiCache = new Map<string, ApiCacheItem>();
/** 批量模型请求缓存 */
const _apiBatchCache = new Map<string, ApiBatchCacheItem>();
/** 缓存有效期：30 秒（覆盖页面切换时间窗口） */
const API_CACHE_TTL = 3 * 60 * 1000; // 3 分钟

/**
 * 将时间戳对齐到 TTL 窗口边界，确保同一窗口内的请求共用同一缓存 key。
 * 例如 TTL=3min，则 0~179s 的请求 key 相同，180s 后进入新窗口。
 */
function _alignTimestamp(ts: number): number {
  return Math.floor(ts / API_CACHE_TTL) * API_CACHE_TTL;
}

function _buildCacheKey(
  modelId: string,
  request: MetricQueryRequest,
  options?: QueryOptions
): string {
  // 对齐时间戳，消除毫秒级差异导致的缓存穿透
  const alignedRequest = {
    ...request,
    start: _alignTimestamp(request.start),
    end: _alignTimestamp(request.end),
  };
  return `${modelId}|${JSON.stringify(alignedRequest)}|${JSON.stringify(options ?? {})}`;
}

function _getFromCache(key: string): Promise<MetricQueryResult> | null {
  const item = _apiCache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > API_CACHE_TTL) {
    _apiCache.delete(key);
    return null;
  }
  return item.promise;
}

function _getFromBatchCache(key: string): Promise<MetricQueryResult[]> | null {
  const item = _apiBatchCache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > API_CACHE_TTL) {
    _apiBatchCache.delete(key);
    return null;
  }
  return item.promise;
}

/** 清除所有 API 缓存（供手动刷新场景使用） */
export function clearApiCache(): void {
  _apiCache.clear();
  _apiBatchCache.clear();
  if (import.meta.env.DEV) console.log('[metricModelApi] Cache cleared');
}

// ============================================================================
// API 服务类
// ============================================================================

class MetricModelApiService {
  /**
   * 获取服务基础 URL
   */
  private get baseUrl(): string {
    return getServiceConfig('metricModel').baseUrl;
  }

  /**
   * 构建查询参数字符串
   */
  private buildQueryParams(options?: QueryOptions): string {
    const params = new URLSearchParams();

    if (options?.includeModel) {
      params.set('include_model', 'true');
    }
    if (options?.ignoringStoreCache) {
      params.set('ignoring_store_cache', 'true');
    }
    if (options?.ignoringMemoryCache) {
      params.set('ignoring_memory_cache', 'true');
    }
    if (options?.fillNull !== undefined) {
      params.set('fill_null', String(options.fillNull));
    }
    if (options?.filterMode) {
      params.set('filter_mode', options.filterMode);
    }

    if (options?.ignoringHcts) {
      params.set('ignoring_hcts', 'true');
    }

    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      await httpClient.get(`${this.baseUrl}/health`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 根据指标模型 ID 查询指标数据
   *
   * 内置 30 秒 in-flight + 结果缓存：相同参数的并发请求共享同一个 Promise，
   * 请求完成后结果在 30 秒内可复用，避免页面切换时重复请求。
   *
   * @param modelId - 指标模型 ID
   * @param request - 查询请求参数
   * @param options - 查询选项
   */
  async queryByModelId(
    modelId: string,
    request: MetricQueryRequest,
    options?: QueryOptions
  ): Promise<MetricQueryResult> {
    const cacheKey = _buildCacheKey(modelId, request, options);
    const cached = _getFromCache(cacheKey);
    if (cached) {
      if (import.meta.env.DEV) {
        console.log(`[metricModelApi] Cache hit: ${modelId}`);
      }
      return cached;
    }

    const url = `${this.baseUrl}/metric-models/${modelId}${this.buildQueryParams(options)}`;
    const promise = httpClient.postAsGet<MetricQueryResult>(url, request)
      .then(r => r.data)
      .catch(err => {
        // 请求失败时清除缓存，允许下次重试
        _apiCache.delete(cacheKey);
        throw err;
      });

    _apiCache.set(cacheKey, { promise, timestamp: Date.now() });
    if (import.meta.env.DEV) {
      console.log(`[metricModelApi] Fetch: ${modelId}`);
    }
    return promise;
  }

  /**
   * 批量查询多个指标模型（使用逗号分隔的 ID）
   *
   * 同样具备 30 秒 in-flight + 结果缓存。
   *
   * @param modelIds - 指标模型 ID 数组
   * @param requests - 查询请求参数数组（与 ID 顺序对应）
   * @param options - 查询选项
   */
  async queryByModelIds(
    modelIds: string[],
    requests: MetricQueryRequest[],
    options?: QueryOptions
  ): Promise<MetricQueryResult[]> {
    if (modelIds.length !== requests.length) {
      throw new ApiError(
        '模型 ID 数量与请求参数数量不匹配',
        400,
        'INVALID_PARAMS'
      );
    }

    const cacheKey = `batch|${modelIds.join(',')}|${JSON.stringify(requests)}|${JSON.stringify(options ?? {})}`;
    const cached = _getFromBatchCache(cacheKey);
    if (cached) {
      if (import.meta.env.DEV) {
        console.log(`[metricModelApi] Batch cache hit: ${modelIds.join(',')}`);
      }
      return cached;
    }

    const ids = modelIds.join(',');
    const url = `${this.baseUrl}/metric-models/${ids}${this.buildQueryParams(options)}`;
    const promise = httpClient.postAsGet<MetricQueryResult[]>(url, requests)
      .then(r => r.data)
      .catch(err => {
        _apiBatchCache.delete(cacheKey);
        throw err;
      });

    _apiBatchCache.set(cacheKey, { promise, timestamp: Date.now() });
    return promise;
  }

  /**
   * 根据分组名称和模型名称查询指标数据
   *
   * @param groupName - 分组名称
   * @param requests - 查询请求参数数组（包含 model_name）
   * @param options - 查询选项
   */
  async queryByGroupAndModelName(
    groupName: string,
    requests: (MetricQueryRequest & { model_name: string })[],
    options?: QueryOptions
  ): Promise<MetricQueryResult[]> {
    const url = `${this.baseUrl}/metric-model-groups/${encodeURIComponent(groupName)}/metric-models${this.buildQueryParams(options)}`;

    const response = await httpClient.postAsGet<MetricQueryResult[]>(url, requests);
    return response.data;
  }

  /**
   * 获取指标模型的字段列表
   *
   * @param modelId - 指标模型 ID
   */
  async getModelFields(modelId: string): Promise<string[]> {
    const url = `${this.baseUrl}/metric-models/${modelId}/fields`;
    const response = await httpClient.get<string[]>(url);
    return response.data;
  }

  /**
   * 获取指标模型字段的值列表
   *
   * @param modelId - 指标模型 ID
   * @param fieldName - 字段名称
   */
  async getFieldValues(modelId: string, fieldName: string): Promise<FieldValuesResponse> {
    const url = `${this.baseUrl}/metric-models/${modelId}/field_values/${encodeURIComponent(fieldName)}`;
    const response = await httpClient.get<FieldValuesResponse>(url);
    return response.data;
  }

  /**
   * 获取指标模型的维度字段列表
   *
   * @param modelId - 指标模型 ID
   */
  async getModelLabels(modelId: string): Promise<string[]> {
    const url = `${this.baseUrl}/metric-models/${modelId}/labels`;
    const response = await httpClient.get<string[]>(url);
    return response.data;
  }
}

// ============================================================================
// 便捷函数
// ============================================================================

/**
 * 创建时间范围（今年）
 */
export function createCurrentYearRange(): { start: number; end: number } {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

  return {
    start: startOfYear.getTime(),
    end: endOfYear.getTime(),
  };
}

/**
 * 创建时间范围（指定年份）
 */
export function createYearRange(year: number): { start: number; end: number } {
  const startOfYear = new Date(year, 0, 1);
  const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);

  return {
    start: startOfYear.getTime(),
    end: endOfYear.getTime(),
  };
}

/**
 * 创建时间范围（最近 N 天）
 */
export function createLastDaysRange(days: number): { start: number; end: number } {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  return {
    start: start.getTime(),
    end: now.getTime(),
  };
}

/**
 * 创建时间范围（最近 N 个月）
 */
export function createLastMonthsRange(months: number): { start: number; end: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - months, now.getDate());

  return {
    start: start.getTime(),
    end: now.getTime(),
  };
}

// ============================================================================
// 导出
// ============================================================================

export const metricModelApi = new MetricModelApiService();
export default metricModelApi;

