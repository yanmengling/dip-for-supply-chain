/**
 * Material Service
 * 
 * Provides material-related business logic using API data.
 */

import { loadMaterialEntities, loadMaterialProcurementEvents, loadInventoryEvents, loadSupplierEntities } from './ontologyDataService';
import { ontologyApi } from '../api';

/**
 * Get main materials by purchase amount from supplier API
 * Uses supplier-material relationship data from configured object type
 * This avoids calling separate material and procurement APIs
 */
export async function getMainMaterialsFromSupplierData(): Promise<any[]> {
    console.log('[MaterialService] Getting main materials from purchase data...');

    try {
        const { ontologyApi } = await import('../api');
        const { dynamicConfigService } = await import('./dynamicConfigService');

        // Get purchase order and purchase request configurations from backend
        const poConfig = await dynamicConfigService.getConfigByEntityType('purchase_order');
        const prConfig = await dynamicConfigService.getConfigByEntityType('purchase_request');

        const purchaseOrderTypeId = poConfig?.objectTypeId;
        const purchaseRequestTypeId = prConfig?.objectTypeId;

        if (!purchaseOrderTypeId && !purchaseRequestTypeId) {
            console.warn('[MaterialService] Missing configuration for both purchase orders and purchase requests.');
            console.warn('[MaterialService] Please ensure these object types exist in the knowledge network.');
            return [];
        }


        // Query both purchase orders and purchase requests in parallel
        const queries: Promise<any>[] = [];

        if (purchaseOrderTypeId) {
            console.log(`[MaterialService] Querying purchase orders (${purchaseOrderTypeId})...`);
            queries.push(
                ontologyApi.queryObjectInstances(purchaseOrderTypeId, {
                    limit: 10000,
                    need_total: false,
                }).catch(err => {
                    console.error('[MaterialService] Failed to query purchase orders:', err);
                    return { entries: [] };
                })
            );
        } else {
            queries.push(Promise.resolve({ entries: [] }));
        }

        if (purchaseRequestTypeId) {
            console.log(`[MaterialService] Querying purchase requests (${purchaseRequestTypeId})...`);
            queries.push(
                ontologyApi.queryObjectInstances(purchaseRequestTypeId, {
                    limit: 10000,
                    need_total: false,
                }).catch(err => {
                    console.error('[MaterialService] Failed to query purchase requests:', err);
                    return { entries: [] };
                })
            );
        } else {
            queries.push(Promise.resolve({ entries: [] }));
        }

        const [purchaseOrdersResponse, purchaseRequestsResponse] = await Promise.all(queries);

        // Merge all entries
        const allEntries = [
            ...(purchaseOrdersResponse.entries || []),
            ...(purchaseRequestsResponse.entries || [])
        ];

        console.log(`[MaterialService] Retrieved ${allEntries.length} purchase records`);

        // Group by material and calculate metrics
        const materialMap = new Map<string, {
            materialCode: string;
            materialName: string;
            suppliers: Map<string, {
                supplierId: string;
                supplierName: string;
                totalAmount: number;
                totalQuantity: number;
                avgUnitPrice: number;
                orderCount: number;
            }>;
            totalPurchaseAmount: number;
        }>();

        allEntries.forEach((item: any) => {
            // Extract fields with multiple possible field names
            const materialCode = item.material_code || item.materialCode || item.material_id || item.materialId;
            const materialName = item.material_name || item.materialName || item.material || item.物料名称;
            const supplierCode = item.supplier_code || item.supplierCode || item.supplier_id || item.supplierId;
            const supplierName = item.supplier_name || item.supplierName || item.supplier || item.供应商;
            const quantity = Number(item.quantity || item.purchase_quantity || item.purchaseQuantity || 0);
            const unitPrice = Number(item.unit_price || item.unitPrice || item.price || item.单价 || 0);
            const totalAmount = Number(item.total_amount || item.totalAmount || item.amount || item.总金额 || (quantity * unitPrice));

            // Skip if missing critical fields
            if (!materialCode || !supplierCode) {
                return;
            }

            // Initialize material entry if not exists
            if (!materialMap.has(materialCode)) {
                materialMap.set(materialCode, {
                    materialCode,
                    materialName: materialName || materialCode,
                    suppliers: new Map(),
                    totalPurchaseAmount: 0,
                });
            }

            const material = materialMap.get(materialCode)!;

            // Initialize supplier entry if not exists
            if (!material.suppliers.has(supplierCode)) {
                material.suppliers.set(supplierCode, {
                    supplierId: supplierCode,
                    supplierName: supplierName || supplierCode,
                    totalAmount: 0,
                    totalQuantity: 0,
                    avgUnitPrice: 0,
                    orderCount: 0,
                });
            }

            const supplier = material.suppliers.get(supplierCode)!;
            supplier.totalAmount += totalAmount;
            supplier.totalQuantity += quantity;
            supplier.orderCount += 1;
            supplier.avgUnitPrice = supplier.totalQuantity > 0
                ? supplier.totalAmount / supplier.totalQuantity
                : unitPrice;

            material.totalPurchaseAmount += totalAmount;
        });

        // Convert to array and sort by total purchase amount
        const materials = Array.from(materialMap.values())
            .sort((a, b) => b.totalPurchaseAmount - a.totalPurchaseAmount)
            .map((material, index) => {
                // Get the primary supplier (highest purchase amount)
                const suppliersArray = Array.from(material.suppliers.values());
                const primarySupplier = suppliersArray.sort((a, b) => b.totalAmount - a.totalAmount)[0];

                return {
                    rank: index + 1,
                    materialCode: material.materialCode,
                    materialName: material.materialName,
                    supplierId: primarySupplier.supplierId,
                    supplierName: primarySupplier.supplierName,
                    annualPurchaseAmount: material.totalPurchaseAmount,
                    currentStock: 0, // Not available in purchase data
                    qualityRating: 85, // Mock value - should be calculated from quality data
                    riskRating: 20, // Mock value - should be calculated from risk assessment
                    onTimeDeliveryRate: 90, // Mock value - should be calculated from delivery data
                    riskCoefficient: 15, // Mock value - should be calculated from risk model
                    qualityEvents: [], // Not available in purchase data
                    alternativeSuppliers: suppliersArray.length - 1,
                };
            });

        console.log(`[MaterialService] Found ${materials.length} materials from purchase data`);
        return materials;
    } catch (error) {
        console.error('[MaterialService] Failed to get materials from purchase data:', error);
        return [];
    }
}

