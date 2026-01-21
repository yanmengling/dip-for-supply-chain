/**
 * 统一 API 配置中心
 *
 * 集中管理所有 API 的认证配置、基础URL和通用设置
 * 支持环境变量配置和运行时动态更新
 */

import { type KnowledgeNetworkConfig, type KnowledgeNetworkPreset, ApiConfigType } from '../types/apiConfig';
import { globalSettingsService } from '../services/globalSettingsService';

// ============================================================================
// 类型定义
// ============================================================================

/** API 认证配置 */
export interface AuthConfig {
  /** OAuth Bearer Token */
  token: string;
  /** Token 类型，默认 Bearer */
  tokenType?: 'Bearer' | 'Basic';
}

/** 单个 API 服务配置 */
export interface ApiServiceConfig {
  /** 服务基础 URL */
  baseUrl: string;
  /** 服务名称（用于日志和调试） */
  name: string;
  /** 请求超时时间（毫秒） */
  timeout?: number;
  /** 是否启用（可用于功能开关） */
  enabled?: boolean;
}

/** 全局 API 配置 */
export interface GlobalApiConfig {
  /** 全局认证配置（所有服务共享） */
  auth: AuthConfig;
  /** 各服务配置 */
  services: {
    /** Agent 智能体 API */
    agent: ApiServiceConfig & {
      appKey: string;
      streamTimeout?: number;
      maxRetries?: number;
    };
    /** 指标模型查询 API */
    metricModel: ApiServiceConfig;
    /** 本体/知识图谱 API */
    ontology: ApiServiceConfig;
    /** 预测/仿真 API */
    forecast: ApiServiceConfig;
  };
  /** 全局默认超时时间 */
  defaultTimeout: number;
  /** 是否开启调试模式 */
  debug: boolean;
}

// ============================================================================
// ============================================================================
// 🔑 全局 Token 配置
// ============================================================================

// 默认 Token（作为 fallback）
const DEFAULT_API_TOKEN = 'ory_at_7m2C7HYOIJtdConlo7Ntfcoy9-wyQ7wzdblSm_gER0k.h8DMS8RWII1Agln8oX_w7N1y6dor77fz_ZKf6FEc8RY';
// 默认知识网络ID
const DEFAULT_KNOWLEDGE_NETWORK_ID = 'd56v1l69olk4bpa66uv0';

// 动态获取 Token：优先从 globalSettingsService 读取，否则使用默认值
function getGlobalApiToken(): string {
  try {
    const token = globalSettingsService.getApiToken();
    return token || DEFAULT_API_TOKEN;
  } catch (error) {
    console.warn('[ApiConfig] Failed to load token from settings, using default:', error);
    return DEFAULT_API_TOKEN;
  }
}



// 动态获取知识网络 ID
function getGlobalKnowledgeNetworkId(defaultId?: string): string {
  try {
    const knId = globalSettingsService.getKnowledgeNetworkId();
    // If service returns default, but we have a specific env default, prioritize env default if service's is just generic default?
    // Actually service handles defaults. But we prefer what's in settings.
    return knId || defaultId || DEFAULT_KNOWLEDGE_NETWORK_ID;
  } catch (error) {
    console.warn('[ApiConfig] Failed to load KN ID from settings:', error);
    return defaultId || DEFAULT_KNOWLEDGE_NETWORK_ID;
  }
}

// 全局 Token（动态获取）
const GLOBAL_API_TOKEN = getGlobalApiToken();



// ============================================================================
// 环境变量读取
// ============================================================================

/**
 * 从环境变量读取配置
 */
