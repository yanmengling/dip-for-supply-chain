/**
 * Ontology API Client
 *
 * API for knowledge networks and object types from DIP platform
 */

import { httpClient } from './httpClient';
import {
  getKnowledgeNetworkId,
  setKnowledgeNetworkId as setConfigKnowledgeNetworkId,
  getKnowledgeNetworkConfig,
  getServiceConfig
} from '../config/apiConfig';

// ============================================================================
// Constants
// ============================================================================

/**
 * HD供应链业务知识网络标准常量
 */
export const HD_SUPPLY_CHAIN_KN_ID = 'd56v1l69olk4bpa66uv0';
export const HD_SUPPLY_CHAIN_KN_NAME = 'HD供应链业务知识网络';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Logic Property Data Source
 */
export interface LogicPropertyDataSource {
  type: 'metric-model' | 'data-view' | 'operator' | 'metric';
  id: string;
  name?: string;
}

/**
 * Logic Property Parameter
 */
export interface LogicPropertyParameter {
  name: string;
  value_from: 'property' | 'input';
  value: string;
  operation?: string; // Added operation for metric parameters
}

/**
 * Logic Property Configuration
 */
export interface LogicProperty {
  name: string;
  display_name?: string;
  type: 'metric' | 'operator';
  comment?: string;
  index?: boolean;
  data_source: LogicPropertyDataSource;
  parameters: LogicPropertyParameter[];
}

/**
 * Object Type - represents an entity type in the knowledge network
 */
export interface ObjectType {
  id: string;                    // Object type ID
  name: string;                  // Display name (e.g., "产品", "供应商")
  color: string;                 // Hex color (e.g., "#FF5733")
  icon?: string;                 // Icon name or URL (e.g., "icon-dip-copy")
  comment?: string;              // Description
  data_properties?: ObjectProperty[]; // List of properties
  logic_properties?: LogicProperty[]; // List of logic properties (when include_detail=true)
  primary_keys?: string[];       // Primary keys
  display_key?: string;          // Display key
  tags?: string[];               // Tags
  kn_id?: string;                // Knowledge network ID
  branch?: string;               // Branch name
  module_type?: string;          // Module type
  create_time?: number;          // Creation timestamp (unix milliseconds)
  update_time?: number;          // Update timestamp (unix milliseconds)
  creator?: {                    // Creator info
    id: string;
    type: string;
    name: string;
  };
  updater?: {                    // Updater info
    id: string;
    type: string;
    name: string;
  };
}

/**
 * Object Property - attribute of an object type
 */
export interface ObjectProperty {
  id: string;                   // Property ID
  name: string;                 // Property name
  alias?: string;               // Display alias
  data_type: string;            // Data type (e.g., "string", "number", "date")
  required?: boolean;           // Is required
  unique?: boolean;             // Is unique
  indexed?: boolean;            // Is indexed
  default_value?: any;          // Default value
}

/**
 * Relation Type - represents a relationship type between object types
 */
export interface RelationType {
  id: string;                   // Relation ID
  name: string;                 // Relationship name (e.g., "供应", "生产")
  source_object_type_id: string; // Source object type ID
  target_object_type_id: string; // Target object type ID
  type: 'direct' | 'indirect';   // Relation type
  mapping_rules?: Array<{        // Mapping rules
    source_property: { name: string };
    target_property: { name: string };
  }>;
  tags?: string[];               // Tags
  comment?: string;              // Comment/description
  icon?: string;                 // Icon
  color?: string;                // Edge color
  detail?: string;               // Detail info
  kn_id?: string;                // Knowledge network ID
  branch?: string;               // Branch name
  source_object_type?: {         // Source object type info
    id: string;
    name: string;
    branch?: string;
    icon?: string;
    color?: string;
  };
  target_object_type?: {         // Target object type info
    id: string;
    name: string;
    branch?: string;
    icon?: string;
    color?: string;
  };
  creator?: {                    // Creator info
    id: string;
    type: string;
    name: string;
  };
  create_time?: number;          // Creation timestamp (unix milliseconds)
  updater?: {                    // Updater info
    id: string;
    type: string;
    name: string;
  };
  update_time?: number;          // Update timestamp (unix milliseconds)
  module_type?: string;          // Module type (e.g., "relation_type")
}

/**
 * Legacy EdgeType for backward compatibility
 */
