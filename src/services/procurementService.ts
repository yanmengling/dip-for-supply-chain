import { ontologyApi } from '../api/ontologyApi';
import { dynamicConfigService } from './dynamicConfigService';
import { apiConfigService } from './apiConfigService';
import type { ProcurementSummary } from '../utils/cockpitDataService';

// Interfaces for Ontology Objects
export interface PurchaseOrder {
    id: string;
    po_number: string;
    supplier_id: string;
    supplier_name: string;
    status: string; // e.g., 'Draft', 'Approved', 'Ordered', 'received'
    create_time: string;
    total_amount?: number;
    items?: PurchaseOrderItem[];
}

export interface PurchaseOrderItem {
    material_code: string;
    material_name: string;
    quantity: number;
    unit_price?: number;
    amount?: number;
}

export interface PurchaseRequest {
    id: string;
    pr_number: string;
    requester: string;
    department: string;
    create_time: string;
    status: string;
    items?: PurchaseRequestItem[];
}

export interface PurchaseRequestItem {
    material_code: string;
    material_name: string;
    quantity: number;
}

class ProcurementService {
    /**
     * Get procurement summary metrics for the cockpit panel
     * Fetches real data from Ontology API for Purchase Orders and Purchase Requests
     */
    async getProcurementSummary(): Promise<ProcurementSummary> {
        console.log('[ProcurementService] Fetching procurement summary...');

        // 1. Resolve Object Type IDs
        const poConfig = await dynamicConfigService.getConfigByEntityType('purchase_order');
        const prConfig = await dynamicConfigService.getConfigByEntityType('purchase_request');

        const poTypeId = poConfig?.objectTypeId;
        const prTypeId = prConfig?.objectTypeId;

        console.log('[ProcurementService] Resolved Object Type IDs:', { poTypeId, prTypeId });

        // Initialize default empty summary
        const summary: ProcurementSummary = {
            monthlyPlannedTotal: 0,
            monthlyPurchasedTotal: 0,
            monthlyInTransitTotal: 0,
            top5Materials: []
        };

        // 2. Fetch Data if Object Types exist
        let purchaseOrders: any[] = [];
        let purchaseRequests: any[] = [];

        if (poTypeId) {
            try {
                // Fetch recent POs (last 100 to calculate items)
                const response = await ontologyApi.queryObjectInstances(poTypeId, {
                    limit: 100,
                    include_logic_params: true // In case items are a logic property
                });
                purchaseOrders = response.entries;
                console.log(`[ProcurementService] Fetched ${purchaseOrders.length} Purchase Orders`);
                if (purchaseOrders.length > 0) {
                    console.log('[ProcurementService] Sample PO:', JSON.stringify(purchaseOrders[0], null, 2));
                }
            } catch (error) {
                console.error('[ProcurementService] Failed to fetch Purchase Orders:', error);
            }
        } else {
            console.warn('[ProcurementService] No Purchase Order Object Type ID resolved!');
        }

        if (prTypeId) {
            try {
                const response = await ontologyApi.queryObjectInstances(prTypeId, {
                    limit: 100
                });
                purchaseRequests = response.entries;
                console.log(`[ProcurementService] Fetched ${purchaseRequests.length} Purchase Requests`);
                if (purchaseRequests.length > 0) {
                    console.log('[ProcurementService] Sample PR:', JSON.stringify(purchaseRequests[0], null, 2));
                }
            } catch (error) {
                console.error('[ProcurementService] Failed to fetch Purchase Requests:', error);
            }
        } else {
            console.warn('[ProcurementService] No Purchase Request Object Type ID resolved!');
        }

        // 3. Calculate Metrics from Real Data
        const materialSummary = new Map<string, { planned: number; purchased: number, name: string }>();

        // Helper to safely extract quantity from various possible fields
        const getQuantity = (item: any): number => {
            const val = item.quantity || item.qty || item.amount || item.count || 0;
            return Number(val) || 0;
        };

        // Helper to safely extract material name
        const getName = (item: any): string => {
            return item.material_name || item.materialName || item.product_name || item.productName || item.name || 'Unknown';
        };

        // Helper to safely extract material code
        const getCode = (item: any): string => {
            return item.material_code || item.materialCode || item.product_code || item.productCode || item.code || getName(item);
        };

        // Process Purchase Requests (Planned) - assuming items are directly on the object or in a specific field
        // Note: Real structure might be flat or nested. Assuming flat for now based on typical ontology usage or simplified view.
        // If PR contains items list, we need to iterate that. 
        // Based on Sample PR log (if we had one), we could refine. 
        // For now, treat PR itself as the item or containing main quantity.
        purchaseRequests.forEach(pr => {
            const qty = getQuantity(pr);
            const name = getName(pr);
            const code = getCode(pr);

            if (qty > 0) {
                const current = materialSummary.get(code) || { planned: 0, purchased: 0, name };
                current.planned += qty;
                // Update name if we have a better one
                if (name !== 'Unknown' && current.name === 'Unknown') current.name = name;
                materialSummary.set(code, current);
            }
        });

        // Process Purchase Orders (Purchased)
        purchaseOrders.forEach(po => {
            const qty = getQuantity(po);
            const name = getName(po);
            const code = getCode(po);

            if (qty > 0) {
                const current = materialSummary.get(code) || { planned: 0, purchased: 0, name };
                current.purchased += qty;
                if (name !== 'Unknown' && current.name === 'Unknown') current.name = name;
                materialSummary.set(code, current);
            }
        });

        // Calculate Totals and Top 5
        let totalPlanned = 0;
        let totalPurchased = 0;

        materialSummary.forEach(val => {
            totalPlanned += val.planned;
            totalPurchased += val.purchased;
        });

        const top5 = Array.from(materialSummary.values())
            .map(item => ({
                materialName: item.name,
                plannedQuantity: item.planned,
                purchasedQuantity: item.purchased,
                executionPercentage: item.planned > 0 ? (item.purchased / item.planned) * 100 : 0
            }))
            .sort((a, b) => b.plannedQuantity - a.plannedQuantity) // Sort by planned quantity desc
            .slice(0, 5);

        const result = {
            monthlyPlannedTotal: totalPlanned,
            monthlyPurchasedTotal: totalPurchased,
            monthlyInTransitTotal: 0,
            top5Materials: top5
        };

        console.log('[ProcurementService] Calculated Summary:', result);
        return result;
    }