function getEnvConfig(): Partial<{
  token: string;
  agentBaseUrl: string;
  agentAppKey: string;
  metricModelBaseUrl: string;
  ontologyBaseUrl: string;
  forecastBaseUrl: string;
  knowledgeNetworkId: string;
  timeout: number;
  debug: boolean;
}> {
  const config: any = {};

  // 统一 Token
  if (import.meta.env.VITE_API_TOKEN) {
    config.token = import.meta.env.VITE_API_TOKEN;
  }

  // Agent API
  if (import.meta.env.VITE_AGENT_API_BASE_URL) {
    config.agentBaseUrl = import.meta.env.VITE_AGENT_API_BASE_URL;
  }
  if (import.meta.env.VITE_AGENT_APP_KEY) {
    config.agentAppKey = import.meta.env.VITE_AGENT_APP_KEY;
  }

  // Metric Model API
  if (import.meta.env.VITE_METRIC_MODEL_BASE_URL) {
    config.metricModelBaseUrl = import.meta.env.VITE_METRIC_MODEL_BASE_URL;
  }

  // Ontology API
  if (import.meta.env.VITE_ONTOLOGY_BASE_URL) {
    config.ontologyBaseUrl = import.meta.env.VITE_ONTOLOGY_BASE_URL;
  }

  // Forecast API
  if (import.meta.env.VITE_FORECAST_BASE_URL) {
    config.forecastBaseUrl = import.meta.env.VITE_FORECAST_BASE_URL;
  }

  // Knowledge Network ID
  if (import.meta.env.VITE_KNOWLEDGE_NETWORK_ID) {
    config.knowledgeNetworkId = import.meta.env.VITE_KNOWLEDGE_NETWORK_ID;
  }

  // 通用配置
  if (import.meta.env.VITE_API_TIMEOUT) {
    config.timeout = parseInt(import.meta.env.VITE_API_TIMEOUT);
  }
  if (import.meta.env.VITE_API_DEBUG) {
    config.debug = import.meta.env.VITE_API_DEBUG === 'true';
  }

  return config;
}


// ============================================================================
// API 环境配置
// ============================================================================

/**
 * API 环境类型
 * - huida-new: 惠达供应链大脑模式，对接新的惠达数据 API
 */
export type ApiEnvironment = 'huida-new';

/** 环境配置接口 */
export interface EnvironmentConfig {
  /** 环境显示名称 */
  name: string;
  /** 环境描述 */
  description: string;
  /** API 基础 URL */
  baseUrl: string;
  /** 认证 Token */
  token: string;
  /** 服务端点路径 */
  services: {
    agent: string;
    metricModel: string;
    ontology: string;
    forecast: string;
  };
}

/**
 * 环境配置集合
 * 
 * 数据模式：
 * - huida-new (惠达供应链大脑): 对接新的惠达数据 API，提供优化后的数据服务
 */
export const ENVIRONMENTS: Record<ApiEnvironment, EnvironmentConfig> = {


  'huida-new': {
    name: '惠达供应链大脑',
    description: '对接新的惠达数据 API',
    baseUrl: '',
    token: GLOBAL_API_TOKEN,
    services: {
      // Proxy agent via generic proxy service to handle path rewrites
      agent: '/proxy-agent-service/agent-app/v1',
      // Proxy metric model to cloud (local 500 error)
      metricModel: '/proxy-metric/v1',  // 使用正确的指标查询API路径
      // Proxy via /proxy-manager to avoid collision with local /api proxy
      ontology: '/proxy-manager/v1',
      // Forecast API
      forecast: '/proxy-forecast/v1',
    }
  }
};

/** 默认环境 */
export const DEFAULT_ENVIRONMENT: ApiEnvironment = 'huida-new';

/** localStorage 存储键 */
const ENVIRONMENT_STORAGE_KEY = 'api-environment';

/**
 * 获取当前环境
 */
export function getCurrentEnvironment(): ApiEnvironment {
  try {
    const stored = localStorage.getItem(ENVIRONMENT_STORAGE_KEY);
    return (stored === 'huida-new')
      ? stored
      : DEFAULT_ENVIRONMENT;
  } catch (error) {
    console.warn('[API Config] Failed to read environment from localStorage:', error);
    return DEFAULT_ENVIRONMENT;
  }
}