export interface EdgeType extends RelationType {
  source_type?: string;          // Alias for source_object_type_id
  target_type?: string;          // Alias for target_object_type_id
  direction?: 'directed' | 'undirected'; // Direction
  properties?: EdgeProperty[];   // Edge properties
  created_at?: string;          // Creation timestamp
}

/**
 * Edge Property - attribute of an edge type
 */
export interface EdgeProperty {
  id: string;
  name: string;
  data_type: string;
}

/**
 * Knowledge Network Info - metadata from KN endpoint
 */
export interface KnowledgeNetworkInfo {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  comment?: string;
  icon?: string;
  color?: string;
  branch?: string;
  create_time?: number;
  update_time?: number;
  detail?: string;
}

/**
 * Knowledge Network - represents the complete network structure
 */
export interface KnowledgeNetwork {
  id: string;                   // Network ID
  name: string;                 // Network name
  description?: string;         // Network description
  object_types: ObjectType[];   // All object types
  edge_types: EdgeType[];       // All edge types
  created_at?: string;
  updated_at?: string;
}

/**
 * API Response for paginated object types
 */
export interface ObjectTypesResponse {
  entries: ObjectType[];  // API returns 'entries' not 'object_types'
  total?: number;
  offset?: number;
  limit?: number;
}

/**
 * API Response for relation types
 */
export interface RelationTypesResponse {
  entries: RelationType[];
  total_count: number;
}

/**
 * API Response for edge types (legacy)
 */
export interface EdgeTypesResponse {
  edges?: EdgeType[];
  entries?: RelationType[];
  total?: number;
  total_count?: number;
}

/**
 * Query options for object types
 */
export interface ObjectTypesQueryOptions {
  offset?: number;
  limit?: number;
  direction?: 'asc' | 'desc';
  sort?: 'create_time' | 'update_time' | 'name';
  name_pattern?: string;
}

/**
 * Filter condition for querying object instances
 */
export interface ObjectInstanceFilter {
  field: string;
  operation: '=' | '!=' | 'in' | 'not_in' | 'like' | 'not_like' | '>' | '>=' | '<' | '<=';
  value: any;
}

/**
 * Logic property parameter for include_logic_params
 */
export interface LogicPropertyParam {
  name: string;
  params: Record<string, any>;
}

/**
 * Sort option for querying object instances
 */
export interface ObjectInstanceSort {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Query condition for ADP Ontology Query API
 */
export interface QueryCondition {
  operation: 'and' | 'or' | '==' | '!=' | 'in' | 'not_in' | 'like' | 'not_like' | '>' | '>=' | '<' | '<=' | 'match' | 'match_phrase' | 'knn';
  sub_conditions?: QueryCondition[];
  field?: string;
  value?: any;
  value_from?: 'const' | 'property' | 'input';
}

/**
 * Logic property parameter for ADP Ontology Query API
 * Used in include_logic_params query parameter
 */
export interface LogicPropertyParam {
  name: string;
  params: Record<string, any>;
}

/**
 * Query options for object instances (ADP Ontology Query API)
 * Based on ADP Ontology Query API specification
 */
export interface QueryObjectInstancesOptions {
  /** Query condition (filter) */
  condition?: QueryCondition;
  /** Maximum number of results to return */
  limit?: number;
  /** Whether to include total count */
  need_total?: boolean;
  /** Pagination token from previous query */
  search_after?: any[];
  /** Include logic property calculation parameters (query parameter, boolean) */
  include_logic_params?: boolean;
  /** Include object type information (query parameter, boolean) */
  include_type_info?: boolean;
  /** Logic property parameters (if include_logic_params=true, these are used) */
  logic_params?: LogicPropertyParam[];
}

/**
 * Object instance with logic property values
 */
export interface ObjectInstance {
  [key: string]: any; // Instance properties (dynamic based on object type)
  // Logic property values are included as additional fields
  // e.g., product_sales_history: ProductSalesHistory[]
}

/**
 * Response from ADP Ontology Query API
 */
export interface ObjectInstancesResponse {
  /** Object type information */
  object_type?: {
    id: string;
    name: string;
    [key: string]: any;
  };
  /** Object instances */
  entries: ObjectInstance[];
  /** Total count (if need_total=true) */
  total_count?: number;
  /** Pagination token for next page */
  search_after?: any[];
}

/**
 * Options for querying object property values (ADP Ontology Query API)
 */
export interface QueryObjectPropertyValuesOptions {
  /** Unique identities of the instances to query */
  unique_identities: Array<Record<string, any>>;
  /** List of property names to retrieve (can include logic properties) */
  properties: string[];
  /** Dynamic parameters for logic properties */
  dynamic_params?: Record<string, Record<string, any>>;
}

/**
 * Response for object property values query
 */
export interface ObjectPropertyValuesResponse {
  /** Results for each identity provided in the request */
  entries: Array<Record<string, any>>;
}

// ============================================================================
// API Client
// ============================================================================

class OntologyApiClient {
  /**
   * Get dynamic Base URL from configuration
   */
  private getBaseUrl(): string {
    const config = getServiceConfig('ontology');
    return config.baseUrl;
  }

