/**
 * Ontology Data Service
 * 
 * Provides data loading from the HD Supply Chain Knowledge Network via API.
 * All functions now use ontologyApi.queryObjectInstances() instead of CSV files.
 */

import { ontologyApi } from '../api';
import type { QueryCondition } from '../api/ontologyApi';
import { apiConfigService } from './apiConfigService';

// ============================================================================
// Object Type ID Getters (从配置中心动态获取)
// ============================================================================

/**
 * 从配置中心获取对象类型 ID
 * @param entityType - 实体类型（如 'product', 'supplier', 等）
 * @param entityName - 实体名称（用于错误提示）
 */
function getObjectTypeId(entityType: string, entityName: string): string {
    const config = apiConfigService.getOntologyObjectByEntityType(entityType);
    if (!config || !config.enabled) {
        console.error(`[OntologyDataService] 未找到启用的${entityName}对象配置 (entity_type: ${entityType})`);
        throw new Error(`${entityName}对象未配置，请在配置中心添加 ${entityType} 类型的业务对象配置`);
    }
    console.log(`[OntologyDataService] 使用配置的${entityName}对象类型ID: ${config.objectTypeId}`);
    return config.objectTypeId;
}

/**
 * 动态获取对象类型 ID
 * 注意：entityType 必须与配置中心的配置匹配
 */
const getObjectTypeIds = () => ({
    PRODUCT: getObjectTypeId('product', '产品'),           // supplychain_hd0202_product
    SUPPLIER: getObjectTypeId('supplier', '供应商'),       // supplychain_hd0202_supplier
    MATERIAL: getObjectTypeId('material', '物料'),         // supplychain_hd0202_material
    BOM: getObjectTypeId('bom', 'BOM'),                    // supplychain_hd0202_bom
    INVENTORY: getObjectTypeId('inventory', '库存'),       // supplychain_hd0202_inventory
    SALES_ORDER: getObjectTypeId('order', '销售订单'),     // supplychain_hd0202_salesorder (注意：entityType 是 'order')
});

// ============================================================================
// In-memory cache
// ============================================================================

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > CACHE_TTL) {
        cache.delete(key);
        return null;
    }

    return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
    cache.set(key, {
        data,
        timestamp: Date.now(),
    });
}

// ============================================================================
// API Data Loading Functions
// ============================================================================

/**
 * Load product entities
 * Returns: product_id, product_name, product_code, status, created_date, etc.
 */
export async function loadProductEntities(forceReload: boolean = false): Promise<any[]> {
    const cacheKey = 'product_entities';

    if (!forceReload) {
        const cached = getCached<any[]>(cacheKey);
        if (cached) {
            console.log('[OntologyDataService] Using cached product entities');
            return cached;
        }
    }

    console.log('[OntologyDataService] Loading product entities from API...');

    try {
        const response = await ontologyApi.queryObjectInstances(getObjectTypeIds().PRODUCT, {
            limit: 10000,
            need_total: false,
        });

        const products = response.entries.map((item: any) => ({
            product_id: item.product_id || item.product_code,
            product_code: item.product_code || '',
            product_name: item.product_name || '',
            product_model: item.product_model,
            product_series: item.product_series,
            product_type: item.product_type,
            status: item.status || 'Active',
            created_date: item.created_date || item.create_time,
            main_unit: item.main_unit || item.unit,
        }));

        console.log(`[OntologyDataService] Loaded ${products.length} product entities`);
        setCache(cacheKey, products);
        return products;
    } catch (error) {
        console.error('[OntologyDataService] Failed to load product entities:', error);
        return [];
    }
}

/**
 * Load BOM events
 * Returns: parent_id, child_code, parent_type, status, etc.
 */
