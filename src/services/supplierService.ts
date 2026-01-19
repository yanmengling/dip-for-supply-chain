/**
 * Supplier Service
 * 
 * Handles supplier comparison, alternative supplier recommendations, and sourcing queries.
 * 
 * Principle 1: All types imported from ontology.ts
 */

import type {
  AlternativeSupplier,
  SupplierComparison,
  Supplier,
  RiskLevel,
  Supplier360Scorecard
} from '../types/ontology';
import {
  supplier360ScorecardsData,
  mainMaterialSuppliersData,
  ordersData
} from '../utils/entityConfigService';
import {
  loadAlternativeSuppliers,
  loadSupplierPerformanceScores,
  loadMaterialEntities,
  loadSupplierEntities
} from './ontologyDataService';
import { getHDAlternativeSuppliers, loadHDSupplierScorecard } from './hdSupplierDataLoader';

/**
 * Get alternative suppliers for a specific material
 * 
 * @param materialCode Material code
 * @param limit Maximum number of alternatives (default: 5)
 * @param minSimilarity Minimum similarity score (default: 50)
 * @returns Array of alternative suppliers
 */
export const getAlternativeSuppliers = async (
  materialCode: string,
  limit: number = 5,
  minSimilarity: number = 50
): Promise<AlternativeSupplier[]> => {
  try {
    // Try loading from CSV first
    const csvAlternatives = await loadAlternativeSuppliers();
    console.log('Loaded CSV alternatives:', csvAlternatives.length, 'records');

    if (csvAlternatives.length > 0) {
      // Debug: Log first few records
      console.log('First 3 CSV records:', csvAlternatives.slice(0, 3).map(alt => ({
        material_code: alt.material_code,
        material_name: alt.material_name,
        alt_supplier: alt.alternative_supplier_name
      })));

      // Filter for this material
      const filtered = csvAlternatives.filter(alt => alt.material_code === materialCode);
      console.log('Filtered alternatives for', materialCode, ':', filtered.length);

      // Debug: If no match, show available material codes
      if (filtered.length === 0) {
        const uniqueMaterialCodes = [...new Set(csvAlternatives.map(alt => alt.material_code))];
        console.log('Available material codes in CSV:', uniqueMaterialCodes.slice(0, 10));
        console.log('Looking for:', materialCode, 'Type:', typeof materialCode);
      }

      // Load supplier performance data to enrich alternatives
      const supplierPerformances = await loadSupplierPerformanceScores();

      // Convert CSV data to AlternativeSupplier format
      const alternatives: AlternativeSupplier[] = filtered
        .filter(alt => parseFloat(alt.similarity_score) >= minSimilarity)
        .sort((a, b) => parseFloat(b.similarity_score) - parseFloat(a.similarity_score))
        .slice(0, limit)
        .map(alt => {
          // Find performance data for this alternative supplier
          const altPerformance = supplierPerformances.find(p => p.supplier_id === alt.alternative_supplier_id);

          // Helper function to normalize risk level
          const normalizeRiskLevel = (riskLevel: string | undefined): RiskLevel => {
            if (!riskLevel) return 'low';
            const normalized = riskLevel.toLowerCase().trim();
            if (normalized === '低' || normalized === 'low') return 'low';
            if (normalized === '中' || normalized === 'medium') return 'medium';
            if (normalized === '高' || normalized === 'high') return 'high';
            if (normalized === '严重' || normalized === 'critical') return 'critical';
            return 'low';
          };

          return {
            supplierId: alt.alternative_supplier_id,
            supplierName: alt.alternative_supplier_name,
            materialCode: alt.material_code,
            similarityScore: parseFloat(alt.similarity_score),
            recommendationReason: alt.recommendation_reason,
            comparison: {
              // Use real performance data if available, otherwise parse from alternative CSV
              onTimeDeliveryRate: altPerformance
                ? parseFloat(altPerformance.otif_rate)
                : parseFloat(alt.delivery_comparison || '85'),
              quality: altPerformance
                ? parseFloat(altPerformance.quality_score)
                : parseFloat(alt.quality_comparison || '85'),
              price: parseFloat(alt.price_comparison || '85'),
              responseSpeed: altPerformance
                ? parseFloat(altPerformance.service_score || '85')
                : 85,
              riskLevel: normalizeRiskLevel(altPerformance?.risk_level || alt.risk_level)
            },
            availability: alt.availability === '是' || alt.availability === 'true' || alt.availability === 'True'
          };
        });

      console.log('Returning', alternatives.length, 'alternatives for', materialCode);
      return alternatives;
    }
  } catch (error) {
    console.error('Failed to load alternatives from CSV:', error);
  }

  return [];

};