  /**
   * 获取当前知识网络ID（动态从配置获取）
   */
  private getKnowledgeNetworkId(): string {
    return getKnowledgeNetworkId();
  }

  /**
   * 设置知识网络ID
   * @param id - 知识网络ID
   */
  setKnowledgeNetworkId(id: string): void {
    setConfigKnowledgeNetworkId(id);
  }

  /**
   * 获取当前知识网络配置
   */
  getCurrentConfig() {
    return getKnowledgeNetworkConfig();
  }

  /**
   * Get all object types from the knowledge network
   */
  async getObjectTypes(options?: ObjectTypesQueryOptions): Promise<ObjectTypesResponse> {
    const {
      offset = 0,
      limit = 50,
      direction = 'desc',
      sort = 'update_time',
      name_pattern = '',
    } = options || {};

    const baseUrl = this.getBaseUrl();
    const knId = this.getKnowledgeNetworkId();
    console.log(`[OntologyAPI] getObjectTypes using BaseURL: ${baseUrl}, KN_ID: ${knId}`);

    const url = `${baseUrl}/knowledge-networks/${knId}/object-types?offset=${offset}&limit=${limit}&direction=${direction}&sort=${sort}&name_pattern=${name_pattern}`;
    console.log(`[OntologyAPI] Requesting URL: ${url}`);

    const response = await httpClient.get<ObjectTypesResponse>(url);
    return response.data;
  }

  /**
   * Get all relation types (relationships) from the knowledge network
   */
  async getRelationTypes(options?: ObjectTypesQueryOptions): Promise<RelationTypesResponse> {
    const {
      offset = 0,
      limit = 50,
      direction = 'desc',
      sort = 'update_time',
    } = options || {};

    const baseUrl = this.getBaseUrl();
    const knId = this.getKnowledgeNetworkId();
    console.log(`[OntologyAPI] getRelationTypes using BaseURL: ${baseUrl}, KN_ID: ${knId}`);

    const url = `${baseUrl}/knowledge-networks/${knId}/relation-types?offset=${offset}&limit=${limit}&sort=${sort}&direction=${direction}`;
    console.log(`[OntologyAPI] Requesting URL: ${url}`);

    const response = await httpClient.get<RelationTypesResponse>(url);
    return response.data;
  }

  /**
   * Get all edge types (legacy method for backward compatibility)
   */
  async getEdgeTypes(): Promise<EdgeTypesResponse> {
    const relationTypes = await this.getRelationTypes({ limit: 100 });
    return {
      entries: relationTypes.entries,
      total_count: relationTypes.total_count,
    };
  }

  /**
   * Get complete knowledge network structure
   */
  async getKnowledgeNetwork(): Promise<KnowledgeNetwork> {
    const knId = this.getKnowledgeNetworkId();
    const baseUrl = this.getBaseUrl();

    // 1. Fetch Knowledge Network Metadata
    // URL: .../knowledge-networks/{id}?include_detail=false&include_statistics=true
    const knUrl = `${baseUrl}/knowledge-networks/${knId}?include_detail=false&include_statistics=true`;

    // 2. Fetch Object Types with limit=-1 (all)
    // 3. Fetch Relation Types with limit=-1 (all)
    const [knRes, objectTypesRes, relationTypesRes] = await Promise.all([
      httpClient.get<KnowledgeNetworkInfo>(knUrl),
      this.getObjectTypes({ limit: -1 }),
      this.getRelationTypes({ limit: -1 }),
    ]);

    const knInfo = knRes.data;

    // Convert RelationType to EdgeType for compatibility
    const edgeTypes: EdgeType[] = relationTypesRes.entries.map((rel) => ({
      ...rel,
      source_type: rel.source_object_type_id,
      target_type: rel.target_object_type_id,
      direction: 'directed' as const,
    }));

    return {
      id: HD_SUPPLY_CHAIN_KN_ID,
      name: HD_SUPPLY_CHAIN_KN_NAME,
      description: knInfo.comment || knInfo.detail,
      object_types: objectTypesRes.entries || [],
      edge_types: edgeTypes,
      created_at: knInfo.create_time ? new Date(knInfo.create_time).toISOString() : undefined,
      updated_at: knInfo.update_time ? new Date(knInfo.update_time).toISOString() : undefined,
    };
  }