export async function loadBOMEvents(forceReload: boolean = false): Promise<any[]> {
    const cacheKey = 'bom_events';

    if (!forceReload) {
        const cached = getCached<any[]>(cacheKey);
        if (cached) {
            console.log('[OntologyDataService] Using cached BOM events');
            return cached;
        }
    }

    console.log('[OntologyDataService] Loading BOM events from API...');

    try {
        const response = await ontologyApi.queryObjectInstances(getObjectTypeIds().BOM, {
            limit: 10000,
            need_total: false,
        });

        const bomEvents = response.entries.map((item: any) => ({
            bom_id: item.bom_id || item.bom_number,
            parent_id: item.parent_code || item.parent_id,
            parent_code: item.parent_code,
            child_code: item.child_code || '',
            child_name: item.child_name,
            parent_type: 'Product', // Default to Product
            status: item.status || 'Active',
            quantity: item.quantity || item.child_quantity,
            unit: item.unit,
            relationship_type: item.relationship_type,
        }));

        console.log(`[OntologyDataService] Loaded ${bomEvents.length} BOM events`);
        setCache(cacheKey, bomEvents);
        return bomEvents;
    } catch (error) {
        console.error('[OntologyDataService] Failed to load BOM events:', error);
        return [];
    }
}

/**
 * Load inventory events
 * Returns: item_id, item_code, quantity, snapshot_month, item_type, status, etc.
 */
export async function loadInventoryEvents(forceReload: boolean = false): Promise<any[]> {
    const cacheKey = 'inventory_events';

    if (!forceReload) {
        const cached = getCached<any[]>(cacheKey);
        if (cached) {
            console.log('[OntologyDataService] Using cached inventory events');
            return cached;
        }
    }

    console.log('[OntologyDataService] Loading inventory events from API...');

    try {
        const response = await ontologyApi.queryObjectInstances(getObjectTypeIds().INVENTORY, {
            limit: 10000,
            need_total: false,
        });

        const inventoryEvents = response.entries.map((item: any) => ({
            item_id: item.item_id || item.product_code || item.material_code,
            item_code: item.item_code || item.material_code || item.product_code,
            material_code: item.material_code,
            material_name: item.material_name,
            quantity: item.quantity || item.inventory_data || item.available_quantity || '0',
            snapshot_month: item.snapshot_month || item.update_time,
            item_type: item.item_type || 'Product',
            status: item.status || 'Active',
            inventory_data: item.inventory_data,
            available_quantity: item.available_quantity,
            safety_stock: item.safety_stock,
        }));

        console.log(`[OntologyDataService] Loaded ${inventoryEvents.length} inventory events`);
        setCache(cacheKey, inventoryEvents);
        return inventoryEvents;
    } catch (error) {
        console.error('[OntologyDataService] Failed to load inventory events:', error);
        return [];
    }
}

/**
 * Load supplier entities
 * Returns: supplier_id, supplier_name, etc.
 * Note: The SUPPLIER object type returns supplier-material relationship data,
 * so we need to deduplicate by supplier_code to get unique suppliers.
 */
export async function loadSupplierEntities(forceReload: boolean = false): Promise<any[]> {
    const cacheKey = 'supplier_entities';

    if (!forceReload) {
        const cached = getCached<any[]>(cacheKey);
        if (cached) {
            console.log('[OntologyDataService] Using cached supplier entities');
            return cached;
        }
    }

    console.log('[OntologyDataService] Loading supplier entities from API...');

    try {
        const response = await ontologyApi.queryObjectInstances(getObjectTypeIds().SUPPLIER, {
            limit: 10000,
            need_total: false,
        });

        // API returns supplier-material relationship data with fields:
        // supplier_code, supplier, provided_material_code, provided_material_name, unit_price_with_tax, payment_terms

        // Group by supplier_code to get unique suppliers
        const supplierMap = new Map<string, any>();

        response.entries.forEach((item: any) => {
            const supplierCode = item.supplier_code || item.supplier_id;
            const supplierName = item.supplier || item.supplier_name || '';

            if (supplierCode && !supplierMap.has(supplierCode)) {
                supplierMap.set(supplierCode, {
                    supplier_id: supplierCode,
                    supplier_code: supplierCode,
                    supplier_name: supplierName,
                    supplierId: supplierCode,  // Add this for compatibility
                    supplierName: supplierName, // Add this for compatibility
                    supplier_type: item.supplier_type,
                    contact: item.contact,
                    phone: item.phone,
                    email: item.email,
                    address: item.address,
                    status: item.status || 'Active',
                });
            }
        });

        const suppliers = Array.from(supplierMap.values());

        console.log(`[OntologyDataService] Loaded ${suppliers.length} supplier entities (from ${response.entries.length} supplier-material records)`);
        setCache(cacheKey, suppliers);
        return suppliers;
    } catch (error) {
        console.error('[OntologyDataService] Failed to load supplier entities:', error);
        return [];
    }
}