/**
 * Get alternative suppliers based on mode
 * 
 * @param materialCode Material code
 * @param mode Data mode 'mock' or 'api'
 * @param limit Maximum number of alternatives
 * @returns Array of alternative suppliers
 */
export const getAlternativeSuppliersWithMode = async (
  materialCode: string,
  mode: 'mock' | 'api',
  limit: number = 5
): Promise<AlternativeSupplier[]> => {
  // Always use Brain Mode (HD Data), ignoring mode parameter
  return await getHDAlternativeSuppliers(materialCode, limit);
};

/**
 * Get all suppliers sorted by annual purchase amount (descending)
 * 
 * @returns Array of suppliers with annual purchase amounts, sorted descending
 */
export const getSuppliersByPurchaseAmount = async (): Promise<Array<Supplier & { annualPurchaseAmount: number }>> => {
  try {
    // Load real data from CSV
    const [supplierPerformances, supplierEntities] = await Promise.all([
      loadSupplierPerformanceScores(true),
      loadSupplierEntities(true)
    ]);

    console.log('🔍 Loading suppliers for selector:', {
      performances: supplierPerformances.length,
      entities: supplierEntities.length
    });

    // Build result array with real data
    const result: Array<Supplier & { annualPurchaseAmount: number }> = supplierEntities.map(entity => {
      const performance = supplierPerformances.find(p => p.supplier_id === entity.supplier_id);
      // Try to find material name from mainMaterialSuppliersData
      const mainMaterial = mainMaterialSuppliersData.find(m => m.supplierId === entity.supplier_id);

      return {
        supplierId: entity.supplier_id,
        supplierName: entity.supplier_name,
        materialName: mainMaterial?.materialName || '未知物料', // Required by Supplier interface
        materialCode: mainMaterial?.materialCode || '', // Not directly available in supplier_entity
        category: entity.supplier_tier,
        tier: entity.supplier_tier,
        riskLevel: (performance?.risk_level as RiskLevel) || 'low',
        contactPerson: entity.contact_person,
        contactPhone: entity.contact_phone,
        contactEmail: entity.contact_email,
        location: `${entity.city}, ${entity.country}`,
        annualPurchaseAmount: performance ? parseFloat(performance.total_orders) : 0,
      };
    });

    // Sort by annual purchase amount descending
    const sorted = result.sort((a, b) => b.annualPurchaseAmount - a.annualPurchaseAmount);

    console.log('✅ Loaded suppliers for selector:', sorted.length);
    console.log('📊 Top 5 suppliers:', sorted.slice(0, 5).map(s => ({
      id: s.supplierId,
      name: s.supplierName,
      amount: (s.annualPurchaseAmount / 10000).toFixed(2) + '万'
    })));

    return sorted;
  } catch (error) {
    console.error('Failed to load suppliers from CSV:', error);
    // Fallback to empty array
    return [];
  }
};

/**
 * Get supplier comparison data for two-step confirmation workflow
 * 
 * @param materialCode Material code
 * @param currentSupplierId Current supplier ID
 * @param alternativeSupplierIds Optional specific alternatives to compare
 * @returns Supplier comparison data or null if not found
 */