  /**
   * Get a single object type by ID
   * @param includeDetail Whether to include detail information (logic_properties, etc.)
   */
  async getObjectType(objectTypeId: string, includeDetail: boolean = true): Promise<ObjectType> {
    const baseUrl = this.getBaseUrl();
    const knId = this.getKnowledgeNetworkId();
    const url = `${baseUrl}/knowledge-networks/${knId}/object-types/${objectTypeId}${includeDetail ? '?include_detail=true' : ''}`;

    console.log(`[OntologyAPI] getObjectType requesting: ${url}`);
    const response = await httpClient.get<any>(url);

    // Validate response
    if (!response || !response.data) {
      console.error(`[OntologyAPI] Invalid response from getObjectType:`, response);
      throw new Error(`Invalid response from getObjectType API: ${JSON.stringify(response)}`);
    }

    let objectType = response.data;

    // Handle case where API returns array format with entries
    if (objectType.entries && Array.isArray(objectType.entries)) {
      console.log(`[OntologyAPI] Response contains entries array with ${objectType.entries.length} items`);
      if (objectType.entries.length === 0) {
        throw new Error(`Object type '${objectTypeId}' not found: entries array is empty`);
      }
      // Extract first entry from array response
      objectType = objectType.entries[0];
      console.log(`[OntologyAPI] Extracted object type from entries array: ${objectType.id} (${objectType.name || 'unnamed'})`);
    }

    // Log response details for debugging
    console.log(`[OntologyAPI] getObjectType response:`, {
      id: objectType.id,
      name: objectType.name,
      hasLogicProperties: !!objectType.logic_properties,
      logicPropertiesCount: objectType.logic_properties?.length || 0,
    });

    if (!objectType.id) {
      console.error(`[OntologyAPI] Response missing id field:`, objectType);
      console.error(`[OntologyAPI] Response keys:`, Object.keys(objectType));
      console.error(`[OntologyAPI] Full response:`, JSON.stringify(response.data).substring(0, 1000));
      throw new Error(`Invalid object type response: missing id field. Response: ${JSON.stringify(objectType).substring(0, 500)}`);
    }

    return objectType as ObjectType;
  }

