/**
 * Agent API Configuration
 *
 * 基于统一配置的 Agent API 配置
 * 使用 src/config/apiConfig.ts 作为统一配置入口
 *
 * @deprecated 建议直接使用 apiConfig 中的配置
 * @see ../config/apiConfig.ts
 */

import { getServiceConfig, getAuthToken as getGlobalAuthToken } from './apiConfig';

export interface AgentApiConfig {
  baseUrl: string;
  appKey: string;
  token?: string;
  timeout?: number;
  streamTimeout?: number;
  maxRetries?: number;
}

/**
 * 从统一配置获取 Agent API 配置
 */
function getAgentConfigFromGlobal(): AgentApiConfig {
  const serviceConfig = getServiceConfig('agent');

  return {
    baseUrl: serviceConfig.baseUrl,
    appKey: serviceConfig.appKey,
    token: getGlobalAuthToken(),
    timeout: serviceConfig.timeout,
    streamTimeout: serviceConfig.streamTimeout,
    maxRetries: serviceConfig.maxRetries,
  };
}

/**
 * Agent API 配置
 * 使用 Proxy 动态获取最新配置，避免缓存问题
 */
export const agentConfig: AgentApiConfig = new Proxy({} as AgentApiConfig, {
  get(_target, prop: keyof AgentApiConfig) {
    const freshConfig = getAgentConfigFromGlobal();
    return freshConfig[prop];
  },
  set(_target, prop: keyof AgentApiConfig, value: any) {
    // Allow token to be set directly
    if (prop === 'token') {
      // This is a no-op since we get token from global config
      // but we need to support the setToken pattern
      return true;
    }
    return true;
  }
});

/**
 * Update agent configuration at runtime
 * @deprecated 使用 updateApiConfig 代替
 */
export function updateAgentConfig(updates: Partial<AgentApiConfig>) {
  Object.assign(agentConfig, updates);
}

/**
 * Get current token from config
 * 委托给统一配置
 */
export function getAuthToken(): string | undefined {
  return getGlobalAuthToken() || undefined;
}

/**
 * Set authentication token
 * @deprecated 使用 apiConfig.setAuthToken 代替
 */
export function setAuthToken(token: string, persistent: boolean = false) {
  agentConfig.token = token;

  if (typeof window !== 'undefined') {
    if (persistent && window.localStorage) {
      window.localStorage.setItem('api_auth_token', token);
    } else if (window.sessionStorage) {
      window.sessionStorage.setItem('api_auth_token', token);
    }
  }
}

/**
 * Clear authentication token
 * @deprecated 使用 apiConfig.clearAuthToken 代替
 */
export function clearAuthToken() {
  agentConfig.token = undefined;

  if (typeof window !== 'undefined') {
    if (window.sessionStorage) {
      window.sessionStorage.removeItem('api_auth_token');
    }
    if (window.localStorage) {
      window.localStorage.removeItem('api_auth_token');
    }
  }
}