export const getSupplierComparison = async (
  materialCode: string,
  currentSupplierId: string,
  alternativeSupplierIds?: string[]
): Promise<SupplierComparison | null> => {
  try {
    console.log('Loading supplier comparison for', materialCode, 'and', currentSupplierId);
    // Load required data
    const [supplierPerformances, materialEntities, supplierEntities] = await Promise.all([
      loadSupplierPerformanceScores(),
      loadMaterialEntities(),
      loadSupplierEntities()
    ]);

    console.log('Loaded data for comparison:', {
      supplierPerformances: supplierPerformances.length,
      materialEntities: materialEntities.length,
      supplierEntities: supplierEntities.length
    });

    // Get current supplier info
    const currentSupplierEntity = supplierEntities.find(s => s.supplier_id === currentSupplierId);
    const currentSupplierPerf = supplierPerformances.find(p => p.supplier_id === currentSupplierId);

    console.log('=== Supplier Comparison Debug ===');
    console.log('Looking for supplier:', currentSupplierId);
    console.log('Found supplier entity:', currentSupplierEntity);
    console.log('Found supplier performance:', currentSupplierPerf);

    if (!currentSupplierEntity) {
      console.error('Current supplier not found:', currentSupplierId);
      return null;
    }

    // Get material info
    const material = materialEntities.find(m => m.material_code === materialCode);
    if (!material) {
      console.error('Material not found:', materialCode);
      return null;
    }

    // Helper function to normalize risk level (supports both Chinese and English)
    const normalizeRiskLevel = (riskLevel: string | undefined): RiskLevel => {
      if (!riskLevel) return 'low';
      const normalized = riskLevel.toLowerCase().trim();

      // Handle Chinese risk levels
      if (normalized === '低') return 'low';
      if (normalized === '中') return 'medium';
      if (normalized === '高') return 'high';
      if (normalized === '严重') return 'critical';

      // Handle English risk levels
      if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'critical') {
        return normalized as RiskLevel;
      }

      console.warn('Invalid risk level:', riskLevel, 'defaulting to low');
      return 'low';
    };

    // Helper function to convert risk level to risk rating score (higher is riskier)
    const getRiskRatingFromLevel = (riskLevel: string): number => {
      const normalized = riskLevel.toLowerCase().trim();
      switch (normalized) {
        case '低':
        case 'low':
          return 20;
        case '中':
        case 'medium':
          return 50;
        case '高':
        case 'high':
          return 80;
        case '严重':
        case 'critical':
          return 95;
        default:
          return 50;
      }
    };

    // Helper function to derive response speed from performance data
    const getResponseSpeed = (supplierPerf: any): number => {
      // Response speed is derived from service_score in the CSV
      return supplierPerf ? parseFloat(supplierPerf.service_score || '85') : 85;
    };

    // Build scorecard for current supplier using real CSV data
    const currentScorecard: Supplier360Scorecard = {
      supplierId: currentSupplierId,
      supplierName: currentSupplierEntity.supplier_name,
      evaluationDate: currentSupplierPerf?.evaluation_date || new Date().toISOString().split('T')[0],
      overallScore: currentSupplierPerf ? parseFloat(currentSupplierPerf.overall_score) : 85,
      dimensions: {
        onTimeDeliveryRate: currentSupplierPerf ? parseFloat(currentSupplierPerf.otif_rate) : 90,
        qualityRating: currentSupplierPerf ? parseFloat(currentSupplierPerf.quality_score) : 85,
        riskRating: currentSupplierPerf ? getRiskRatingFromLevel(currentSupplierPerf.risk_level) : 20,
        onTimeDeliveryRate2: currentSupplierPerf ? parseFloat(currentSupplierPerf.delivery_score) : 90,
        annualPurchaseAmount: currentSupplierPerf ? parseFloat(currentSupplierPerf.total_orders) : 0,
        responseSpeed: currentSupplierPerf ? getResponseSpeed(currentSupplierPerf) : 85,
      },
      riskAssessment: {
        supplierId: currentSupplierId,
        assessmentDate: new Date().toISOString().split('T')[0],
        overallRiskLevel: normalizeRiskLevel(currentSupplierPerf?.risk_level || 'low'),
        financialStatus: {
          score: 85,
          lastUpdated: new Date().toISOString(),
        },
        publicSentiment: {
          score: 75,
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
          score: 20,
          source: 'auto',
          lastUpdated: new Date().toISOString(),
          risks: [],
        },
      },
    };

    console.log('Built scorecard for', currentSupplierEntity.supplier_name);
    console.log('- Overall Score:', currentScorecard.overallScore);
    console.log('- Annual Purchase Amount:', currentScorecard.dimensions.annualPurchaseAmount);
    console.log('- Quality Rating:', currentScorecard.dimensions.qualityRating);
    console.log('- OTIF Rate:', currentScorecard.dimensions.onTimeDeliveryRate);
    console.log('- Risk Level:', currentScorecard.riskAssessment.overallRiskLevel);

    // Get alternative suppliers
    let alternatives: AlternativeSupplier[];
    if (alternativeSupplierIds && alternativeSupplierIds.length > 0) {
      const allAlternatives = await getAlternativeSuppliers(materialCode);
      alternatives = allAlternatives.filter(alt => alternativeSupplierIds.includes(alt.supplierId));
    } else {
      alternatives = await getAlternativeSuppliers(materialCode);
    }

    console.log('Found alternatives for', materialCode, ':', alternatives.length);

    // Get affected orders (placeholder - would query actual orders)
    const affectedOrders = [
      {
        orderId: 'ORD-101',
        orderName: '订单-101',
        impact: 'minor' as const,
      },
    ];

    const result = {
      currentSupplier: {
        supplierId: currentSupplierId,
        supplierName: currentSupplierEntity.supplier_name,
        materialCode,
        materialName: material.material_name,
        scorecard: currentScorecard,
      },
      alternativeSuppliers: alternatives,
      affectedOrders,
    };

    console.log('Returning supplier comparison:', result);
    return result;
  } catch (error) {
    console.error('Failed to get supplier comparison:', error);
    return null;
  }
};

