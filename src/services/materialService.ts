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
    console.log('[MaterialService] Getting main materials from supplier API...');

    try {
        const { ontologyApi } = await import('../api');
        const { apiConfigService } = await import('./apiConfigService');

        // Load supplier-material relationship data using config
        const objectTypeId = await apiConfigService.getOntologyObjectId('oo_supplier');

        if (!objectTypeId) {
            console.warn('[MaterialService] Missing configuration for "oo_supplier". Data fetching skipped. Please check Configuration Center.');
            return [];
        }

        const response = await ontologyApi.queryObjectInstances(objectTypeId, {
            limit: 10000,
            need_total: false,
        });

        // Group by material and calculate total purchase amount
        const materialMap = new Map<string, {
            materialCode: string;
            materialName: string;
            suppliers: Array<{
                supplierId: string;
                supplierName: string;
                unitPrice: number;
                paymentTerms: string;
            }>;
            totalPurchaseAmount: number;
        }>();

        response.entries.forEach((item: any) => {
            const materialCode = item.provided_material_code;
            const materialName = item.provided_material_name;
            const supplierCode = item.supplier_code;
            const supplierName = item.supplier;
            const unitPrice = Number(item.unit_price_with_tax || 0);

            if (!materialCode) return;

            if (!materialMap.has(materialCode)) {
                materialMap.set(materialCode, {
                    materialCode,
                    materialName,
                    suppliers: [],
                    totalPurchaseAmount: 0,
                });
            }

            const material = materialMap.get(materialCode)!;
            material.suppliers.push({
                supplierId: supplierCode,
                supplierName: supplierName,
                unitPrice,
                paymentTerms: item.payment_terms || '',
            });

            // Estimate purchase amount (unit price * estimated quantity)
            // Since we don't have actual purchase quantity, use unit price as proxy
            material.totalPurchaseAmount += unitPrice * 1000; // Assume 1000 units as baseline
        });

        // Convert to array and sort by total purchase amount
        const materials = Array.from(materialMap.values())
            .sort((a, b) => b.totalPurchaseAmount - a.totalPurchaseAmount)
            .map((material, index) => {
                // Get the primary supplier (lowest price)
                const primarySupplier = material.suppliers.sort((a, b) => a.unitPrice - b.unitPrice)[0];

                return {
                    rank: index + 1,
                    materialCode: material.materialCode,
                    materialName: material.materialName,
                    supplierId: primarySupplier.supplierId,
                    supplierName: primarySupplier.supplierName,
                    annualPurchaseAmount: material.totalPurchaseAmount,
                    currentStock: 0, // Not available in supplier API
                    qualityRating: 85, // Mock value
                    riskRating: 20, // Mock value
                    onTimeDeliveryRate: 90, // Mock value
                    riskCoefficient: 15, // Mock value
                    qualityEvents: [], // Not available in supplier API
                    alternativeSuppliers: material.suppliers.length - 1,
                };
            });

        console.log(`[MaterialService] Found ${materials.length} materials from supplier data`);
        return materials;
    } catch (error) {
        console.error('[MaterialService] Failed to get materials from supplier data:', error);
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