/**
 * Load supplier performance scores
 * Returns: supplier_id, overall_score, quality_score, otif_rate, etc.
 */
export async function loadSupplierPerformanceScores(forceReload: boolean = false): Promise<any[]> {
    console.warn('[OntologyDataService] Supplier performance object type ID needs to be confirmed');
    console.warn('[OntologyDataService] Returning empty array until correct ID is provided');
    return [];
}

/**
 * Load sales order events
 * Returns: sales_order_id, product_id, quantity, order_status, etc.
 */
export async function loadSalesOrderEvents(forceReload: boolean = false): Promise<any[]> {
    const cacheKey = 'sales_order_events';

    if (!forceReload) {
        const cached = getCached<any[]>(cacheKey);
        if (cached) {
            console.log('[OntologyDataService] Using cached sales order events');
            return cached;
        }
    }

    console.log('[OntologyDataService] Loading sales order events from API...');

    try {
        const response = await ontologyApi.queryObjectInstances(getObjectTypeIds().SALES_ORDER, {
            limit: 10000,
            need_total: false,
        });

        const salesOrders = response.entries.map((item: any) => ({
            sales_order_id: item.sales_order_id || item.order_number,
            sales_order_number: item.sales_order_number || item.order_number,
            product_id: item.product_id || item.product_code,
            product_code: item.product_code,
            customer_name: item.customer_name || item.client,
            quantity: item.quantity || item.signing_quantity || '0',
            signing_quantity: item.signing_quantity,
            shipping_quantity: item.shipping_quantity,
            document_date: item.document_date || item.order_date,
            planned_delivery_date: item.planned_delivery_date || item.due_date,
            order_status: item.order_status || item.status || 'Active',
            status: item.status || 'Active',
        }));

        console.log(`[OntologyDataService] Loaded ${salesOrders.length} sales order events`);
        setCache(cacheKey, salesOrders);
        return salesOrders;
    } catch (error) {
        console.error('[OntologyDataService] Failed to load sales order events:', error);
        return [];
    }
}

/**
 * Load material entities
 * Returns: material_code, material_name, etc.
 */
export async function loadMaterialEntities(forceReload: boolean = false): Promise<any[]> {
    const cacheKey = 'material_entities';

    if (!forceReload) {
        const cached = getCached<any[]>(cacheKey);
        if (cached) {
            console.log('[OntologyDataService] Using cached material entities');
            return cached;
        }
    }

    console.log('[OntologyDataService] Loading material entities from API...');

    try {
        const response = await ontologyApi.queryObjectInstances(getObjectTypeIds().MATERIAL, {
            limit: 10000,
            need_total: false,
        });

        const materials = response.entries.map((item: any) => ({
            material_code: item.material_code || '',
            material_name: item.material_name || '',
            material_type: item.material_type,
            specification: item.specification,
            unit: item.unit,
            unit_price: item.unit_price,
            delivery_duration: item.delivery_duration,
            status: item.status || 'Active',
        }));

        console.log(`[OntologyDataService] Loaded ${materials.length} material entities`);
        setCache(cacheKey, materials);
        return materials;
    } catch (error) {
        console.error('[OntologyDataService] Failed to load material entities:', error);
        return [];
    }
}

/**
 * Load material procurement events
 * Returns: material_code, supplier_id, procurement data, etc.
 */
export async function loadMaterialProcurementEvents(forceReload: boolean = false): Promise<any[]> {
    console.warn('[OntologyDataService] Procurement event object type ID needs to be confirmed');
    console.warn('[OntologyDataService] Returning empty array until correct ID is provided');
    return [];
}

/**
 * Clear all caches
 */
export function clearCache(): void {
    cache.clear();
    console.log('[OntologyDataService] Cache cleared');
}