/**
 * 设置当前环境
 */
export function setCurrentEnvironment(env: ApiEnvironment): void {
  try {
    localStorage.setItem(ENVIRONMENT_STORAGE_KEY, env);

    // Auto-switch Knowledge Network ID based on environment
    // Brain Mode: Use specific ID
    setKnowledgeNetworkId('d56v1l69olk4bpa66uv0');

    // CRITICAL: Update currentConfig to match the new environment
    const envConfig = ENVIRONMENTS[env];
    updateApiConfig({
      auth: {
        ...currentConfig.auth,
        token: envConfig.token
      },
      services: {
        ...currentConfig.services,
        agent: { ...currentConfig.services.agent, baseUrl: envConfig.services.agent },
        metricModel: { ...currentConfig.services.metricModel, baseUrl: envConfig.services.metricModel },
        ontology: { ...currentConfig.services.ontology, baseUrl: envConfig.services.ontology },
        forecast: { ...currentConfig.services.forecast, baseUrl: envConfig.services.forecast }
      }
    });

    console.log(`[API Config] Switched to ${ENVIRONMENTS[env].name}`);
  } catch (error) {
    console.error('[API Config] Failed to save environment to localStorage:', error);
  }
}

/**
 * 获取环境配置
 * @param env - 环境类型，不传则使用当前环境
 */
export function getEnvironmentConfig(env?: ApiEnvironment): EnvironmentConfig {
  const environment = env || getCurrentEnvironment();
  const config = ENVIRONMENTS[environment];

  if (!config) {
    console.warn(`[API Config] Unknown environment: ${environment}, falling back to default`);
    return ENVIRONMENTS[DEFAULT_ENVIRONMENT];
  }

  return config;
}

// ============================================================================
// 向后兼容（Backward Compatibility）
// ============================================================================

/** @deprecated 使用 ApiEnvironment 替代 */
export type DataMode = ApiEnvironment;

/** @deprecated 使用 getEnvironmentConfig 替代 */
export function getApiConfigForMode(mode: ApiEnvironment): EnvironmentConfig {
  console.warn('[API Config] getApiConfigForMode is deprecated, use getEnvironmentConfig instead');
  return getEnvironmentConfig(mode);
}

// ============================================================================
// 默认配置（向后兼容）
// ============================================================================

const envConfig = getEnvConfig();

/** 默认配置 */
const DEFAULT_CONFIG: GlobalApiConfig = {
  auth: {
    // Token 从全局常量 GLOBAL_API_TOKEN 获取（文件顶部定义）
    token: envConfig.token || GLOBAL_API_TOKEN,
    tokenType: 'Bearer',
  },
  services: {
    agent: {
      name: 'Agent API',
      baseUrl: envConfig.agentBaseUrl || '/api/agent-app/v1',
      // Force use of new supply chain cockpit appKey (ignore env variable to avoid stale cache)
      appKey: '01KEX8BP0GR6TMXQR7GE3XN16A',
      timeout: 120000,
      streamTimeout: 300000,
      maxRetries: 3,
      enabled: true,
    },
    metricModel: {
      name: 'Metric Model API',
      baseUrl: '/proxy-metric/v1',  // Use proxy path that vite.config.ts rewrites to /api/mdl-uniquery
      timeout: 60000,
      enabled: true,
    },
    ontology: {
      name: 'Ontology API',
      baseUrl: '/proxy-manager/v1',  // Use proxy path that vite.config.ts rewrites to /api/ontology-manager
      timeout: 60000,
      enabled: true,
    },
    forecast: {
      name: 'Forecast API',
      baseUrl: envConfig.forecastBaseUrl || '/proxy-forecast/v1',
      timeout: 60000,
      enabled: true,
    },
  },
  defaultTimeout: envConfig.timeout || 60000,
  debug: envConfig.debug || true, // 开启调试模式查看详细错误
};

// ============================================================================
// Knowledge Network Configuration
// ============================================================================



