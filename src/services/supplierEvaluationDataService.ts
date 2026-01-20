/**
 * Supplier Evaluation Data Service
 * 
 * Provides supplier evaluation data loading from Ontology API.
 * Extracts supplier information from supplier-material relationship data.
 */

import { ontologyApi } from '../api';
import { apiConfigService } from './apiConfigService';
import { ApiConfigType, type OntologyObjectConfig } from '../types/apiConfig';
import type { Supplier360Scorecard } from '../types/ontology';

// Default Object type ID for supplier evaluations - used as fallback
const DEFAULT_SUPPLIER_EVALUATION_OBJECT_TYPE_ID = 'd5700je9olk4bpa66vkg';

/**
 * Get supplier evaluation object type ID from configuration
 * @returns Object type ID for supplier evaluations
 */
function getSupplierEvaluationObjectTypeId(): string {
    const configs = apiConfigService.getConfigsByType(ApiConfigType.ONTOLOGY_OBJECT) as OntologyObjectConfig[];
    const supplierEvalConfig = configs.find(c =>
        c.enabled && c.entityType === 'supplier_evaluation'
    );

    if (supplierEvalConfig) {
        console.log(`[SupplierEvaluationDataService] Using configured object type ID: ${supplierEvalConfig.objectTypeId} (${supplierEvalConfig.name})`);
        return supplierEvalConfig.objectTypeId;
    }

    console.warn(`[SupplierEvaluationDataService] No supplier evaluation configuration found, using default: ${DEFAULT_SUPPLIER_EVALUATION_OBJECT_TYPE_ID}`);
    return DEFAULT_SUPPLIER_EVALUATION_OBJECT_TYPE_ID;
}

/**
 * Load supplier evaluations from API
 * Extracts supplier info from supplier-material relationship data
 * @returns Array of supplier evaluations
 */
