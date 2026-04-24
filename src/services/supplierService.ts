/**
 * Supplier Service
 * 
 * Provides supplier-related business logic using API data.
 */

import { loadSupplierEntities, loadSupplierPerformanceScores, loadMaterialProcurementEvents } from './ontologyDataService';

/**
 * Get alternative suppliers for a material
 */
export async function getAlternativeSuppliers(materialCode: string): Promise<any[]> {
  console.log(`[SupplierService] Getting alternative suppliers for material: ${materialCode}`);

  try {
    const [suppliers, procurementEvents] = await Promise.all([
      loadSupplierEntities(),
      loadMaterialProcurementEvents(),
    ]);

    // Find suppliers who supply this material
    const supplierIds = new Set<string>();
    procurementEvents
      .filter(event => event.material_code === materialCode)
      .forEach(event => {
        if (event.supplier_id) {
          supplierIds.add(event.supplier_id);
        }
      });

    // Get supplier details
    const alternativeSuppliers = suppliers.filter(s => supplierIds.has(s.supplier_id));

    console.log(`[SupplierService] Found ${alternativeSuppliers.length} alternative suppliers`);
    return alternativeSuppliers;
  } catch (error) {
    console.error(`[SupplierService] Failed to get alternative suppliers:`, error);
    return [];
  }
}

/**
 * Get suppliers by purchase amount
 */
export async function getSuppliersByPurchaseAmount(): Promise<any[]> {
  console.log('[SupplierService] Getting suppliers by purchase amount...');

  try {
    const [suppliers, procurementEvents] = await Promise.all([
      loadSupplierEntities(),
      loadMaterialProcurementEvents(),
    ]);

    // Calculate total purchase amount for each supplier
    const supplierPurchaseMap = new Map<string, number>();

    procurementEvents.forEach(event => {
      const supplierId = event.supplier_id;
      const amount = parseFloat(event.total_amount || '0');

      if (supplierId) {
        const currentAmount = supplierPurchaseMap.get(supplierId) || 0;
        supplierPurchaseMap.set(supplierId, currentAmount + amount);
      }
    });

    // Combine supplier info with purchase amounts and sort
    const suppliersWithPurchase = suppliers
      .map(supplier => ({
        ...supplier,
        totalPurchaseAmount: supplierPurchaseMap.get(supplier.supplier_id) || 0,
      }))
      .filter(s => s.totalPurchaseAmount > 0)
      .sort((a, b) => b.totalPurchaseAmount - a.totalPurchaseAmount);

    console.log(`[SupplierService] Found ${suppliersWithPurchase.length} suppliers with purchase data`);
    return suppliersWithPurchase;
  } catch (error) {
    console.error('[SupplierService] Failed to get suppliers by purchase amount:', error);
    return [];
  }
}

/**
 * Get supplier comparison data
 * Uses supplier-material relationship data from configured object type
 */
export async function getSupplierComparison(supplierId: string): Promise<any | null> {
  console.log(`[SupplierService] Getting comparison data for supplier: ${supplierId}`);

  try {
    const { ontologyApi } = await import('../api');
    const { apiConfigService } = await import('./apiConfigService');

    // Load supplier-material relationship data using config
    const objectTypeId = await apiConfigService.getOntologyObjectId('oo_supplier') || '';
    const response = await ontologyApi.queryObjectInstances(objectTypeId, {
      limit: 10000,
      need_total: false,
    });

    // Find current supplier's materials
    const currentSupplierMaterials = response.entries.filter(
      (item: any) => item.supplier_code === supplierId
    );

    if (currentSupplierMaterials.length === 0) {
      console.warn(`[SupplierService] No materials found for supplier: ${supplierId}`);
      return null;
    }

    // Get the first material for this supplier
    const firstMaterial = currentSupplierMaterials[0];
    const materialCode = firstMaterial.provided_material_code;
    const materialName = firstMaterial.provided_material_name;

    // Find alternative suppliers for the same material
    const alternativeSupplierData = response.entries
      .filter((item: any) =>
        item.provided_material_code === materialCode &&
        item.supplier_code !== supplierId
      )
      .map((item: any) => ({
        supplierId: item.supplier_code,
        supplierName: item.supplier,
        materialCode: item.provided_material_code,
        materialName: item.provided_material_name,
        unitPrice: Number(item.unit_price_with_tax || 0),
        paymentTerms: item.payment_terms || '',
        isLowestPrice: item.is_lowest_price_alternative === '是',
        recommendationReason: item.is_lowest_price_alternative === '是'
          ? '最低价替代供应商'
          : '备选供应商',
        similarityScore: 85, // Mock value
        comparison: {
          riskLevel: 'low' as const,
          qualityScore: 85,
          deliveryScore: 90,
        },
        scorecard: {
          supplierId: item.supplier_code,
          supplierName: item.supplier,
          evaluationDate: new Date().toISOString().split('T')[0],
          overallScore: 85,
          dimensions: {
            qualityRating: 85,
            onTimeDeliveryRate: 90,
            riskRating: 20,
            onTimeDeliveryRate2: 90,
            annualPurchaseAmount: 0,
            responseSpeed: 24,
          },
          riskAssessment: {
            supplierId: item.supplier_code,
            assessmentDate: new Date().toISOString().split('T')[0],
            overallRiskLevel: 'low' as const,
            financialStatus: { score: 85, lastUpdated: new Date().toISOString() },
            publicSentiment: { score: 80, source: 'manual' as const, lastUpdated: new Date().toISOString() },
            productionAnomalies: { count: 0, severity: 'low' as const, source: 'manual' as const, lastUpdated: new Date().toISOString() },
            legalRisks: { score: 15, source: 'auto' as const, lastUpdated: new Date().toISOString(), risks: [] },
          },
        },
      }));

    // Build comparison object
    const comparison = {
      currentSupplier: {
        supplierId: firstMaterial.supplier_code,
        supplierName: firstMaterial.supplier,
        materialCode,
        materialName,
        unitPrice: Number(firstMaterial.unit_price_with_tax || 0),
        paymentTerms: firstMaterial.payment_terms || '',
        scorecard: {
          supplierId: firstMaterial.supplier_code,
          supplierName: firstMaterial.supplier,
          evaluationDate: new Date().toISOString().split('T')[0],
          overallScore: 85,
          dimensions: {
            qualityRating: 85,
            onTimeDeliveryRate: 90,
            riskRating: 20,
            onTimeDeliveryRate2: 90,
            annualPurchaseAmount: 0,
            responseSpeed: 24,
          },
          riskAssessment: {
            supplierId: firstMaterial.supplier_code,
            assessmentDate: new Date().toISOString().split('T')[0],
            overallRiskLevel: 'low' as const,
            financialStatus: { score: 85, lastUpdated: new Date().toISOString() },
            publicSentiment: { score: 80, source: 'manual' as const, lastUpdated: new Date().toISOString() },
            productionAnomalies: { count: 0, severity: 'low' as const, source: 'manual' as const, lastUpdated: new Date().toISOString() },
            legalRisks: { score: 15, source: 'auto' as const, lastUpdated: new Date().toISOString(), risks: [] },
          },
        },
      },
      alternativeSuppliers: alternativeSupplierData,
      affectedOrders: [], // Not available in supplier API
    };

    console.log(`[SupplierService] Found ${alternativeSupplierData.length} alternative suppliers for material ${materialCode}`);
    return comparison;
  } catch (error) {
    console.error(`[SupplierService] Failed to get supplier comparison:`, error);
    return null;
  }
}


