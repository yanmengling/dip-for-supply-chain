/**
 * 预测算子服务 - 前端集成
 *
 * 提供统一的预测算法调用接口：
 * - 优先调用 Python 预测算子 API
 * - API 不可用时自动回退到本地 TypeScript 实现
 *
 * 支持的算法：
 * - Prophet（需要后端API）
 * - 简单指数平滑
 * - Holt 线性指数平滑
 * - Holt-Winters 三重指数平滑
 * - ARIMA（需要后端API）
 * - 集成预测
 */

import { httpClient } from '../api/httpClient';
import { getEnvironmentConfig } from '../config/apiConfig';
import {
  simpleExponentialSmoothing,
  holtLinearSmoothing,
  holtWintersSmoothing,
  type ProphetParams,
  type SmoothingParams,
} from './forecastAlgorithmService';
import type { ProductSalesHistory, ForecastAlgorithm } from '../types/ontology';

// Re-export ForecastAlgorithm for convenience
export type { ForecastAlgorithm };

// ============================================================================
// 类型定义
// ============================================================================

export interface ForecastInput {
  product_id: string;
  historical_data: Array<{ month: string; quantity: number }>;
  forecast_periods: number;
  parameters?: Record<string, any>;
}

/**
 * Prophet-specific forecast input with typed parameters
 */
export interface ProphetForecastInput extends Omit<ForecastInput, 'parameters'> {
  parameters?: ProphetParams;
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
}

export interface ForecastMetrics {
  mape?: number;
  rmse?: number;
  mae?: number;
}

export interface ForecastOutput {
  product_id: string;
  algorithm: string;
  forecast_values: number[];
  confidence_intervals?: ConfidenceInterval[];
  metrics?: ForecastMetrics;
  generated_at: string;
}

// ============================================================================
// API 端点映射
// ============================================================================

const ALGORITHM_ENDPOINTS: Record<ForecastAlgorithm, string> = {
  prophet: '/api/v1/forecast/prophet',
  simple_exponential: '/api/v1/forecast/simple-exp',
  holt_linear: '/api/v1/forecast/holt-linear',
  holt_winters: '/api/v1/forecast/holt-winters',
  arima: '/api/v1/forecast/arima',
  ensemble: '/api/v1/forecast/ensemble',
};

// 支持本地回退的算法
const LOCAL_SUPPORTED_ALGORITHMS: ForecastAlgorithm[] = [
  'simple_exponential',
  'holt_linear',
  'holt_winters',
];

// ============================================================================
// 预测算子服务类
// ============================================================================

export class ForecastOperatorService {
  private baseUrl: string;
  private timeout: number = 30000; // 30秒超时
  private apiAvailable: boolean | null = null; // 缓存API可用性
  private lastHealthCheck: number = 0;
  private healthCheckInterval: number = 60000; // 1分钟

  constructor() {
    const envConfig = getEnvironmentConfig();
    // 使用 forecast 端点，如果没有配置则使用默认值
    this.baseUrl = (envConfig as any).forecastBaseUrl || '/proxy-forecast';
  }

  /**
   * 健康检查 - 检测后端 API 是否可用
   */
  async healthCheck(): Promise<boolean> {
    const now = Date.now();

    // 使用缓存的结果（1分钟内）
    if (this.apiAvailable !== null && now - this.lastHealthCheck < this.healthCheckInterval) {
      return this.apiAvailable;
    }

    try {
      const url = `${this.baseUrl}/health`;
      const response = await httpClient.get(url, { timeout: 5000 });
      this.apiAvailable = response.status === 200;
    } catch {
      this.apiAvailable = false;
    }

    this.lastHealthCheck = now;
    return this.apiAvailable;
  }

