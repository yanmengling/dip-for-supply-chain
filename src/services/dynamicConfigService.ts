/**
 * Dynamic Configuration Service
 * 
 * Fetches configuration data from backend APIs instead of using hardcoded values.
 * This service provides dynamic object type configurations by querying the ontology API.
 */

import { ontologyApi } from '../api/ontologyApi';
import type { ObjectType } from '../api/ontologyApi';

// ============================================================================
// Types
// ============================================================================

/**
 * Entity type mapping for special cases
 */
const ENTITY_TYPE_MAPPINGS: Record<string, string> = {
    'po': 'purchase_order',
    'pr': 'purchase_request',
    'salesorder': 'order',
    'mps': 'production_plan',
};

/**
 * Object type configuration for frontend use
 */
export interface OntologyObjectConfig {
    id: string;                    // Frontend config ID (e.g., "oo_supplier")
    type: 'ontology_object';
    name: string;                  // Display name
    description: string;
    objectTypeId: string;          // Backend object type ID
    entityType: string;            // Entity type for matching
    enabled: boolean;
    tags: string[];
    createdAt: number;
    updatedAt: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract entity type from object type ID
 * 
 * Examples:
 * - "supplychain_hd0202_supplier" -> "supplier"
 * - "supplychain_hd0202_po" -> "purchase_order"
 * - "d5700je9olk4bpa66vkg" -> "supplier_evaluation" (fallback to name-based)
 */
function extractEntityType(objectTypeId: string, objectTypeName: string): string {
    // Try to extract from ID pattern: {kn_id}_{entity_type}
    const parts = objectTypeId.split('_');

    if (parts.length >= 3) {
        // Last part is the entity type
        const lastPart = parts[parts.length - 1];

        // Check if it's a special case that needs mapping
        if (ENTITY_TYPE_MAPPINGS[lastPart]) {
            return ENTITY_TYPE_MAPPINGS[lastPart];
        }

        return lastPart;
    }

    // Fallback: try to infer from name
    const nameLower = objectTypeName.toLowerCase();

    if (nameLower.includes('供应商') || nameLower.includes('supplier')) return 'supplier';
    if (nameLower.includes('物料') || nameLower.includes('material')) return 'material';
    if (nameLower.includes('产品') || nameLower.includes('product')) return 'product';
    if (nameLower.includes('bom')) return 'bom';
    if (nameLower.includes('库存') || nameLower.includes('inventory')) return 'inventory';
    if (nameLower.includes('订单') || nameLower.includes('order')) return 'order';
    if (nameLower.includes('客户') || nameLower.includes('customer')) return 'customer';
    if (nameLower.includes('采购订单') || nameLower.includes('purchase_order') || nameLower.includes('purchase order')) return 'purchase_order';
    if (nameLower.includes('采购申请') || nameLower.includes('purchase_request') || nameLower.includes('purchase request')) return 'purchase_request';
    if (nameLower.includes('生产计划') || nameLower.includes('production plan')) return 'production_plan';
    if (nameLower.includes('评估')) return 'supplier_evaluation';

    // Last resort: use the object type ID itself
    return objectTypeId;
}

/**
 * Generate frontend config ID from entity type
 */
function generateConfigId(entityType: string): string {
    return `oo_${entityType}`;
}

/**
 * Convert backend object type to frontend config
 */
function convertToConfig(objectType: ObjectType): OntologyObjectConfig {
    const entityType = extractEntityType(objectType.id, objectType.name);
    const configId = generateConfigId(entityType);

    return {
        id: configId,
        type: 'ontology_object',
        name: `${objectType.name}对象`,
        description: `供应链大脑 - ${objectType.name}对象类型`,
        objectTypeId: objectType.id,
        entityType,
        enabled: true,
        tags: [entityType],
        createdAt: objectType.create_time || Date.now(),
        updatedAt: objectType.update_time || Date.now(),
    };
}

// ============================================================================
// Service Class
// ============================================================================

class DynamicConfigService {
    private objectTypeConfigsCache: OntologyObjectConfig[] | null = null;
    private lastFetchTime: number = 0;
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    /**
     * Get all object type configurations from backend
     * 
     * @param forceRefresh - Force refresh even if cache is valid
     * @returns Array of object type configurations
     */
    async getObjectTypeConfigs(forceRefresh: boolean = false): Promise<OntologyObjectConfig[]> {
        const now = Date.now();

        // Return cached data if valid
        if (
            !forceRefresh &&
            this.objectTypeConfigsCache &&
            now - this.lastFetchTime < this.CACHE_TTL
        ) {
            console.log('[DynamicConfig] Using cached object type configs');
            return this.objectTypeConfigsCache;
        }

        try {
            console.log('[DynamicConfig] Fetching object types from backend...');

            // Fetch all object types (limit: -1 means no limit)
            const response = await ontologyApi.getObjectTypes({ limit: -1 });

            console.log(`[DynamicConfig] Fetched ${response.entries.length} object types`);

            // Convert to frontend config format
            const configs = response.entries.map(convertToConfig);

            // Update cache
            this.objectTypeConfigsCache = configs;
            this.lastFetchTime = now;

            console.log('[DynamicConfig] Object type configs:', configs.map(c => ({
                id: c.id,
                entityType: c.entityType,
                objectTypeId: c.objectTypeId,
            })));

            return configs;
        } catch (error) {
            console.error('[DynamicConfig] Failed to fetch object types:', error);

            // If we have cached data, return it even if expired
            if (this.objectTypeConfigsCache) {
                console.warn('[DynamicConfig] Using expired cache due to error');
                return this.objectTypeConfigsCache;
            }

            // No cache available, return empty array
            console.error('[DynamicConfig] No cache available, returning empty array');
            return [];
        }
    }

    /**
     * Get object type config by entity type
     */
    async getConfigByEntityType(entityType: string): Promise<OntologyObjectConfig | undefined> {
        const configs = await this.getObjectTypeConfigs();
        return configs.find(c => c.entityType === entityType);
    }

    /**
     * Get object type config by config ID
     */
    async getConfigById(configId: string): Promise<OntologyObjectConfig | undefined> {
        const configs = await this.getObjectTypeConfigs();
        return configs.find(c => c.id === configId);
    }

    /**
     * Get object type config by object type ID
     */
    async getConfigByObjectTypeId(objectTypeId: string): Promise<OntologyObjectConfig | undefined> {
        const configs = await this.getObjectTypeConfigs();
        return configs.find(c => c.objectTypeId === objectTypeId);
    }

    /**
     * Clear cache and force refresh on next request
     */
    clearCache(): void {
        console.log('[DynamicConfig] Cache cleared');
        this.objectTypeConfigsCache = null;
        this.lastFetchTime = 0;
    }

    /**
     * Refresh cache immediately
     */
    async refreshCache(): Promise<void> {
        await this.getObjectTypeConfigs(true);
    }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const dynamicConfigService = new DynamicConfigService();
