/**
 * Skill 用 Ontology 客户端
 *
 * 不依赖 apiConfig / globalSettingsService，所有 baseUrl 与鉴权由宿主注入。
 * 供业务知识网络可视化 Skill（含 OpenClaw）使用。
 */

import type {
  ObjectType,
  EdgeType,
  QueryObjectInstancesOptions,
  ObjectInstancesResponse,
} from '../api/ontologyApi';

export interface SkillOntologyConfig {
  ontologyManagerBaseUrl: string;
  ontologyQueryBaseUrl: string;
  getToken: () => string | Promise<string>;
  /** 业务域，请求 bkn-backend/ontology-manager 时需带 X-Business-Domain 头，缺省为 bd_public */
  businessDomain?: string;
}

export interface KnowledgeNetworkListItem {
  id: string;
  name?: string;
  [key: string]: unknown;
}

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, '');

const isDev = typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
function debugLog(label: string, detail?: string) {
  if (isDev && typeof console !== 'undefined' && console.log) {
    console.log(`[KN列表] ${label}`, detail ?? '');
  }
}

async function getAuthHeaders(getToken: () => string | Promise<string>): Promise<Record<string, string>> {
  const token = await Promise.resolve(getToken());
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }
  return headers;
}

async function fetchJson<T>(
  url: string,
  getToken: () => string | Promise<string>,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders(getToken);
  const res = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const text = await res.text();
    if (isDev) debugLog(`GET ${res.status} 响应体`, text?.slice(0, 400) ?? '');
    let msg = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const body = JSON.parse(text);
      msg = body.message ?? body.error ?? body.description ?? msg;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    const err = new Error(msg) as Error & { statusCode?: number };
    err.statusCode = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

async function fetchPostAsGet<T>(
  url: string,
  body: unknown,
  getToken: () => string | Promise<string>,
  options: RequestInit = {}
): Promise<T> {
  const headers = await getAuthHeaders(getToken);
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
    headers: {
      ...headers,
      'X-HTTP-Method-Override': 'GET',
      ...(options.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    if (isDev) debugLog(`POST ${res.status} 响应体`, text?.slice(0, 400) ?? '');
    let msg = res.status === 501
      ? '代理/网关不支持此方法（POST），请确认反向代理已正确配置到 DIP，或仅使用 GET'
      : `HTTP ${res.status}: ${res.statusText}`;
    try {
      const bodyErr = JSON.parse(text);
      if (res.status !== 501) msg = bodyErr.message ?? bodyErr.error ?? bodyErr.description ?? msg;
    } catch {
      if (text && res.status !== 501) msg = text.slice(0, 200);
    }
    const err = new Error(msg) as Error & { statusCode?: number };
    err.statusCode = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

function extractEntries<T>(data: unknown): T[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.entries)) return d.entries as T[];
  const dataVal = d.data;
  if (dataVal != null && typeof dataVal === 'object') {
    const inner = dataVal as Record<string, unknown>;
    if (Array.isArray(inner.entries)) return inner.entries as T[];
    if (Array.isArray(dataVal)) return dataVal as T[];
  }
  return [];
}

const DEFAULT_BUSINESS_DOMAIN = 'bd_public';

/** 从 ontology-manager 的 base 推导 bkn-backend 的 base（同主机，路径为 /api/bkn-backend/v1） */
function toBknBackendBase(ontologyManagerBaseUrl: string): string {
  const base = normalizeBaseUrl(ontologyManagerBaseUrl);
  if (base.includes('/api/ontology-manager/')) {
    return base.replace(/\/api\/ontology-manager\/v1\/?$/, '') + '/api/bkn-backend/v1';
  }
  const origin = base.includes('://') ? base.replace(/\/.*$/, '') : (typeof window !== 'undefined' ? window.location.origin : '');
  return `${origin}/api/bkn-backend/v1`;
}

/**
 * 创建 Skill 用 Ontology 客户端（闭包持有 config）
 */
export function createSkillOntologyClient(config: SkillOntologyConfig) {
  const managerBase = normalizeBaseUrl(config.ontologyManagerBaseUrl);
  const queryBase = normalizeBaseUrl(config.ontologyQueryBaseUrl);
  const { getToken } = config;
  const bknBackendBase = toBknBackendBase(config.ontologyManagerBaseUrl);
  const domainHeader = { 'X-Business-Domain': config.businessDomain ?? DEFAULT_BUSINESS_DOMAIN };

  return {
    /**
     * 拉取知识网络列表：先试 bkn-backend（ADP 规范），失败则回退到 ontology-manager
     */
    async listKnowledgeNetworks(): Promise<KnowledgeNetworkListItem[]> {
      const bknUrl = `${normalizeBaseUrl(bknBackendBase)}/knowledge-networks?limit=100`;
      const managerUrl = `${managerBase}/knowledge-networks`;
      const attempts: { label: string; fn: () => Promise<unknown> }[] = [
        { label: 'GET /api/bkn-backend/v1/knowledge-networks', fn: () => fetchJson<unknown>(bknUrl, getToken, { headers: domainHeader }) },
        { label: 'GET /api/ontology-manager/v1/knowledge-networks', fn: () => fetchJson<unknown>(managerUrl, getToken, { headers: domainHeader }) },
        { label: 'POST (X-HTTP-Method-Override:GET) /api/ontology-manager/v1/knowledge-networks', fn: () => fetchPostAsGet<unknown>(managerUrl, {}, getToken, { headers: domainHeader }) },
      ];
      let lastError: Error | null = null;
      for (let i = 0; i < attempts.length; i++) {
        const { label, fn } = attempts[i];
        debugLog(`尝试 ${i + 1}/${attempts.length}: ${label}`);
        try {
          const data = await fn();
          const entries = extractEntries<KnowledgeNetworkListItem>(data);
          if (Array.isArray(entries) && entries.length > 0) {
            debugLog(`成功: 共 ${entries.length} 条`, entries.map((e) => e.id).join(', '));
            return entries;
          }
          debugLog(`响应无 entries 或为空`);
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const statusCode = (lastError as Error & { statusCode?: number }).statusCode;
          const msg = lastError.message;
          debugLog(`失败: ${msg}`);
          if (statusCode === 404 || statusCode === 501) {
            throw lastError;
          }
        }
      }
      debugLog('三次均未拿到列表，将使用降级（仅 defaultKnId 或手动输入）');
      return [];
    },

    /**
     * 获取指定知识网络下的对象类型列表
     */
    async getObjectTypes(knId: string, options?: { limit?: number }): Promise<ObjectType[]> {
      const limit = options?.limit ?? -1;
      const url = `${managerBase}/knowledge-networks/${encodeURIComponent(knId)}/object-types?limit=${limit}`;
      const data = await fetchJson<unknown>(url, getToken, { headers: domainHeader });
      const entries = extractEntries<ObjectType>(data);
      return Array.isArray(entries) ? entries : [];
    },

    /**
     * 获取指定知识网络下的关系类型列表
     */
    async getRelationTypes(knId: string, options?: { limit?: number }): Promise<EdgeType[]> {
      const limit = options?.limit ?? -1;
      const url = `${managerBase}/knowledge-networks/${encodeURIComponent(knId)}/relation-types?limit=${limit}`;
      const data = await fetchJson<unknown>(url, getToken, { headers: domainHeader });
      const entries = extractEntries<EdgeType>(data);
      return Array.isArray(entries) ? entries : [];
    },

    /**
     * 查询对象实例（ontology-query）
     */
    async queryObjectInstances(
      knId: string,
      objectTypeId: string,
      options?: QueryObjectInstancesOptions
    ): Promise<ObjectInstancesResponse> {
      const queryParams: string[] = [];
      if (options?.include_logic_params !== undefined) {
        queryParams.push(`include_logic_params=${options.include_logic_params}`);
      }
      if (options?.include_type_info !== undefined) {
        queryParams.push(`include_type_info=${options.include_type_info}`);
      }
      const qs = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
      const url = `${queryBase}/knowledge-networks/${encodeURIComponent(knId)}/object-types/${encodeURIComponent(objectTypeId)}${qs}`;

      const body: Record<string, unknown> = {};
      if (options?.condition) body.condition = options.condition;
      if (options?.limit !== undefined) body.limit = options.limit;
      if (options?.need_total !== undefined) body.need_total = options.need_total;
      if (options?.search_after) body.search_after = options.search_after;
      if (options?.logic_params?.length) body.logic_params = options.logic_params;

      const raw = (await fetchPostAsGet<unknown>(url, body, getToken, { headers: domainHeader })) as Record<string, unknown>;
      const rawData = (raw?.data != null ? raw.data : raw) as Record<string, unknown>;

      let entries: unknown[] = [];
      if (Array.isArray(rawData.entries)) {
        entries = rawData.entries;
      } else if (Array.isArray(rawData.datas)) {
        entries = rawData.datas;
      } else if (Array.isArray(raw?.entries)) {
        entries = raw.entries;
      } else if (Array.isArray(raw?.datas)) {
        entries = raw.datas;
      }
      const total_count =
        (typeof rawData.total_count === 'number' ? rawData.total_count : rawData.total_count != null ? Number(rawData.total_count) : null) ??
        (typeof rawData.total === 'number' ? rawData.total : rawData.total != null ? Number(rawData.total) : null) ??
        entries.length;
      return {
        entries,
        total_count: Number(total_count) || 0,
        object_type: (rawData.object_type ?? raw?.object_type) as ObjectInstancesResponse['object_type'],
        search_after: (rawData.search_after ?? raw?.search_after) as ObjectInstancesResponse['search_after'],
      };
    },
  };
}

export type SkillOntologyClient = ReturnType<typeof createSkillOntologyClient>;