/**
 * Calculate similarity score between two suppliers
 * 
 * @param supplier1Id First supplier ID
 * @param supplier2Id Second supplier ID
 * @returns Similarity score (0-100)
 */
export const calculateSimilarityScore = (
  supplier1Id: string,
  supplier2Id: string
): number => {
  const scorecard1 = supplier360ScorecardsData.find(sc => sc.supplierId === supplier1Id);
  const scorecard2 = supplier360ScorecardsData.find(sc => sc.supplierId === supplier2Id);

  if (!scorecard1 || !scorecard2) return 0;

  // Calculate similarity based on dimension scores (6 dimensions)
  const dim1 = scorecard1.dimensions;
  const dim2 = scorecard2.dimensions;

  const deliveryDiff = Math.abs(dim1.onTimeDeliveryRate - dim2.onTimeDeliveryRate);
  const qualityDiff = Math.abs(dim1.qualityRating - dim2.qualityRating);
  const riskDiff = Math.abs(dim1.riskRating - dim2.riskRating);
  const delivery2Diff = Math.abs(dim1.onTimeDeliveryRate2 - dim2.onTimeDeliveryRate2);
  const responseDiff = Math.abs(dim1.responseSpeed - dim2.responseSpeed);

  // Average difference (lower = more similar)
  // Note: annualPurchaseAmount is excluded as it's a display metric
  const avgDiff = (deliveryDiff + qualityDiff + riskDiff + delivery2Diff + responseDiff) / 5;

  // Convert to similarity score (100 - avgDiff, clamped to 0-100)
  return Math.max(0, Math.min(100, 100 - avgDiff));
};

/**
 * Find similar suppliers for material sourcing queries
 * 
 * @param materialType Material type or code
 * @param referenceSupplierId Reference supplier ID for similarity comparison
 * @param limit Maximum number of results (default: 5)
 * @returns Array of similar suppliers with similarity scores
 */
