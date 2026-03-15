/**
 * 首次加载时配置的合并顺序：默认值 → localStorage → window.__SKILL_CONFIG__ → URL 参数
 */

import type { KnowledgeNetworkListItem } from './services/skillOntologyClient';
import type { KNVisualizationSkillConfig } from './skills';

const STORAGE_KEY = 'kn_visualization_skill_config';
const TOKEN_KEY = 'api_auth_token';

export function getStoredConfig(): Partial<KNVisualizationSkillConfig> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const knowledgeNetworks = parsed.knowledgeNetworks;
    const knowledgeNetworksArr =
      Array.isArray(knowledgeNetworks) && knowledgeNetworks.length > 0
        ? (knowledgeNetworks as Array<{ id: string; name?: string }>).filter((x) => typeof x?.id === 'string')
        : undefined;
    return {
      ontologyManagerBaseUrl: typeof parsed.ontologyManagerBaseUrl === 'string' ? parsed.ontologyManagerBaseUrl : undefined,
      ontologyQueryBaseUrl: typeof parsed.ontologyQueryBaseUrl === 'string' ? parsed.ontologyQueryBaseUrl : undefined,
      defaultKnId: typeof parsed.defaultKnId === 'string' ? parsed.defaultKnId : undefined,
      knowledgeNetworks: knowledgeNetworksArr as KnowledgeNetworkListItem[] | undefined,
    };
  } catch {
    return null;
  }
}

export function saveStoredConfig(partial: {
  ontologyManagerBaseUrl?: string;
  ontologyQueryBaseUrl?: string;
  defaultKnId?: string;
  knowledgeNetworks?: KnowledgeNetworkListItem[];
}): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(partial));
  } catch {
    // ignore
  }
}

/** 优先读会话级 Token（sessionStorage），再读持久化 Token（localStorage） */
export function getStoredToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * 保存 Token。sessionOnly=true 时仅写入 sessionStorage（关闭页即失效），否则写入 localStorage。
 */
export function saveStoredToken(token: string, options?: { sessionOnly?: boolean }): void {
  if (typeof window === 'undefined') return;
  try {
    if (options?.sessionOnly) {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
    } else {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

/** 清除本地保存的本体配置与 Token（含 sessionStorage），刷新后将重新进入首次配置表单 */
export function clearStoredConfig(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

function getUrlParams(): Record<string, string> {
  if (typeof window === 'undefined' || !window.location.search) return {};
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  params.forEach((v, k) => { out[k] = v; });
  return out;
}

const defaultBase = '/api/ontology-manager/v1';
const defaultQuery = '/api/ontology-query/v1';

/**
 * 按优先级合并：默认 → 本地存储 → 宿主注入 → URL 参数
 */
export function buildInitialConfig(hostConfig?: KNVisualizationSkillConfig | null): KNVisualizationSkillConfig {
  const stored = getStoredConfig();
  const url = getUrlParams();

  const ontologyManagerBaseUrl =
    url.ontologyManagerBaseUrl ??
    url.ontology_manager_base_url ??
    hostConfig?.ontologyManagerBaseUrl ??
    stored?.ontologyManagerBaseUrl ??
    defaultBase;

  const ontologyQueryBaseUrl =
    url.ontologyQueryBaseUrl ??
    url.ontology_query_base_url ??
    hostConfig?.ontologyQueryBaseUrl ??
    stored?.ontologyQueryBaseUrl ??
    defaultQuery;

  const defaultKnId =
    url.defaultKnId ?? url.default_kn_id ?? hostConfig?.defaultKnId ?? stored?.defaultKnId ?? '';

  // 当配置的 API 与当前页面不同源时，改为同源路径，由宿主（如 OpenClaw）代理到 DIP，避免 CORS
  let finalManager = ontologyManagerBaseUrl;
  let finalQuery = ontologyQueryBaseUrl;
  if (typeof window !== 'undefined' && ontologyManagerBaseUrl) {
    try {
      const u = new URL(ontologyManagerBaseUrl);
      if (u.origin !== window.location.origin) {
        finalManager = window.location.origin + u.pathname + u.search;
      }
    } catch {
      // ignore
    }
  }
  if (typeof window !== 'undefined' && ontologyQueryBaseUrl) {
    try {
      const u = new URL(ontologyQueryBaseUrl);
      if (u.origin !== window.location.origin) {
        finalQuery = window.location.origin + u.pathname + u.search;
      }
    } catch {
      // ignore
    }
  }

  const tokenFromUrl = url.token ?? url.api_auth_token ?? '';

  const getToken = (): string => {
    if (tokenFromUrl) return tokenFromUrl;
    if (hostConfig?.getToken) {
      const t = hostConfig.getToken();
      return typeof t === 'string' ? t : '';
    }
    return getStoredToken();
  };

  const knowledgeNetworks = hostConfig?.knowledgeNetworks ?? stored?.knowledgeNetworks;

  return {
    ontologyManagerBaseUrl: finalManager,
    ontologyQueryBaseUrl: finalQuery,
    getToken: hostConfig?.getToken ?? (() => Promise.resolve(getToken())),
    knowledgeNetworks,
    defaultKnId: defaultKnId || hostConfig?.defaultKnId,
  };
}

/** 是否需要展示首次配置表单：无宿主注入且无本地已存配置时展示 */
export function needFirstRunConfig(
  config: KNVisualizationSkillConfig,
  hasHostConfig: boolean,
  hasStoredConfig: boolean
): boolean {
  if (hasHostConfig) return false;
  if (hasStoredConfig) return false;
  const url = getUrlParams();
  if (url.ontologyManagerBaseUrl || url.ontology_manager_base_url) return false;
  return true;
}