  /**
   * 调用预测 API
   */
  async forecast(
    algorithm: ForecastAlgorithm,
    input: ForecastInput
  ): Promise<ForecastOutput & { usedFallback?: boolean }> {
    // Prophet 特殊处理 - 优先尝试 API，失败时使用 Holt-Winters 降级
    if (algorithm === 'prophet') {
      return this.forecastProphet(input as ProphetForecastInput);
    }

    // 首先尝试调用 API
    try {
      const isApiAvailable = await this.healthCheck();

      if (isApiAvailable) {
        const endpoint = ALGORITHM_ENDPOINTS[algorithm];
        const url = `${this.baseUrl}${endpoint}`;

        const response = await httpClient.post<ForecastOutput>(url, input, {
          timeout: this.timeout,
        });

        return response.data;
      }
    } catch (error) {
      console.warn(`[ForecastOperatorService] API调用失败，尝试本地回退:`, error);
    }

    // API 不可用，尝试本地回退
    if (LOCAL_SUPPORTED_ALGORITHMS.includes(algorithm)) {
      console.log(`[ForecastOperatorService] 使用本地算法: ${algorithm}`);
      return this.forecastLocal(algorithm, input);
    }

    // ARIMA 等需要后端支持
    throw new Error(`算法 ${algorithm} 需要后端API支持，但API当前不可用`);
  }

  /**
   * Prophet 预测 - API优先，降级到 Holt-Winters
   */
  private async forecastProphet(
    input: ProphetForecastInput
  ): Promise<ForecastOutput & { usedFallback?: boolean }> {
    const params = input.parameters;

    // 首先尝试调用 Prophet API
    try {
      const isApiAvailable = await this.healthCheck();

      if (isApiAvailable) {
        console.log(`[ForecastOperatorService] 调用 Prophet API...`);
        const endpoint = ALGORITHM_ENDPOINTS.prophet;
        const url = `${this.baseUrl}${endpoint}`;

        // 转换前端参数为 API 格式
        const apiInput = this.convertProphetParamsToApiFormat(input);

        const response = await httpClient.post<ForecastOutput>(url, apiInput, {
          timeout: this.timeout,
        });

        console.log(`[ForecastOperatorService] Prophet API 调用成功`);
        return response.data;
      }
    } catch (error) {
      console.warn(`[ForecastOperatorService] Prophet API 调用失败:`, error);
    }

    // API 不可用或调用失败，使用 Holt-Winters 降级
    console.log(`[ForecastOperatorService] Prophet API 不可用，使用 Holt-Winters 降级`);

    // 将 Prophet 参数转换为 Holt-Winters 兼容的参数
    const hwParams: SmoothingParams = {
      alpha: 0.3,
      beta: 0.1,
      gamma: 0.2,
      seasonLength: 12,
    };

    // 转换输入数据为 ProductSalesHistory 格式
    const history: ProductSalesHistory[] = input.historical_data.map(h => ({
      productId: input.product_id,
      month: h.month,
      quantity: h.quantity,
    }));

    let forecastValues = holtWintersSmoothing(history, input.forecast_periods, hwParams);
    forecastValues = forecastValues.map(v => Math.max(0, Math.round(v)));

    return {
      product_id: input.product_id,
      algorithm: 'prophet',
      forecast_values: forecastValues,
      generated_at: new Date().toISOString(),
      usedFallback: true, // 标记使用了降级
    };
  }

  /**
   * 转换 Prophet 前端参数为 API 格式
   */
  private convertProphetParamsToApiFormat(input: ProphetForecastInput): Record<string, any> {
    const params = input.parameters;

    return {
      product_id: input.product_id,
      historical_data: input.historical_data,
      forecast_periods: input.forecast_periods,
      parameters: params ? {
        seasonality_mode: params.seasonalityMode || 'multiplicative',
        yearly_seasonality: params.yearlySeasonality ?? true,
        weekly_seasonality: params.weeklySeasonality ?? false,
        changepoint_prior_scale: params.changepointPriorScale || 0.05,
        seasonality_prior_scale: params.seasonalityPriorScale || 10,
        interval_width: params.intervalWidth || 0.95,
        growth: params.growth || 'linear',
      } : undefined,
    };
  }

