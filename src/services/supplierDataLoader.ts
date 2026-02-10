/**
 * Supplier Data Loader
 * 
 * Provides supplier data loading from API.
 */

import { ontologyApi } from '../api';
import { loadSupplierEntities, loadSupplierPerformanceScores } from './ontologyDataService';
import type { Supplier360Scorecard } from '../types/ontology';

/**
 * Load supplier 360 scorecards
 * Combines supplier entities with performance scores
 */
export async function loadSupplier360Scorecards(): Promise<Supplier360Scorecard[]> {
    console.log('[SupplierDataLoader] Loading supplier 360 scorecards...');

    try {
        // Load supplier data and performance scores in parallel
        const [suppliers, performances] = await Promise.all([
            loadSupplierEntities(),
            loadSupplierPerformanceScores(),
        ]);

        // Combine supplier data with performance scores
        const scorecards: Supplier360Scorecard[] = performances.map(perf => {
            const supplier = suppliers.find(s => s.supplier_id === perf.supplier_id);

            return {
                supplierId: perf.supplier_id,
                supplierName: perf.supplier_name || supplier?.supplier_name || perf.supplier_id,
                evaluationDate: perf.evaluation_date,
                overallScore: parseFloat(perf.overall_score) || 85,
                dimensions: {
                    qualityRating: parseFloat(perf.quality_score) || 85,
                    onTimeDeliveryRate: parseFloat(perf.otif_rate) || 90,
                    riskRating: getRiskRatingFromLevel(perf.risk_level),
                    onTimeDeliveryRate2: parseFloat(perf.delivery_score) || 90,
                    annualPurchaseAmount: parseFloat(perf.total_orders) || 0,
                    responseSpeed: parseFloat(perf.response_time_hours) || 24,
                },
                riskAssessment: {
                    supplierId: perf.supplier_id,
                    assessmentDate: perf.evaluation_date,
                    overallRiskLevel: normalizeRiskLevel(perf.risk_level),
                    financialStatus: {
                        score: 85,
                        lastUpdated: new Date().toISOString(),
                    },
                    publicSentiment: {
                        score: 80,
                        source: 'manual',
                        lastUpdated: new Date().toISOString(),
                    },
                    productionAnomalies: {
                        count: 0,
                        severity: 'low',
                        source: 'manual',
                        lastUpdated: new Date().toISOString(),
                    },
                    legalRisks: {
                        score: 15,
                        source: 'auto',
                        lastUpdated: new Date().toISOString(),
                        risks: [],
                    },
                },
            };
        });

        console.log(`[SupplierDataLoader] Loaded ${scorecards.length} supplier scorecards`);
        return scorecards;
    } catch (error) {
        console.error('[SupplierDataLoader] Failed to load supplier scorecards:', error);
        return [];
    }
}

/**
 * Load supplier list
 * Returns basic supplier information extracted from purchase data
 * Note: Since supplier entity may not be available or may cause errors,
 * we extract supplier information from purchase orders and purchase requests
 */
