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
import type {
  ObjectTypesQueryOptions,
  ObjectTypesResponse,
  RelationTypesResponse,
  EdgeTypesResponse,
  KnowledgeNetwork,
  KnowledgeNetworkInfo,
  EdgeType,
  ObjectType,
  QueryObjectInstancesOptions,
  ObjectInstancesResponse,
  QueryObjectPropertyValuesOptions,
  ObjectPropertyValuesResponse,
} from './ontologyApiTypes';

export type {
  LogicPropertyDataSource,
  LogicPropertyParameter,
  LogicProperty,
  ObjectType,
  ObjectProperty,
  RelationType,
  EdgeType,
  EdgeProperty,
  KnowledgeNetworkInfo,
  KnowledgeNetwork,
  ObjectTypesResponse,
  RelationTypesResponse,
  EdgeTypesResponse,
  ObjectTypesQueryOptions,
  ObjectInstanceFilter,
  LogicPropertyParam,
  ObjectInstanceSort,
  QueryCondition,
  QueryObjectInstancesOptions,
  ObjectInstance,
  ObjectInstancesResponse,
  QueryObjectPropertyValuesOptions,
  ObjectPropertyValuesResponse,
} from './ontologyApiTypes';

// ============================================================================
// Constants
// ============================================================================

/**
 * DIP供应链业务知识网络标准常量
 */
export const HD_SUPPLY_CHAIN_KN_ID = 'supplychain_hd0202';
export const HD_SUPPLY_CHAIN_KN_NAME = 'DIP供应链业务知识网络';

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
  public getKnowledgeNetworkId(): string {
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
    const url = `${baseUrl}/knowledge-networks/${knId}/object-types?offset=${offset}&limit=${limit}&direction=${direction}&sort=${sort}&name_pattern=${name_pattern}`;

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
    const url = `${baseUrl}/knowledge-networks/${knId}/relation-types?offset=${offset}&limit=${limit}&sort=${sort}&direction=${direction}`;

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

    const response = await httpClient.get<any>(url);

    if (!response || !response.data) {
      throw new Error(`Invalid response from getObjectType API`);
    }

    let objectType = response.data;

    if (objectType.entries && Array.isArray(objectType.entries)) {
      if (objectType.entries.length === 0) {
        throw new Error(`Object type '${objectTypeId}' not found: entries array is empty`);
      }
      objectType = objectType.entries[0];
    }

    if (!objectType.id) {
      throw new Error(`Invalid object type response: missing id field`);
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

    // Build request body according to ADP Ontology Query API spec
    const requestBody: any = {};

    // Condition (filter)
    // Only include condition if explicitly provided
    // Backend API does not accept empty sub_conditions array
    if (options?.condition) {
      requestBody.condition = options.condition;
    }

    // Limit
    if (options?.limit !== undefined) {
      requestBody.limit = options.limit;
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

    // 使用 POST + X-HTTP-Method-Override: GET（ADP Ontology Query API 规范要求）
    let response: any;
    try {
      response = await httpClient.postAsGet<ObjectInstancesResponse>(
        url,
        requestBody,
        options?.timeout ? { timeout: options.timeout } : undefined,
      );

      if (!response.data) {
        throw new Error(`API返回空数据。状态码: ${response.status || 'unknown'}`);
      }

      if ((response.data as any).error || (response.data as any).message) {
        const errorMsg = (response.data as any).error || (response.data as any).message || '未知错误';
        throw new Error(`API返回错误: ${errorMsg}`);
      }
    } catch (error) {
      console.error(`[OntologyAPI] 请求失败 ${objectTypeId}:`, error instanceof Error ? error.message : String(error));
      throw error;
    }

    // Handle different response formats
    // Some APIs return "datas" instead of "entries"
    const rawData = response.data as any;
    let entries: any[] = [];

    if (rawData.entries && Array.isArray(rawData.entries)) {
      entries = rawData.entries;
    } else if (rawData.datas && Array.isArray(rawData.datas)) {
      entries = rawData.datas;
    } else {
      console.error(`[OntologyAPI] 响应缺少entries/datas字段，keys:`, Object.keys(rawData));
      throw new Error(`API响应缺少entries或datas字段`);
    }

    // Normalize response to standard ObjectInstancesResponse format
    const normalizedResponse: ObjectInstancesResponse = {
      entries: entries,
      total_count: rawData.total_count || rawData.total || entries.length,
      search_after: rawData.search_after,
      object_type: rawData.object_type,
    };

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

    // 标准 POST body + X-HTTP-Method-Override: GET（ADP Ontology Query API 规范）
    const response = await httpClient.postAsGet<ObjectPropertyValuesResponse>(url, options);
    return response.data;
  }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const ontologyApi = new OntologyApiClient();
export default ontologyApi;