  /**
   * Query object instances using ADP Ontology Query API
   * @param objectTypeId Object type ID (e.g., 'product')
   * @param options Query options including condition, include_logic_params, etc.
   * @returns Object instances with optional logic property values
   * 
   * API Endpoint: POST /api/ontology-query/v1/knowledge-networks/{kn_id}/object-types/{ot_id}
   * 
   * Based on ADP Ontology Query API specification:
   * - Query parameter: include_logic_params (boolean) - whether to include logic property calculation parameters
   * - Request body: condition, limit, need_total, search_after
   * - Response: object_type, entries, total_count, search_after
   */
  async queryObjectInstances(
    objectTypeId: string,
    options?: QueryObjectInstancesOptions
  ): Promise<ObjectInstancesResponse> {
    const knId = this.getKnowledgeNetworkId();

    // Use /api/ontology-query/v1 for querying instances (ADP Ontology Query API)
    // POST /api/ontology-query/v1/knowledge-networks/{kn_id}/object-types/{ot_id}
    // Note: The endpoint should NOT include /instances suffix according to API documentation
    const baseUrl = '/api/ontology-query/v1';
    let url = `${baseUrl}/knowledge-networks/${knId}/object-types/${objectTypeId}`;

    console.log(`[OntologyAPI] ========== queryObjectInstances 开始 ==========`);
    console.log(`[OntologyAPI] 对象类型ID: ${objectTypeId}`);
    console.log(`[OntologyAPI] 知识网络ID: ${knId}`);
    console.log(`[OntologyAPI] 基础URL: ${baseUrl}`);
    console.log(`[OntologyAPI] 完整查询URL: ${url}`);

    // Build query parameters
    const queryParams: string[] = [];

    // include_logic_params is a query parameter (boolean)
    if (options?.include_logic_params !== undefined) {
      queryParams.push(`include_logic_params=${options.include_logic_params}`);
    }

    // include_type_info is a query parameter (boolean)
    if (options?.include_type_info !== undefined) {
      queryParams.push(`include_type_info=${options.include_type_info}`);
    }

    const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
    url = `${url}${queryString}`;
    console.log(`[OntologyAPI] 完整URL: ${url}`);

    // Build request body according to ADP Ontology Query API spec
    const requestBody: any = {};

    // Condition (filter)
    // Only include condition if explicitly provided
    // Backend API does not accept empty sub_conditions array
    if (options?.condition) {
      requestBody.condition = options.condition;
      console.log(`[OntologyAPI] 查询条件:`, JSON.stringify(options.condition, null, 2));
    } else {
      console.log(`[OntologyAPI] 无查询条件，将查询所有实例`);
    }

    // Limit
    if (options?.limit !== undefined) {
      requestBody.limit = options.limit;
      console.log(`[OntologyAPI] 限制数量: ${options.limit}`);
    } else {
      console.log(`[OntologyAPI] 未设置limit，将使用API默认限制`);
    }

    // Need total count
    if (options?.need_total !== undefined) {
      requestBody.need_total = options.need_total;
    }

    // Search after
    if (options?.search_after) {
      requestBody.search_after = options.search_after;
    }

    // Logic property parameters
    if (options?.logic_params && options.logic_params.length > 0) {
      requestBody.logic_params = options.logic_params;
    }

    console.log(`[OntologyAPI] 请求体 (POST body):`, JSON.stringify(requestBody, null, 2));
    console.log(`[OntologyAPI] 发送请求...`);

    // 使用 POST + X-HTTP-Method-Override: GET（ADP Ontology Query API 规范要求）
    let response: any;
    try {
      response = await httpClient.postAsGet<ObjectInstancesResponse>(url, requestBody);

      // Log full response for debugging
      console.log(`[OntologyAPI] ========== queryObjectInstances 响应 ==========`);
      console.log(`[OntologyAPI] HTTP状态码: ${response.status}`);
      console.log(`[OntologyAPI] 响应包含data: ${!!response.data}`);
      console.log(`[OntologyAPI] 响应data的keys:`, response.data ? Object.keys(response.data) : []);

      if (response.data) {
        const responseStr = JSON.stringify(response.data, null, 2);
        console.log(`[OntologyAPI] 响应data结构 (前2000字符):`, responseStr.substring(0, 2000));
        if (responseStr.length > 2000) {
          console.log(`[OntologyAPI] ... (还有${responseStr.length - 2000}字符未显示)`);
        }
      }

      // Validate response structure
      if (!response.data) {
        console.error(`[OntologyAPI] ❌ API返回空data`);
        console.error(`[OntologyAPI] 响应状态码: ${response.status || 'unknown'}`);
        console.error(`[OntologyAPI] 完整响应对象:`, JSON.stringify(response, null, 2).substring(0, 1000));
        throw new Error(`API返回空数据。状态码: ${response.status || 'unknown'}`);
      }

      // Check if response has error structure
      if ((response.data as any).error || (response.data as any).message) {
        const errorMsg = (response.data as any).error || (response.data as any).message || '未知错误';
        console.error(`[OntologyAPI] ❌ API返回错误结构:`);
        console.error(`[OntologyAPI] 错误消息: ${errorMsg}`);
        console.error(`[OntologyAPI] 完整错误响应:`, JSON.stringify(response.data, null, 2));
        throw new Error(`API返回错误: ${errorMsg}`);
      }
    } catch (error) {
      console.error(`[OntologyAPI] ========== queryObjectInstances 错误 ==========`);
      console.error(`[OntologyAPI] 错误类型:`, error instanceof Error ? error.constructor.name : typeof error);
      console.error(`[OntologyAPI] 错误消息:`, error instanceof Error ? error.message : String(error));
      console.error(`[OntologyAPI] 错误堆栈:`, error instanceof Error ? error.stack : '无堆栈信息');
      console.error(`[OntologyAPI] 请求URL: ${url}`);
      console.error(`[OntologyAPI] 请求体:`, JSON.stringify(requestBody, null, 2));
      throw error;
    }

    // Handle different response formats
    // Some APIs return "datas" instead of "entries"
    const rawData = response.data as any;
    let entries: any[] = [];

    if (rawData.entries && Array.isArray(rawData.entries)) {
      // Standard format with "entries"
      entries = rawData.entries;
      console.log(`[OntologyAPI] ✅ 使用"entries"字段，共${entries.length}条记录`);
    } else if (rawData.datas && Array.isArray(rawData.datas)) {
      // Alternative format with "datas" (used by some ADP APIs)
      console.log(`[OntologyAPI] ⚠️ 使用"datas"字段代替"entries"（某些ADP API使用此格式）`);
      entries = rawData.datas;
      console.log(`[OntologyAPI] ✅ 从"datas"字段提取，共${entries.length}条记录`);
    } else {
      console.error(`[OntologyAPI] ❌ 响应缺少entries/datas字段:`);
      console.error(`[OntologyAPI] 响应data的keys:`, Object.keys(rawData));
      console.error(`[OntologyAPI] 响应data结构:`, JSON.stringify(rawData, null, 2).substring(0, 2000));
      throw new Error(`API响应缺少entries或datas字段。响应结构: ${JSON.stringify(rawData, null, 2).substring(0, 500)}`);
    }

    // Log entries sample for debugging
    if (entries.length > 0) {
      console.log(`[OntologyAPI] 响应条目示例（前3条）:`, entries.slice(0, 3).map((entry: any) => {
        const keys = Object.keys(entry);
        return {
          keys: keys.slice(0, 10), // 只显示前10个key
          sample: Object.fromEntries(
            Object.entries(entry).slice(0, 5).map(([k, v]) => [k, typeof v === 'string' && v.length > 50 ? v.substring(0, 50) + '...' : v])
          ),
        };
      }));
    } else {
      console.warn(`[OntologyAPI] ⚠️ 响应条目数为0，可能没有匹配的数据`);
    }

    // Normalize response to standard ObjectInstancesResponse format
    const normalizedResponse: ObjectInstancesResponse = {
      entries: entries,
      total_count: rawData.total_count || rawData.total || entries.length,
      search_after: rawData.search_after,
      object_type: rawData.object_type,
    };

    console.log(`[OntologyAPI] Normalized response: ${normalizedResponse.entries.length} entries`);
    console.log(`[OntologyAPI] Total count: ${normalizedResponse.total_count || 'N/A'}`);
    console.log(`[OntologyAPI] ========== queryObjectInstances 完成 ==========`);
    console.log(`[OntologyAPI] 返回${normalizedResponse.entries.length}条记录`);

    return normalizedResponse;
  }