  /**
   * 批量预测
   */
  async batchForecast(
    algorithm: ForecastAlgorithm,
    inputs: ForecastInput[]
  ): Promise<ForecastOutput[]> {
    try {
      const isApiAvailable = await this.healthCheck();

      if (isApiAvailable) {
        const url = `${this.baseUrl}/api/v1/forecast/batch?algorithm=${algorithm}`;

        const response = await httpClient.post<ForecastOutput[]>(url, inputs, {
          timeout: this.timeout * 2, // 批量请求超时时间更长
        });

        return response.data;
      }
    } catch (error) {
      console.warn(`[ForecastOperatorService] 批量API调用失败:`, error);
    }

    // 逐个使用本地回退
    const results: ForecastOutput[] = [];
    for (const input of inputs) {
      try {
        if (LOCAL_SUPPORTED_ALGORITHMS.includes(algorithm)) {
          const result = await this.forecastLocal(algorithm, input);
          results.push(result);
        }
      } catch (e) {
        console.error(`[ForecastOperatorService] 本地预测失败:`, e);
      }
    }
    return results;
  }

  /**
   * 本地预测回退（当API不可用时）
   * 使用 forecastAlgorithmService 中的 TypeScript 实现
   */
  async forecastLocal(
    algorithm: ForecastAlgorithm,
    input: ForecastInput
  ): Promise<ForecastOutput> {
    // 转换输入数据为 ProductSalesHistory 格式
    const history: ProductSalesHistory[] = input.historical_data.map(h => ({
      productId: input.product_id,
      month: h.month,
      quantity: h.quantity,
    }));

    let forecastValues: number[];

    switch (algorithm) {
      case 'simple_exponential':
        forecastValues = simpleExponentialSmoothing(history, input.forecast_periods);
        break;
      case 'holt_linear':
        forecastValues = holtLinearSmoothing(history, input.forecast_periods);
        break;
      case 'holt_winters':
        forecastValues = holtWintersSmoothing(history, input.forecast_periods, { seasonLength: 12 });
        break;
      default:
        // Prophet、ARIMA、集成预测需要后端支持
        throw new Error(`算法 ${algorithm} 需要后端API支持`);
    }

    // 确保预测值非负
    forecastValues = forecastValues.map(v => Math.max(0, Math.round(v)));

    return {
      product_id: input.product_id,
      algorithm,
      forecast_values: forecastValues,
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * 获取算法信息
   */
  getAlgorithmInfo(algorithm: ForecastAlgorithm): {
    name: string;
    displayName: string;
    description: string;
    requiresApi: boolean;
  } {
    const info: Record<ForecastAlgorithm, ReturnType<typeof this.getAlgorithmInfo>> = {
      prophet: {
        name: 'prophet',
        displayName: 'Prophet预测',
        description: '适用于有趋势和季节性的数据，由Facebook开发',
        requiresApi: true,
      },
      simple_exponential: {
        name: 'simple_exponential',
        displayName: '简单指数平滑',
        description: '适用于无趋势无季节性的稳定数据',
        requiresApi: false,
      },
      holt_linear: {
        name: 'holt_linear',
        displayName: 'Holt线性指数平滑',
        description: '适用于有趋势但无季节性的数据',
        requiresApi: false,
      },
      holt_winters: {
        name: 'holt_winters',
        displayName: 'Holt-Winters三重指数平滑',
        description: '适用于有趋势和季节性的数据',
        requiresApi: false,
      },
      arima: {
        name: 'arima',
        displayName: 'ARIMA时间序列',
        description: '自动选择参数的复杂时间序列分析',
        requiresApi: true,
      },
      ensemble: {
        name: 'ensemble',
        displayName: '集成预测',
        description: '综合多种算法的预测结果',
        requiresApi: true,
      },
    };

    return info[algorithm];
  }

  /**
   * 获取所有可用算法
   */
  getAllAlgorithms(): ForecastAlgorithm[] {
    return Object.keys(ALGORITHM_ENDPOINTS) as ForecastAlgorithm[];
  }

  /**
   * 获取本地支持的算法
   */
  getLocalSupportedAlgorithms(): ForecastAlgorithm[] {
    return [...LOCAL_SUPPORTED_ALGORITHMS];
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const forecastOperatorService = new ForecastOperatorService();
export default forecastOperatorService;