/** 知识网络预设配置 */
export const knowledgeNetworkPresets: KnowledgeNetworkPreset[] = [

  {
    id: 'd56v1l69olk4bpa66uv0',
    name: '惠达供应链大脑网络',
    description: '管理配置后台业务知识网络',
    isDefault: false,
    category: 'production',
    tags: ['huida-new', 'brain'],
  },
  // 可以添加更多预设配置
];

/** 当前知识网络ID（可运行时修改） */
/** 
 * 初始化当前配置
 * 基于当前环境设置初始值
 */
const initialEnv = getCurrentEnvironment();
const initialEnvConfig = ENVIRONMENTS[initialEnv];

/** 当前知识网络ID（可运行时修改） */
const envDefaultKnId = envConfig.knowledgeNetworkId ||
  (initialEnv === 'huida-new' ? 'd56v1l69olk4bpa66uv0' : DEFAULT_KNOWLEDGE_NETWORK_ID);

let currentKnowledgeNetworkId: string = getGlobalKnowledgeNetworkId(envDefaultKnId);

// ============================================================================
// Token Initialization (DIP Integration)
// ============================================================================

(function initializeTokenFromUrl() {
  if (typeof window === 'undefined') return;

  // Check for 'token' or 'access_token' in URL search params
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') || params.get('access_token');

  if (token) {
    console.log('[API Config] Detected token in URL, initializing session...');
    setAuthToken(token, false); // Store in sessionStorage

    // Optional: Clean URL to remove sensitive token
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + window.location.hash;
    window.history.replaceState({ path: newUrl }, '', newUrl);
  }
})();

// ============================================================================
// 配置管理器
// ============================================================================

/** 当前配置（可运行时修改） */
let currentConfig: GlobalApiConfig = {
  ...DEFAULT_CONFIG,
  // Apply environment specific overrides
  auth: {
    ...DEFAULT_CONFIG.auth,
    token: initialEnvConfig.token
  },
  services: {
    ...DEFAULT_CONFIG.services,
    agent: { ...DEFAULT_CONFIG.services.agent, baseUrl: initialEnvConfig.services.agent },
    metricModel: { ...DEFAULT_CONFIG.services.metricModel, baseUrl: initialEnvConfig.services.metricModel },
    ontology: { ...DEFAULT_CONFIG.services.ontology, baseUrl: initialEnvConfig.services.ontology }
  }
};

// Force apply initial configuration (logging purposes and consistency check)
console.log('[API Config] Agent config initialized:', {
  environment: ENVIRONMENTS[initialEnv].name,
  appKey: currentConfig.services.agent.appKey,
  baseUrl: currentConfig.services.agent.baseUrl
});

/**
 * 获取当前 API 配置
 */
export function getApiConfig(): GlobalApiConfig {
  return currentConfig;
}

/**
 * 获取认证 Token
 */
export function getAuthToken(): string {
  // 1. 优先从 sessionStorage 获取（DIP 容器通常会注入或通过 URL 传递后存储在这里）
  if (typeof window !== 'undefined' && window.sessionStorage) {
    const sessionToken = window.sessionStorage.getItem('api_auth_token');
    if (sessionToken) {
      return sessionToken;
    }
  }

  // 2. 其次从 localStorage 获取（如果实现了持久化登录）
  if (typeof window !== 'undefined' && window.localStorage) {
    const localToken = window.localStorage.getItem('api_auth_token');
    if (localToken) {
      return localToken;
    }
  }

  // 3. 最后使用配置中的 Token (主要用于本地开发或 fallback)
  if (currentConfig.auth.token) {
    return currentConfig.auth.token;
  }

  return '';
}

/**
 * 获取认证请求头
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (!token) {
    return {};
  }

  const tokenType = currentConfig.auth.tokenType || 'Bearer';
  return {
    Authorization: `${tokenType} ${token}`,
  };
}

/**
 * 设置认证 Token
 * @param token - OAuth Token
 * @param persistent - 是否持久化存储（localStorage）
 */