  /**
   * Query specific property values for object instances using ADP Ontology Query API
   * @param objectTypeId Object type ID (e.g., 'product')
   * @param options Query options including unique_identities, properties, and dynamic_params
   * 
   * API Endpoint: POST /api/ontology-query/v1/knowledge-networks/{kn_id}/object-types/{ot_id}/properties
   */
  async queryObjectPropertyValues(
    objectTypeId: string,
    options: QueryObjectPropertyValuesOptions
  ): Promise<ObjectPropertyValuesResponse> {
    const knId = this.getKnowledgeNetworkId();

    // Path: /api/ontology-query/v1/knowledge-networks/{kn_id}/object-types/{ot_id}/properties
    const urlPrefix = '/api/ontology-query/v1';
    const url = `${urlPrefix}/knowledge-networks/${knId}/object-types/${objectTypeId}/properties`;

    console.log(`[OntologyAPI] queryObjectPropertyValues - Requesting URL: ${url}`);
    console.log(`[OntologyAPI] queryObjectPropertyValues - Request Payload:`, JSON.stringify(options, null, 2));

    // Use standard post method
    const response = await httpClient.post<ObjectPropertyValuesResponse>(url, options);

    console.log(`[OntologyAPI] queryObjectPropertyValues - Response Data:`, JSON.stringify(response.data, null, 2));

    return response.data;
  }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const ontologyApi = new OntologyApiClient();
export default ontologyApi;