    async getRecentPurchaseOrders(limit: number = 5): Promise<PurchaseOrder[]> {
        const poConfig = await dynamicConfigService.getConfigByEntityType('purchase_order');
        if (!poConfig?.objectTypeId) return [];

        try {
            const response = await ontologyApi.queryObjectInstances(poConfig.objectTypeId, {
                limit,
                include_type_info: true
            });
            // Map generic response to PurchaseOrder interface
            return response.entries.map((entry: any) => ({
                id: entry.id || entry._id,
                po_number: entry.po_number || entry.number || entry.id,
                supplier_id: entry.supplier_id || entry.supplierId || '',
                supplier_name: entry.supplier_name || entry.supplierName || 'Unknown Supplier',
                status: entry.status || 'Unknown',
                create_time: entry.create_time || entry.createTime || new Date().toISOString(),
                total_amount: Number(entry.total_amount || entry.totalAmount || entry.amount || 0),
                items: [] // Items usually need separate fetch or expanded query
            })) as PurchaseOrder[];
        } catch (e) {
            console.error('Failed to load recent POs', e);
            return [];
        }
    }

    async getRecentPurchaseRequests(limit: number = 5): Promise<PurchaseRequest[]> {
        const prConfig = await dynamicConfigService.getConfigByEntityType('purchase_request');
        if (!prConfig?.objectTypeId) return [];

        try {
            const response = await ontologyApi.queryObjectInstances(prConfig.objectTypeId, {
                limit,
                include_type_info: true
            });
            return response.entries.map((entry: any) => ({
                id: entry.id || entry._id,
                pr_number: entry.pr_number || entry.number || entry.id,
                requester: entry.requester || 'Unknown',
                department: entry.department || '',
                create_time: entry.create_time || entry.createTime || new Date().toISOString(),
                status: entry.status || 'Unknown',
                items: []
            })) as PurchaseRequest[];
        } catch (e) {
            console.error('Failed to load recent PRs', e);
            return [];
        }
    }
}

export const procurementService = new ProcurementService();
