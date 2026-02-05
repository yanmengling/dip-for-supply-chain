/**
 * HTTP 客户端封装
 *
 * 提供统一的 HTTP 请求方法，自动处理认证、错误、重试等
 * 支持根据数据模式（Mock/API）动态选择 API 配置
 */

import {
  getAuthHeaders,
  getAuthToken,
  getApiConfig,
  getCurrentEnvironment,
  getEnvironmentConfig,
  type ApiEnvironment
} from '../config/apiConfig';
import { dipEnvironmentService } from '../services/dipEnvironmentService';

// ============================================================================
// 类型定义
// ============================================================================

/** 请求配置 */
export interface RequestConfig {
  /** 请求超时时间（毫秒） */
  timeout?: number;
  /** 额外的请求头 */
  headers?: Record<string, string>;
  /** 是否跳过认证 */
  skipAuth?: boolean;
  /** 重试次数 */
  retries?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
  /** AbortController 信号 */
  signal?: AbortSignal;
}

/** API 响应包装 */
export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

/** API 错误 */
export class ApiError extends Error {
  status: number;
  code?: string;
  details?: any;

  constructor(message: string, status: number, code?: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ============================================================================
// HTTP 客户端类
// ============================================================================

class HttpClient {
  private defaultTimeout = 60000;
  private defaultRetries = 0;
  private defaultRetryDelay = 1000;

  // Token refresh concurrency control
  private isRefreshing: boolean = false;
  private refreshQueue: Array<{
    resolve: (response: Response | null) => void;
    url: string;
    options: RequestInit;
    config?: RequestConfig;
  }> = [];

  /**
   * 构建完整的请求头
   */
  private buildHeaders(config?: RequestConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // 添加认证头（根据当前环境获取对应的 token）
    if (!config?.skipAuth) {
      const token = getAuthToken(); // Use dynamic token getter
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;

        // Always log the token prefix for debugging
        const environment = getCurrentEnvironment();
        const envConfig = getEnvironmentConfig(environment);
        console.log(`[HTTP Client] Using environment: ${envConfig.name}, Token prefix: ${token.substring(0, 20)}...`);
      }
    }

    // 添加自定义头
    if (config?.headers) {
      Object.assign(headers, config.headers);
    }

    return headers;
  }

  /**
   * 处理响应错误
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    let errorCode: string | undefined;
    let errorDetails: any;

    try {
      const errorData = await response.json();
      if (errorData.message || errorData.description) {
        errorMessage = errorData.message || errorData.description;
      }
      if (errorData.error_code || errorData.code) {
        errorCode = errorData.error_code || errorData.code;
      }
      errorDetails = errorData;

      // 🔍 添加详细错误日志以便调试
      console.error('[HTTP Client] ❌ API 错误详情:', {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        errorCode,
        errorMessage,
        errorDetails: JSON.stringify(errorDetails).substring(0, 500)
      });
    } catch {
      // JSON 解析失败，使用默认错误信息
    }

    throw new ApiError(errorMessage, response.status, errorCode, errorDetails);
  }

  /**
   * 执行带超时的 fetch 请求
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number,
    signal?: AbortSignal
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // 合并外部 signal
    const combinedSignal = signal
      ? new AbortController().signal // 简化处理
      : controller.signal;

    try {
      const response = await fetch(url, {
        ...options,
        signal: combinedSignal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === 'AbortError') {
        throw new ApiError('请求超时', 408, 'TIMEOUT');
      }
      throw error;
    }
  }

  /**
   * 执行带重试的请求
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    config?: RequestConfig,
    attempt: number = 0
  ): Promise<Response> {
    const timeout = config?.timeout || this.defaultTimeout;
    const retries = config?.retries ?? this.defaultRetries;
    const retryDelay = config?.retryDelay || this.defaultRetryDelay;

    try {
      const response = await this.fetchWithTimeout(url, options, timeout, config?.signal);

      // 5xx 错误可重试
      if (response.status >= 500 && attempt < retries) {
        if (getApiConfig().debug) {
          console.warn(`[HTTP Client] Server error, retrying (${attempt + 1}/${retries})...`);
        }
        await this.sleep(retryDelay * Math.pow(2, attempt));
        return this.fetchWithRetry(url, options, config, attempt + 1);
      }

      return response;
    } catch (error) {
      // 网络错误可重试
      if (attempt < retries && this.isRetryableError(error)) {
        if (getApiConfig().debug) {
          console.warn(`[HTTP Client] Network error, retrying (${attempt + 1}/${retries})...`);
        }
        await this.sleep(retryDelay * Math.pow(2, attempt));
        return this.fetchWithRetry(url, options, config, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * 判断错误是否可重试
   */
  private isRetryableError(error: any): boolean {
    if (error instanceof ApiError) {
      return error.status >= 500 || error.status === 429;
    }
    // 网络错误
    return error instanceof TypeError && error.message.includes('fetch');
  }

  /**
   * 延迟工具函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Handle 401 response - attempt token refresh and retry (DIP mode only)
   * Returns the retry response on success, null on failure
   */
  private async handle401Response(
    url: string,
    options: RequestInit,
    config?: RequestConfig
  ): Promise<Response | null> {
    // Only handle 401 in DIP mode
    if (!dipEnvironmentService.isDipMode()) {
      console.log('[HTTP Client] 401 received but not in DIP mode, skipping refresh');
      return null;
    }

    console.log('[HTTP Client] 401 Unauthorized detected, attempting token refresh');

    // If already refreshing, queue this request
    if (this.isRefreshing) {
      console.log('[HTTP Client] Token refresh in progress, queuing request');
      return new Promise((resolve) => {
        this.refreshQueue.push({ resolve, url, options, config });
      });
    }

    // Start refresh process
    this.isRefreshing = true;

    try {
      const newToken = await dipEnvironmentService.refreshToken();

      if (newToken) {
        console.log('[HTTP Client] Token refresh successful, retrying request');

        // Update headers with new token
        const newHeaders = {
          ...options.headers,
          Authorization: `Bearer ${newToken}`,
        } as Record<string, string>;

        // Process queued requests with new token
        this.refreshQueue.forEach(({ resolve, url: qUrl, options: qOptions, config: qConfig }) => {
          const qNewHeaders = {
            ...qOptions.headers,
            Authorization: `Bearer ${newToken}`,
          } as Record<string, string>;

          this.fetchWithTimeout(
            qUrl,
            { ...qOptions, headers: qNewHeaders },
            qConfig?.timeout || this.defaultTimeout,
            qConfig?.signal
          ).then(resolve).catch(() => resolve(null));
        });
        this.refreshQueue = [];

        // Retry the original request
        return await this.fetchWithTimeout(
          url,
          { ...options, headers: newHeaders },
          config?.timeout || this.defaultTimeout,
          config?.signal
        );
      } else {
        console.error('[HTTP Client] Token refresh failed');

        // Notify queued requests of failure
        this.refreshQueue.forEach(({ resolve }) => resolve(null));
        this.refreshQueue = [];

        // Trigger logout
        dipEnvironmentService.logout();
        return null;
      }
    } catch (error) {
      console.error('[HTTP Client] Token refresh error:', error);

      // Notify queued requests of failure
      this.refreshQueue.forEach(({ resolve }) => resolve(null));
      this.refreshQueue = [];

      // Trigger logout
      dipEnvironmentService.logout();
      return null;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Check if response is 401 and attempt refresh+retry
   * Returns the response to use (original or retried)
   */
  private async handleResponseWith401Check(
    response: Response,
    url: string,
    options: RequestInit,
    config?: RequestConfig
  ): Promise<Response> {
    if (response.status === 401) {
      const retryResponse = await this.handle401Response(url, options, config);
      if (retryResponse && retryResponse.ok) {
        return retryResponse;
      }
      // If retry failed or returned another error, return original 401 response
      // to let the caller handle it normally
    }
    return response;
  }

  /**
   * GET 请求
   */
  async get<T>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    const headers = this.buildHeaders(config);
    const options: RequestInit = { method: 'GET', headers };

    let response = await this.fetchWithRetry(url, options, config);

    // Handle 401 with token refresh (DIP mode only)
    response = await this.handleResponseWith401Check(response, url, options, config);

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = await response.json();
    return { data, status: response.status, headers: response.headers };
  }

  /**
   * POST 请求
   */
  async post<T>(url: string, body?: any, config?: RequestConfig): Promise<ApiResponse<T>> {
    const headers = this.buildHeaders(config);
    const options: RequestInit = {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    };

    let response = await this.fetchWithRetry(url, options, config);

    // Handle 401 with token refresh (DIP mode only)
    response = await this.handleResponseWith401Check(response, url, options, config);

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = await response.json();
    return { data, status: response.status, headers: response.headers };
  }

  /**
   * POST 请求（使用 GET 方法重载）
   * 用于某些 API 使用 POST 方法但实际是 GET 语义的情况
   */
  async postAsGet<T>(url: string, body?: any, config?: RequestConfig): Promise<ApiResponse<T>> {
    const headers = {
      ...this.buildHeaders(config),
      'X-HTTP-Method-Override': 'GET',
    };
    const options: RequestInit = {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    };

    let response = await this.fetchWithRetry(url, options, config);

    // Handle 401 with token refresh (DIP mode only)
    response = await this.handleResponseWith401Check(response, url, options, config);

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = await response.json();
    return { data, status: response.status, headers: response.headers };
  }

  /**
   * PUT 请求
   */
  async put<T>(url: string, body?: any, config?: RequestConfig): Promise<ApiResponse<T>> {
    const headers = this.buildHeaders(config);
    const options: RequestInit = {
      method: 'PUT',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    };

    let response = await this.fetchWithRetry(url, options, config);

    // Handle 401 with token refresh (DIP mode only)
    response = await this.handleResponseWith401Check(response, url, options, config);

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = await response.json();
    return { data, status: response.status, headers: response.headers };
  }

  /**
   * DELETE 请求
   */
  async delete<T>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    const headers = this.buildHeaders(config);
    const options: RequestInit = { method: 'DELETE', headers };

    let response = await this.fetchWithRetry(url, options, config);

    // Handle 401 with token refresh (DIP mode only)
    response = await this.handleResponseWith401Check(response, url, options, config);

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = await response.json();
    return { data, status: response.status, headers: response.headers };
  }

  /**
   * 流式 POST 请求
   */
  async postStream(
    url: string,
    body: any,
    onChunk: (chunk: string) => void,
    config?: RequestConfig
  ): Promise<void> {
    const headers = this.buildHeaders(config);
    const timeout = config?.timeout || 300000; // 流式请求默认 5 分钟超时
    const options: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    };

    let response = await this.fetchWithTimeout(url, options, timeout, config?.signal);

    // Handle 401 with token refresh (DIP mode only)
    if (response.status === 401) {
      const retryResponse = await this.handle401Response(url, options, config);
      if (retryResponse && retryResponse.ok) {
        response = retryResponse;
      }
    }

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ApiError('Response body is not readable', 500, 'STREAM_ERROR');
    }

    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        onChunk(chunk);
      }
    } finally {
      reader.releaseLock();
    }
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const httpClient = new HttpClient();
export default httpClient;

// ============================================================================
// fetchWithAuth: Raw fetch with automatic token refresh + retry
// ============================================================================

/**
 * Wrapper around native fetch() that adds:
 * 1. Automatic auth headers from apiConfig
 * 2. On 401 in DIP mode: refresh token and retry once
 *
 * Use this instead of raw fetch() for API calls that need DIP token handling.
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const { getAuthHeaders } = await import('../config/apiConfig');

  // Add auth headers
  const headers = {
    ...getAuthHeaders(),
    ...(options.headers as Record<string, string> || {}),
  };

  const response = await fetch(url, { ...options, headers });

  // If 401 and in DIP mode, try refresh + retry
  if (response.status === 401 && dipEnvironmentService.isDipMode()) {
    console.log('[fetchWithAuth] 401 detected, refreshing token...');
    const newToken = await dipEnvironmentService.refreshToken();

    if (newToken) {
      console.log('[fetchWithAuth] Token refreshed, retrying request');
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${newToken}`,
      };
      return fetch(url, { ...options, headers: retryHeaders });
    }
  }

  return response;
}