export async function loadSupplierEvaluations(): Promise<Supplier360Scorecard[]> {
    console.log('[SupplierEvaluationDataService] Loading supplier-material data from API...');

    try {
        // Get configurable object type ID
        const objectTypeId = getSupplierEvaluationObjectTypeId();

        // Query object instances
        const response = await ontologyApi.queryObjectInstances(objectTypeId, {
            limit: 10000,
            need_total: false,
            include_type_info: true,
            include_logic_params: false,
        });

        console.log(`[SupplierEvaluationDataService] API returned ${response.entries.length} supplier-material entries`);

        // Debug: Log first entry to see actual field names
        if (response.entries.length > 0) {
            console.log('[SupplierEvaluationDataService] First entry sample:', response.entries[0]);
            console.log('[SupplierEvaluationDataService] Available fields:', Object.keys(response.entries[0]));

            // Check if supplier fields exist
            const hasSupplierCode = response.entries.some((e: any) => e.supplier_code || e.supplierCode);
            const hasSupplier = response.entries.some((e: any) => e.supplier);
            console.log('[SupplierEvaluationDataService] Has supplier_code field:', hasSupplierCode);
            console.log('[SupplierEvaluationDataService] Has supplier field:', hasSupplier);

            if (!hasSupplierCode && !hasSupplier) {
                console.error('[SupplierEvaluationDataService] ⚠️ API response does NOT contain supplier fields!');
                console.error('[SupplierEvaluationDataService] Expected fields: supplier_code, supplier, provided_material_code, unit_price_with_tax, payment_terms');
                console.error('[SupplierEvaluationDataService] Actual fields:', Object.keys(response.entries[0]));
            }
        }

        // Group materials by supplier
        const supplierMap = new Map<string, {
            name: string;
            materials: any[];
            totalPrice: number;
            avgDeliveryDays: number;
        }>();

        response.entries.forEach((item: any) => {
            // Extract supplier info from the data
            // API returns: supplier_code, supplier, provided_material_code, provided_material_name, unit_price_with_tax, payment_terms
            const supplierId = item.supplier_code || item.supplier_id || item.supplierCode || 'UNKNOWN';
            const supplierName = item.supplier || item.supplier_name || item.supplierName || `供应商-${supplierId}`;

            if (!supplierMap.has(supplierId)) {
                supplierMap.set(supplierId, {
                    name: supplierName,
                    materials: [],
                    totalPrice: 0,
                    avgDeliveryDays: 0,
                });
            }

            const supplier = supplierMap.get(supplierId)!;
            supplier.materials.push(item);

            // Use unit_price_with_tax if available, otherwise fall back to unit_price
            supplier.totalPrice += Number(item.unit_price_with_tax || item.unit_price || item.unitPrice || 0);

            // Parse payment_terms for delivery duration (e.g., "货到付款" or other terms)
            // If no delivery duration in payment_terms, use a default
            const deliveryStr = item.delivery_duration || item.deliveryDuration || item.payment_terms || '';
            const deliveryMatch = deliveryStr.match(/(\d+)/);
            if (deliveryMatch) {
                supplier.avgDeliveryDays += parseInt(deliveryMatch[1]);
            } else {
                // Default to 10 days if no delivery info
                supplier.avgDeliveryDays += 10;
            }
        });

        console.log(`[SupplierEvaluationDataService] Found ${supplierMap.size} unique suppliers`);

        // Generate evaluation data for each supplier
        const evaluations: Supplier360Scorecard[] = Array.from(supplierMap.entries()).map(([supplierId, data]) => {
            const materialCount = data.materials.length;
            const avgPrice = data.totalPrice / materialCount;
            const avgDelivery = data.avgDeliveryDays / materialCount;

            // Generate scores based on available metrics
            const priceScore = calculatePriceScore(avgPrice);
            const deliveryScore = calculateDeliveryScore(avgDelivery);
            const qualityScore = 75 + Math.random() * 20; // Mock quality score
            const serviceScore = 70 + Math.random() * 25; // Mock service score
            const riskScore = 80 + Math.random() * 15; // Mock risk score (higher is better for score, used for rating)
            const riskRating = 100 - riskScore; // Risk rating (lower is better, 0-100)

            const totalScore = (priceScore + deliveryScore + qualityScore + serviceScore) / 4;

            return {
                supplierId,
                supplierName: data.name,
                evaluationDate: new Date().toISOString().split('T')[0],
                overallScore: Math.round(totalScore),
                dimensions: {
                    qualityRating: Math.round(qualityScore),
                    onTimeDeliveryRate: Math.round(deliveryScore),
                    riskRating: Math.round(riskRating),
                    onTimeDeliveryRate2: Math.round(deliveryScore), // Duplicate as required by interface
                    annualPurchaseAmount: data.totalPrice * 12, // Estimate annual
                    responseSpeed: Math.round(serviceScore),
                },
                riskAssessment: {
                    supplierId,
                    assessmentDate: new Date().toISOString().split('T')[0],
                    overallRiskLevel: mapRiskLevel(totalScore),
                    financialStatus: {
                        score: 85,
                        lastUpdated: new Date().toISOString()
                    },
                    publicSentiment: {
                        score: 80,
                        source: 'manual',
                        lastUpdated: new Date().toISOString()
                    },
                    productionAnomalies: {
                        count: 0,
                        severity: 'low',
                        source: 'manual',
                        lastUpdated: new Date().toISOString()
                    },
                    legalRisks: {
                        score: 15,
                        source: 'auto',
                        lastUpdated: new Date().toISOString(),
                        risks: []
                    },
                }
            };
        });

        console.log(`[SupplierEvaluationDataService] Generated ${evaluations.length} supplier evaluations`);
        return evaluations;
    } catch (error) {
        console.error('[SupplierEvaluationDataService] Failed to load supplier evaluations:', error);
        throw error;
    }
}

/**
 * Calculate price score (lower price = higher score)
 */
function calculatePriceScore(avgPrice: number): number {
    // Price range: 0-10元 -> score 100-60
    if (avgPrice <= 1) return 100;
    if (avgPrice <= 5) return 90;
    if (avgPrice <= 10) return 75;
    return 60;
}

/**
 * Calculate delivery score (faster delivery = higher score)
 */
function calculateDeliveryScore(avgDays: number): number {
    // Delivery days: 0-30 -> score 100-60
    if (avgDays <= 5) return 100;
    if (avgDays <= 10) return 90;
    if (avgDays <= 20) return 75;
    return 60;
}

/**
 * Map risk level from score
 */
function mapRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score >= 80) return 'low';
    if (score >= 60) return 'medium';
    if (score >= 40) return 'high';
    return 'critical';
}