export const findSimilarSuppliers = (
  materialType: string,
  referenceSupplierId: string,
  limit: number = 5
): AlternativeSupplier[] => {
  // Get reference supplier scorecard
  const referenceScorecard = supplier360ScorecardsData.find(
    sc => sc.supplierId === referenceSupplierId
  );

  if (!referenceScorecard) return [];

  // Find suppliers that supply this material type
  const materialSuppliers = mainMaterialSuppliersData.filter(
    mm => mm.materialName.toLowerCase().includes(materialType.toLowerCase()) ||
      mm.materialCode.toLowerCase().includes(materialType.toLowerCase())
  );

  // Calculate similarity scores and build alternatives
  const alternatives: AlternativeSupplier[] = materialSuppliers
    .filter(mm => mm.supplierId !== referenceSupplierId)
    .map(mm => {
      const similarityScore = calculateSimilarityScore(referenceSupplierId, mm.supplierId);
      const altScorecard = supplier360ScorecardsData.find(sc => sc.supplierId === mm.supplierId);

      return {
        supplierId: mm.supplierId,
        supplierName: mm.supplierName,
        materialCode: mm.materialCode,
        similarityScore,
        recommendationReason: `产品线匹配，相似度${similarityScore}%`,
        comparison: altScorecard ? {
          onTimeDeliveryRate: altScorecard.dimensions.onTimeDeliveryRate,
          quality: altScorecard.dimensions.qualityRating,
          price: 0, // Price dimension removed in 6-dimension structure
          responseSpeed: altScorecard.dimensions.responseSpeed,
          riskLevel: altScorecard.riskAssessment.overallRiskLevel,
        } : {
          onTimeDeliveryRate: 0,
          quality: 0,
          price: 0,
          responseSpeed: 0,
          riskLevel: 'medium' as const,
        },
        availability: true,
      };
    })
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, limit);

  return alternatives;
};

/**
 * Get supplier comparison with mode support
 * 
 * @param materialCode Material code
 * @param currentSupplierId Current supplier ID
 * @param mode Data mode 'mock' or 'api'
 * @param alternativeSupplierIds Optional specific alternatives to compare
 */
export const getSupplierComparisonWithMode = async (
  materialCode: string,
  currentSupplierId: string,
  mode: 'mock' | 'api',
  alternativeSupplierIds?: string[]
): Promise<SupplierComparison | null> => {
  // Always use API Mode (Brain Mode), ignoring mock parameter
  // if (mode === 'mock') { ... }

  // API Mode (Brain Mode)
  try {
    console.log('[HD Comparison] Loading for', materialCode, currentSupplierId);

    // 1. Get Current Supplier Scorecard
    const currentScorecard = await loadHDSupplierScorecard(currentSupplierId);
    if (!currentScorecard) {
      console.warn('[HD Comparison] Current supplier scorecard not found');
      return null;
    }

    // 2. Get Alternatives
    let alternatives = await getHDAlternativeSuppliers(materialCode);
    if (alternativeSupplierIds && alternativeSupplierIds.length > 0) {
      alternatives = alternatives.filter(alt => alternativeSupplierIds.includes(alt.supplierId));
    }

    // 3. Mock Affected Orders (Pending Real Data) - Placeholder
    const affectedOrders = [
      {
        orderId: 'ORD-HD-001',
        orderName: '订单-北斗车载智能终端-001',
        impact: 'minor' as const,
      }
    ];

    // Calculate potential savings (placeholder logic)
    // Find max quality alternative
    const maxQualityAlt = alternatives.length > 0
      ? alternatives.reduce((prev, current) => (prev.comparison.quality > current.comparison.quality) ? prev : current)
      : null;

    const qualityDelta = maxQualityAlt
      ? maxQualityAlt.comparison.quality - currentScorecard.dimensions.qualityRating
      : 0;

    return {
      currentSupplier: {
        supplierId: currentSupplierId,
        supplierName: currentScorecard.supplierName,
        materialCode,
        materialName: '物料 ' + materialCode, // TODO: Get real material name
        scorecard: currentScorecard,
      },
      alternativeSuppliers: alternatives,
      affectedOrders,
    };

  } catch (error) {
    console.error('[HD Comparison] Failed:', error);
    return null;
  }
};