export function setAuthToken(token: string, persistent: boolean = false): void {
  currentConfig.auth.token = token;

  if (typeof window !== 'undefined') {
    if (persistent && window.localStorage) {
      window.localStorage.setItem('api_auth_token', token);
      window.sessionStorage.removeItem('api_auth_token');
    } else if (window.sessionStorage) {
      window.sessionStorage.setItem('api_auth_token', token);
    }
  }

  if (currentConfig.debug) {
    console.log('[API Config] Token updated');
  }
}

/**
 * 清除认证 Token
 */
export function clearAuthToken(): void {
  currentConfig.auth.token = '';

  if (typeof window !== 'undefined') {
    window.sessionStorage?.removeItem('api_auth_token');
    window.localStorage?.removeItem('api_auth_token');
  }

  if (currentConfig.debug) {
    console.log('[API Config] Token cleared');
  }
}

/**
 * 更新 API 配置
 */
export function updateApiConfig(updates: Partial<GlobalApiConfig>): void {
  currentConfig = {
    ...currentConfig,
    ...updates,
    auth: {
      ...currentConfig.auth,
      ...updates.auth,
    },
    services: {
      ...currentConfig.services,
      ...updates.services,
    },
  };

  if (currentConfig.debug) {
    console.log('[API Config] Configuration updated:', currentConfig);
  }
}

/**
 * 重置为默认配置
 */
export function resetApiConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG };

  if (currentConfig.debug) {
    console.log('[API Config] Configuration reset to defaults');
  }
}

/**
 * 获取指定服务的配置
 */
export function getServiceConfig<K extends keyof GlobalApiConfig['services']>(
  serviceName: K
): GlobalApiConfig['services'][K] {
  const config = currentConfig.services[serviceName];
  if (serviceName === 'agent') {
    console.log('[DEBUG] getServiceConfig agent appKey:', (config as any).appKey);
  }
  return config;
}

// ============================================================================
// Knowledge Network Configuration Methods
// ============================================================================

/**
 * 获取当前知识网络ID
 */
export function getKnowledgeNetworkId(): string {
  return currentKnowledgeNetworkId;
}

/**
 * 设置知识网络ID
 * @param id - 知识网络ID
 */
export function setKnowledgeNetworkId(id: string): void {
  currentKnowledgeNetworkId = id;

  // Sync to global settings persistence
  // Sync to global settings persistence
  try {
    globalSettingsService.updateKnowledgeNetworkId(id);
  } catch (error) {
    console.warn('[ApiConfig] Failed to persist KN ID to settings:', error);
  }

  if (currentConfig.debug) {
    console.log('[API Config] Knowledge Network ID updated:', id);
  }
}



/**
 * 获取当前知识网络配置
 */
export function getKnowledgeNetworkConfig(): KnowledgeNetworkConfig | null {
  const preset = knowledgeNetworkPresets.find(p => p.id === currentKnowledgeNetworkId);

  const baseConfig = {
    id: currentKnowledgeNetworkId,
    knowledgeNetworkId: currentKnowledgeNetworkId,
    type: ApiConfigType.KNOWLEDGE_NETWORK,
    enabled: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    objectTypes: {}, // Defaults to empty
    tags: ['system-generated']
  };

  if (preset) {
    return {
      ...baseConfig,
      name: preset.name,
      description: preset.description,
      tags: preset.tags || baseConfig.tags
    };
  }

  // 如果不在预设中，返回基本配置
  return {
    ...baseConfig,
    name: '自定义知识网络',
  };
}

/**
 * 根据ID查找知识网络预设
 */
export function findKnowledgeNetworkPreset(id: string): KnowledgeNetworkPreset | undefined {
  return knowledgeNetworkPresets.find(p => p.id === id);
}

// ============================================================================
// 导出
// ============================================================================

export { currentConfig as apiConfig };
export default currentConfig;

