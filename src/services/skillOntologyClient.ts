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
}

export interface KnowledgeNetworkListItem {
  id: string;
  name?: string;
  [key: string]: unknown;
}

const normalizeBaseUrl = (url: string): string => url.replace(/\/+$/, '');

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
    let msg = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const body = JSON.parse(text);
      msg = body.message ?? body.error ?? body.description ?? msg;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
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
    let msg = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const bodyErr = JSON.parse(text);
      msg = bodyErr.message ?? bodyErr.error ?? bodyErr.description ?? msg;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
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

/**
 * 创建 Skill 用 Ontology 客户端（闭包持有 config）
 */
export function createSkillOntologyClient(config: SkillOntologyConfig) {
  const managerBase = normalizeBaseUrl(config.ontologyManagerBaseUrl);
  const queryBase = normalizeBaseUrl(config.ontologyQueryBaseUrl);
  const { getToken } = config;

  return {
    /**
     * 拉取知识网络列表（若后端支持）
     * GET {ontologyManagerBaseUrl}/knowledge-networks
     */
    async listKnowledgeNetworks(): Promise<KnowledgeNetworkListItem[]> {
      try {
        const url = `${managerBase}/knowledge-networks`;
        const data = await fetchJson<unknown>(url, getToken);
        const entries = extractEntries<KnowledgeNetworkListItem>(data);
        return Array.isArray(entries) ? entries : [];
      } catch {
        return [];
      }
    },

    /**
     * 获取指定知识网络下的对象类型列表
     */
    async getObjectTypes(knId: string, options?: { limit?: number }): Promise<ObjectType[]> {
      const limit = options?.limit ?? -1;
      const url = `${managerBase}/knowledge-networks/${encodeURIComponent(knId)}/object-types?limit=${limit}`;
      const data = await fetchJson<unknown>(url, getToken);
      const entries = extractEntries<ObjectType>(data);
      return Array.isArray(entries) ? entries : [];
    },

    /**
     * 获取指定知识网络下的关系类型列表
     */
    async getRelationTypes(knId: string, options?: { limit?: number }): Promise<EdgeType[]> {
      const limit = options?.limit ?? -1;
      const url = `${managerBase}/knowledge-networks/${encodeURIComponent(knId)}/relation-types?limit=${limit}`;
      const data = await fetchJson<unknown>(url, getToken);
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

      const raw = (await fetchPostAsGet<unknown>(url, body, getToken)) as Record<string, unknown>;

      const entries = Array.isArray(raw?.entries) ? raw.entries : [];
      const resp = raw as unknown as ObjectInstancesResponse;
      const total_count =
        typeof resp.total_count === 'number'
          ? resp.total_count
          : (raw?.total_count != null ? Number(raw.total_count) : entries.length);
      return {
        entries,
        total_count: Number(total_count) || 0,
        object_type: resp.object_type,
        search_after: resp.search_after,
      };
    },
  };
}

export type SkillOntologyClient = ReturnType<typeof createSkillOntologyClient>;
