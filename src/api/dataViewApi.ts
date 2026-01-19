/**
 * Data View API Client
 *
 * API for querying data views from mdl-uniquery service
 */

import { httpClient } from './httpClient';
import { getServiceConfig, getCurrentEnvironment } from '../config/apiConfig';
import { apiConfigService } from '../services/apiConfigService';
import type { DataViewConfig } from '../types/apiConfig';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Data View Query Response
 */
export interface DataViewResponse<T = any> {
  entries: T[];
  vega_duration_ms?: number;
  overall_ms?: number;
}

/**
 * Data View ID 映射表
 * 将数据视图 ID 映射到实体类型
 */
export const DATA_VIEW_MAPPING = {
  // 物料领料单
  MATERIAL_REQUISITION: '2000819229596147715',
  // 采购订单
  PURCHASE_ORDER: '2000819229600342017',
  // 销售订单
  SALES_ORDER: '2000819229600342018',
  // 产品发货物流单
  PRODUCT_SHIPMENT: '2000819229596147714',
  // 客户
  CUSTOMER: '2000819229587759105',
  // 工厂
  FACTORY: '2000819229600342018',
  // 产品生产单
  PRODUCTION_ORDER: '2000819229579370498',
  // 物料采购事件
  MATERIAL_PROCUREMENT: '2000819229587759106',
  // 供应商
  SUPPLIER: '2000819229591953409',
  // BOM事件
  BOM_EVENT: '2000819229591953409',
  // 产品
  PRODUCT: '2000819229579370497',
  // 物料
  MATERIAL: '2000819229575176194',
  // 库存事件
  INVENTORY_EVENT: '2000819229575176194',
  // 供应商绩效评分
  SUPPLIER_PERFORMANCE: '2000819229591953410',
  // 仓库
  WAREHOUSE: '2000819229591953410',
  // 订单
  ORDER: '2000819229587759106',
} as const;

/**
 * Entity type to data view mapping
 * Maps entity types to their corresponding keys in DATA_VIEW_MAPPING
 */
const ENTITY_TYPE_MAPPING: Record<string, keyof typeof DATA_VIEW_MAPPING> = {
  'supplier': 'SUPPLIER',
  'material': 'MATERIAL',
  'product': 'PRODUCT',
  'bom': 'BOM_EVENT',
  'inventory': 'INVENTORY_EVENT',
  'order': 'ORDER',
  'customer': 'CUSTOMER',
  'warehouse': 'WAREHOUSE',
  'factory': 'FACTORY'
};

/**
 * Get data view ID by entity type
 * First tries to get from configuration service, falls back to hardcoded mapping
 * @param entityType - Entity type (e.g., 'supplier', 'material')
 * @returns Data view ID or null if not found
 */
export function getDataViewIdByEntityType(entityType: string): string | null {
  // Try to get from configuration service first
  try {
    const config = apiConfigService.getDataViewByEntityType(entityType);
    if (config && config.enabled) {
      console.log(`[DataViewApi] Using configured view ID for ${entityType}: ${config.viewId}`);
      return config.viewId;
    }
  } catch (error) {
    console.warn(`[DataViewApi] Failed to get view ID from config for ${entityType}:`, error);
  }

  // Fallback to hardcoded mapping
  const mappingKey = ENTITY_TYPE_MAPPING[entityType];
  if (mappingKey && DATA_VIEW_MAPPING[mappingKey]) {
    console.log(`[DataViewApi] Using hardcoded view ID for ${entityType}: ${DATA_VIEW_MAPPING[mappingKey]}`);
    return DATA_VIEW_MAPPING[mappingKey];
  }

  console.warn(`[DataViewApi] No view ID found for entity type: ${entityType}`);
  return null;
}

/**
 * Query options for data views
 */
export interface DataViewQueryOptions {
  /** 分页偏移量 */
  offset?: number;
  /** 分页大小 */
  limit?: number;
  /** 过滤条件 */
  filters?: any[];
  /** 排序字段 */
  sort?: string;
  /** 排序方向 */
  direction?: 'asc' | 'desc';
}

// ============================================================================
// API Client
// ============================================================================

class DataViewApiClient {
  private getBaseUrl(): string {
    return getServiceConfig('metricModel').baseUrl;
  }

  /**
   * Query data from a data view
   * @param dataViewId - Data view ID
   * @param options - Query options
   */
  async queryDataView<T = any>(
    dataViewId: string,
    options?: DataViewQueryOptions
  ): Promise<DataViewResponse<T>> {
    const {
      offset = 0,
      limit = 5000,
      filters = [],
      sort,
      direction,
    } = options || {};

    const requestBody: any = {
      offset,
      limit,
    };

    if (filters && filters.length > 0) {
      requestBody.filters = filters;
    }

    if (sort) {
      requestBody.sort = sort;
      requestBody.direction = direction || 'asc';
    }

    const url = `${this.getBaseUrl()}/data-views/${dataViewId}`;

    // Use POST + X-HTTP-Method-Override: GET (same as metricModelApi)
    const response = await httpClient.postAsGet<DataViewResponse<T>>(url, requestBody);
    return response.data;
  }

