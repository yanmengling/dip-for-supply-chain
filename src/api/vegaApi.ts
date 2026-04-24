/**
 * Vega Backend API Client
 *
 * basePath: /api/vega-backend/v1（参见 common.yaml basePath 声明）
 * 提供 catalog 和 resource 的查找与创建，保障运行时所需资源存在性。
 */

import { httpClient, ApiError } from './httpClient';

// ============================================================================
// 配置
// ============================================================================

const VEGA_BASE = '/api/vega-backend/v1';

/**
 * 监控任务 catalog 的连接器类型。
 *
 * connector_type 必须是 vega-backend 中已注册的 connector，
 * 可选值取决于部署环境（如 opensearch、mysql 等）。
 * 使用前请确认目标环境已注册该 connector type。
 */
const MONITORING_CONNECTOR_TYPE = 'opensearch';

// ============================================================================
// 类型定义（对应 resource.yaml / catalog.yaml definitions）
// ============================================================================

export interface Catalog {
  id: string;
  name: string;
  type: 'physical' | 'logical';
  connector_type: string;
  description?: string;
  tags?: string[];
}

/** resource.yaml definitions.interfaces.ResourceListItem（列表接口返回，不含 sourceMetadata/schemaDefinition） */
export interface ResourceListItem {
  id: string;
  catalog_id: string;
  name: string;
  category: 'table' | 'file' | 'fileset' | 'api' | 'metric' | 'topic' | 'index' | 'logicview' | 'dataset';
  status: 'active' | 'disabled' | 'deprecated' | 'stale';
  description?: string;
}

/** resource.yaml definitions.interfaces.Resource（详情接口返回，含完整字段） */
export interface Resource extends ResourceListItem {
  source_identifier?: string;
  schema_definition?: object[];
}

interface CatalogListResponse {
  entries: Catalog[];
  total_count: number;
}

interface ResourceListResponse {
  entries: ResourceListItem[];
  total_count: number;
}

// ============================================================================
// 内部工具函数
// ============================================================================

/**
 * 按名称在所有 catalog 中查找。
 *
 * GET /catalogs 不支持 name 过滤，需分页遍历后客户端匹配。
 */
async function findCatalogByName(name: string): Promise<Catalog | null> {
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data } = await httpClient.get<CatalogListResponse>(
      `${VEGA_BASE}/catalogs?offset=${offset}&limit=${limit}`
    );
    const match = data.entries.find((c) => c.name === name);
    if (match) return match;
    if (data.entries.length < limit) return null;
    offset += limit;
  }
}

/**
 * 创建 catalog 并返回完整对象。
 *
 * POST /catalogs → 201 { id }
 * GET  /catalogs/{ids} → 200 { entries: Catalog[] }
 */
async function createCatalog(name: string): Promise<Catalog> {
  const { data: created } = await httpClient.post<{ id: string }>(
    `${VEGA_BASE}/catalogs`,
    {
      name,
      connector_type: MONITORING_CONNECTOR_TYPE,
      description: '监控任务数据目录',
    }
  );

  const { data: detail } = await httpClient.get<{ entries: Catalog[] }>(
    `${VEGA_BASE}/catalogs/${created.id}`
  );
  return detail.entries[0];
}

/**
 * 在指定 catalog 下按名称查找 dataset 类型 resource。
 *
 * GET /resources?catalog_id={id}&category=dataset 支持双重过滤，
 * 比 GET /catalogs/{id}/resources 更直接（后者不支持 category 参数）。
 */
async function findResourceByName(catalogId: string, name: string): Promise<ResourceListItem | null> {
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data } = await httpClient.get<ResourceListResponse>(
      `${VEGA_BASE}/resources?catalog_id=${catalogId}&category=dataset&offset=${offset}&limit=${limit}`
    );
    const match = data.entries.find((r) => r.name === name);
    if (match) return match;
    if (data.entries.length < limit) return null;
    offset += limit;
  }
}

/**
 * 创建 resource 并返回完整对象。
 *
 * POST /resources → 201 { id }
 * GET  /resources/{ids} → 200 { entries: Resource[] }
 */
async function createResource(catalogId: string, name: string): Promise<Resource> {
  const { data: created } = await httpClient.post<{ id: string }>(
    `${VEGA_BASE}/resources`,
    {
      catalog_id: catalogId,
      name,
      category: 'dataset',
      description: '监控任务数据集',
    }
  );

  const { data: detail } = await httpClient.get<{ entries: Resource[] }>(
    `${VEGA_BASE}/resources/${created.id}`
  );
  return detail.entries[0];
}

// ============================================================================
// 主函数
// ============================================================================

export interface MonitoringTaskResources {
  catalog: Catalog;
  resource: Resource | ResourceListItem;
}

const CATALOG_NAME = 'monitoring_task_catalog';
const RESOURCE_NAME = 'monitoring_task_resource';

/**
 * 确保监控任务所需的 catalog 和 resource 存在，幂等操作。
 *
 * 执行顺序：
 * 1. 按名称查找 catalog（GET /catalogs 分页遍历）→ 不存在则创建（POST /catalogs）
 * 2. 按名称查找 dataset resource（GET /resources?catalog_id&category=dataset）→ 不存在则创建（POST /resources）
 */
export async function ensureMonitoringTaskResources(): Promise<MonitoringTaskResources> {
  // Step 1: catalog
  let catalog = await findCatalogByName(CATALOG_NAME);
  if (!catalog) {
    console.log(`[VegaApi] Catalog "${CATALOG_NAME}" 不存在，创建中...`);
    catalog = await createCatalog(CATALOG_NAME);
    console.log(`[VegaApi] Catalog 创建成功，id=${catalog.id}`);
  } else {
    console.log(`[VegaApi] Catalog 已存在，id=${catalog.id}`);
  }

  // Step 2: resource（挂在上述 catalog 下）
  let resource = await findResourceByName(catalog.id, RESOURCE_NAME);
  if (!resource) {
    console.log(`[VegaApi] Resource "${RESOURCE_NAME}" 不存在，创建中...`);
    const created = await createResource(catalog.id, RESOURCE_NAME);
    console.log(`[VegaApi] Resource 创建成功，id=${created.id}`);
    return { catalog, resource: created };
  }

  console.log(`[VegaApi] Resource 已存在，id=${resource.id}`);
  return { catalog, resource };
}
