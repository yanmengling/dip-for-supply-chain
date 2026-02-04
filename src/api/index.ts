/**
 * API 服务层入口
 *
 * 统一导出所有 API 服务，方便业务层调用
 *
 * 目录结构：
 * src/api/
 * ├── index.ts              # 入口文件（本文件）
 * ├── httpClient.ts         # HTTP 客户端封装
 * ├── metricModelApi.ts     # 指标模型 API
 * └── ...                   # 其他 API 服务
 *
 * 使用示例：
 *
 * ```typescript
 * import { metricModelApi, createYearRange } from '@/api';
 *
 * // 查询 2025 年的指标数据
 * const { start, end } = createYearRange(2025);
 * const result = await metricModelApi.queryByModelId('d50hck5g5lk40hvh4880', {
 *   instant: false,
 *   start,
 *   end,
 *   step: '1M',
 * }, { includeModel: true });
 * ```
 */

// ============================================================================
// HTTP 客户端
// ============================================================================

export { httpClient, ApiError } from './httpClient';
export type { RequestConfig, ApiResponse } from './httpClient';

// ============================================================================
// 指标模型 API
// ============================================================================

export {
  metricModelApi,
  createCurrentYearRange,
  createYearRange,
  createLastDaysRange,
  createLastMonthsRange,
} from './metricModelApi';

export type {
  FilterOperation,
  MetricFilter,
  MetricQueryRequest,
  MetricData,
  MetricModel,
  MetricQueryResult,
  FieldValuesResponse,
  QueryOptions,
  Label,
} from './metricModelApi';

// ============================================================================
// 本体/知识图谱 API
// ============================================================================

export { ontologyApi } from './ontologyApi';
export type {
  ObjectType,
  ObjectProperty,
  RelationType,
  EdgeType,
  EdgeProperty,
  KnowledgeNetwork,
  ObjectTypesResponse,
  RelationTypesResponse,
  EdgeTypesResponse,
  ObjectTypesQueryOptions,
} from './ontologyApi';

// ============================================================================
// 配置相关（重新导出，方便使用）
// ============================================================================

export {
  getApiConfig,
  getAuthToken,
  getAuthHeaders,
  setAuthToken,
  clearAuthToken,
  updateApiConfig,
  resetApiConfig,
  getServiceConfig,
  apiConfig,
} from '../config/apiConfig';

export type {
  AuthConfig,
  ApiServiceConfig,
  GlobalApiConfig,
} from '../config/apiConfig';