  /**
   * Query material requisitions
   */
  async getMaterialRequisitions(options?: DataViewQueryOptions) {
    return this.queryDataView(DATA_VIEW_MAPPING.MATERIAL_REQUISITION, options);
  }

  /**
   * Query purchase orders
   */
  async getPurchaseOrders(options?: DataViewQueryOptions) {
    return this.queryDataView(DATA_VIEW_MAPPING.PURCHASE_ORDER, options);
  }

  /**
   * Query sales orders
   */
  async getSalesOrders(options?: DataViewQueryOptions) {
    return this.queryDataView(DATA_VIEW_MAPPING.SALES_ORDER, options);
  }

  /**
   * Query product shipments
   */
  async getProductShipments(options?: DataViewQueryOptions) {
    return this.queryDataView(DATA_VIEW_MAPPING.PRODUCT_SHIPMENT, options);
  }

  /**
   * Query customers
   */
  async getCustomers(options?: DataViewQueryOptions) {
    // Special handling for Brain Mode (huida-new)
    if (getCurrentEnvironment() === 'huida-new') {
      return this.queryDataView('2004376134633480194', options);
    }
    return this.queryDataView(DATA_VIEW_MAPPING.CUSTOMER, options);
  }

  /**
   * Query factories
   */
  async getFactories(options?: DataViewQueryOptions) {
    // Special handling for Brain Mode (huida-new)
    if (getCurrentEnvironment() === 'huida-new') {
      return this.queryDataView('2004376134629285892', options);
    }
    return this.queryDataView(DATA_VIEW_MAPPING.FACTORY, options);
  }

  /**
   * Query production orders
   */
  async getProductionOrders(options?: DataViewQueryOptions) {
    return this.queryDataView(DATA_VIEW_MAPPING.PRODUCTION_ORDER, options);
  }

  /**
   * Query material procurements
   */
  async getMaterialProcurements(options?: DataViewQueryOptions) {
    return this.queryDataView(DATA_VIEW_MAPPING.MATERIAL_PROCUREMENT, options);
  }

  /**
   * Query suppliers
   */
  async getSuppliers(options?: DataViewQueryOptions) {
    // Special handling for Brain Mode (huida-new)
    if (getCurrentEnvironment() === 'huida-new') {
      return this.queryDataView('2004376134633480193', options);
    }
    return this.queryDataView(DATA_VIEW_MAPPING.SUPPLIER, options);
  }

  /**
   * Query BOM events
   */
  async getBOMEvents(options?: DataViewQueryOptions) {
    return this.queryDataView(DATA_VIEW_MAPPING.BOM_EVENT, options);
  }

  /**
   * Query products
   */
  async getProducts(options?: DataViewQueryOptions) {
    // Special handling for Brain Mode (huida-new)
    if (getCurrentEnvironment() === 'huida-new') {
      return this.queryDataView('2004376134620897282', options);
    }
    return this.queryDataView(DATA_VIEW_MAPPING.PRODUCT, options);
  }

  /**
   * Query materials
   */
  async getMaterials(options?: DataViewQueryOptions) {
    // Special handling for Brain Mode (huida-new)
    if (getCurrentEnvironment() === 'huida-new') {
      return this.queryDataView('2004376134629285891', options);
    }
    return this.queryDataView(DATA_VIEW_MAPPING.MATERIAL, options);
  }

  /**
   * Query inventory events
   */
  async getInventoryEvents(options?: DataViewQueryOptions) {
    return this.queryDataView(DATA_VIEW_MAPPING.INVENTORY_EVENT, options);
  }

  /**
   * Query supplier performance scores
   */
  async getSupplierPerformances(options?: DataViewQueryOptions) {
    return this.queryDataView(DATA_VIEW_MAPPING.SUPPLIER_PERFORMANCE, options);
  }

  /**
   * Query warehouses
   */
  async getWarehouses(options?: DataViewQueryOptions) {
    // Special handling for Brain Mode (huida-new)
    if (getCurrentEnvironment() === 'huida-new') {
      return this.queryDataView('2004376134625091585', options);
    }
    return this.queryDataView(DATA_VIEW_MAPPING.WAREHOUSE, options);
  }

  /**
   * Query orders
   */
  async getOrders(options?: DataViewQueryOptions) {
    // Special handling for Brain Mode (huida-new)
    if (getCurrentEnvironment() === 'huida-new') {
      return this.queryDataView('2004376134629285890', options);
    }
    return this.queryDataView(DATA_VIEW_MAPPING.ORDER, options);
  }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const dataViewApi = new DataViewApiClient();
export default dataViewApi;