/**
 * Get main materials by purchase amount
 */
export async function getMainMaterialsByPurchaseAmount(): Promise<any[]> {
    console.log('[MaterialService] Getting main materials by purchase amount...');

    try {
        const [materials, procurementEvents] = await Promise.all([
            loadMaterialEntities(),
            loadMaterialProcurementEvents(),
        ]);

        // Calculate total purchase amount for each material
        const materialPurchaseMap = new Map<string, number>();

        procurementEvents.forEach(event => {
            const materialCode = event.material_code;
            const amount = parseFloat(event.total_amount || '0');

            if (materialCode) {
                const currentAmount = materialPurchaseMap.get(materialCode) || 0;
                materialPurchaseMap.set(materialCode, currentAmount + amount);
            }
        });

        // Combine material info with purchase amounts and sort
        const materialsWithPurchase = materials
            .map(material => ({
                ...material,
                totalPurchaseAmount: materialPurchaseMap.get(material.material_code) || 0,
            }))
            .filter(m => m.totalPurchaseAmount > 0)
            .sort((a, b) => b.totalPurchaseAmount - a.totalPurchaseAmount);

        console.log(`[MaterialService] Found ${materialsWithPurchase.length} materials with purchase data`);
        return materialsWithPurchase;
    } catch (error) {
        console.error('[MaterialService] Failed to get materials by purchase amount:', error);
        return [];
    }
}



/**
 * Get main materials by stock
 */
export async function getMainMaterialsByStock(): Promise<any[]> {
    console.log('[MaterialService] Getting main materials by stock...');

    try {
        const [materials, inventoryEvents] = await Promise.all([
            loadMaterialEntities(),
            loadInventoryEvents(),
        ]);

        // Calculate total stock for each material
        const materialStockMap = new Map<string, number>();

        inventoryEvents.forEach(event => {
            const materialCode = event.material_code || event.item_code;
            const quantity = parseFloat(event.quantity || event.inventory_data || '0');

            if (materialCode) {
                const currentStock = materialStockMap.get(materialCode) || 0;
                materialStockMap.set(materialCode, currentStock + quantity);
            }
        });

        // Combine material info with stock and sort
        const materialsWithStock = materials
            .map(material => ({
                ...material,
                currentStock: materialStockMap.get(material.material_code) || 0,
            }))
            .sort((a, b) => b.currentStock - a.currentStock);

        console.log(`[MaterialService] Found ${materialsWithStock.length} materials with stock data`);
        return materialsWithStock;
    } catch (error) {
        console.error('[MaterialService] Failed to get materials by stock:', error);
        return [];
    }
}