export async function loadSupplierList(): Promise<any[]> {
    console.log('[SupplierDataLoader] Loading supplier list from purchase data...');

    try {
        const { dynamicConfigService } = await import('./dynamicConfigService');

        // Get purchase order and purchase request configurations from backend
        const poConfig = await dynamicConfigService.getConfigByEntityType('purchase_order');
        const prConfig = await dynamicConfigService.getConfigByEntityType('purchase_request');

        const purchaseOrderTypeId = poConfig?.objectTypeId;
        const purchaseRequestTypeId = prConfig?.objectTypeId;

        if (!purchaseOrderTypeId && !purchaseRequestTypeId) {
            console.warn('[SupplierDataLoader] No purchase data sources configured');
            return [];
        }

        // Query both purchase orders and purchase requests in parallel
        const queries: Promise<any>[] = [];

        if (purchaseOrderTypeId) {
            queries.push(
                ontologyApi.queryObjectInstances(purchaseOrderTypeId, {
                    limit: 10000,
                    need_total: false,
                }).catch(err => {
                    console.error('[SupplierDataLoader] Failed to query purchase orders:', err);
                    return { entries: [] };
                })
            );
        } else {
            queries.push(Promise.resolve({ entries: [] }));
        }

        if (purchaseRequestTypeId) {
            queries.push(
                ontologyApi.queryObjectInstances(purchaseRequestTypeId, {
                    limit: 10000,
                    need_total: false,
                }).catch(err => {
                    console.error('[SupplierDataLoader] Failed to query purchase requests:', err);
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

        // Extract unique suppliers and calculate their purchase amounts
        const supplierMap = new Map<string, {
            supplier_id: string;
            supplier_code: string;
            supplier_name: string;
            supplierId: string;
            supplierName: string;
            totalPurchaseAmount: number;
            orderCount: number;
        }>();

        allEntries.forEach((item: any) => {
            const supplierCode = item.supplier_code || item.supplierCode || item.supplier_id || item.supplierId;
            const supplierName = item.supplier_name || item.supplierName || item.supplier || item.供应商;
            const quantity = Number(item.quantity || item.purchase_quantity || item.purchaseQuantity || 0);
            const unitPrice = Number(item.unit_price || item.unitPrice || item.price || item.单价 || 0);
            const totalAmount = Number(item.total_amount || item.totalAmount || item.amount || item.总金额 || (quantity * unitPrice));

            if (!supplierCode) return;

            if (!supplierMap.has(supplierCode)) {
                supplierMap.set(supplierCode, {
                    supplier_id: supplierCode,
                    supplier_code: supplierCode,
                    supplier_name: supplierName || supplierCode,
                    supplierId: supplierCode,
                    supplierName: supplierName || supplierCode,
                    totalPurchaseAmount: 0,
                    orderCount: 0,
                });
            }

            const supplier = supplierMap.get(supplierCode)!;
            supplier.totalPurchaseAmount += totalAmount;
            supplier.orderCount += 1;
        });

        // Convert to array and sort by purchase amount
        const suppliers = Array.from(supplierMap.values())
            .sort((a, b) => b.totalPurchaseAmount - a.totalPurchaseAmount);

        console.log(`[SupplierDataLoader] Loaded ${suppliers.length} suppliers from ${allEntries.length} purchase records`);
        return suppliers;
    } catch (error) {
        console.error('[SupplierDataLoader] Failed to load supplier list:', error);
        return [];
    }
}

/**
 * Load supplier scorecard for a specific supplier
 * @param supplierId - Supplier ID
 */
export async function loadSupplierScorecard(supplierId: string): Promise<Supplier360Scorecard | null> {
    console.log(`[SupplierDataLoader] Loading scorecard for supplier: ${supplierId}`);

    try {
        const scorecards = await loadSupplier360Scorecards();
        const scorecard = scorecards.find(s => s.supplierId === supplierId);

        if (!scorecard) {
            console.warn(`[SupplierDataLoader] Scorecard not found for supplier: ${supplierId}`);
            return null;
        }

        return scorecard;
    } catch (error) {
        console.error(`[SupplierDataLoader] Failed to load scorecard for ${supplierId}:`, error);
        return null;
    }
}

// Helper functions

function normalizeRiskLevel(riskLevel: string | undefined): 'low' | 'medium' | 'high' | 'critical' {
    if (!riskLevel) return 'low';
    const normalized = riskLevel.toLowerCase().trim();
    if (normalized === '低' || normalized === 'low') return 'low';
    if (normalized === '中' || normalized === 'medium') return 'medium';
    if (normalized === '高' || normalized === 'high') return 'high';
    if (normalized === '严重' || normalized === 'critical') return 'critical';
    return 'low';
}

function getRiskRatingFromLevel(riskLevel: string | undefined): number {
    const normalized = normalizeRiskLevel(riskLevel);
    switch (normalized) {
        case 'low': return 20;
        case 'medium': return 50;
        case 'high': return 80;
        case 'critical': return 95;
        default: return 50;
    }
}
