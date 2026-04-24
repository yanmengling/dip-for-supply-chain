/**
 * Evaluation Service
 * 
 * Handles evaluation score calculation, risk level determination, and automatic dimension calculation.
 * 
 * Principle 1: All types imported from ontology.ts
 */

import type {
  SupplierEvaluation,
  EvaluationDimension,
  RiskLevel,
  EvaluationHistory
} from '../types/ontology';
import { ordersData } from '../utils/entityConfigService';

/**
 * Calculate weighted average total score from evaluation dimensions
 * 
 * @param dimensions Array of evaluation dimensions with scores and weights
 * @returns Total score (0-100)
 */
export const calculateTotalScore = (dimensions: EvaluationDimension[]): number => {
  if (dimensions.length === 0) return 0;

  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  if (totalWeight === 0) return 0;

  const weightedSum = dimensions.reduce((sum, d) => sum + (d.score * d.weight), 0);
  return Math.round((weightedSum / totalWeight) * 100) / 100;
};

/**
 * Calculate risk level based on total score
 * 
 * @param totalScore Total evaluation score (0-100)
 * @returns Risk level classification
 */
export const calculateRiskLevel = (totalScore: number): RiskLevel => {
  if (totalScore >= 80) return 'low';
  if (totalScore >= 60) return 'medium';
  if (totalScore >= 40) return 'high';
  return 'critical';
};

/**
 * Calculate automatic dimensions from existing system data
 * 
 * Currently implements placeholder logic. Future: integrate with actual order/material data.
 * 
 * @param supplierId Supplier ID to calculate dimensions for
 * @returns Array of automatically calculated dimensions
 */
export const calculateAutoDimensions = (_supplierId: string): EvaluationDimension[] => {
  // Placeholder implementation - calculate delivery on-time rate from orders
  // In real implementation, map order to supplier through product -> material -> supplier
  // For now, use placeholder logic
  const _supplierOrders = ordersData.filter(_order => {
    // Placeholder logic
    return true; // Placeholder
  });

  // Calculate delivery on-time rate (placeholder)
  const onTimeRate = _supplierOrders.length > 0 ? 0.88 : 0.85; // Placeholder: 88% on-time
  const deliveryScore = Math.round(onTimeRate * 100);

  // Placeholder calculations for price and financial
  const priceScore = 75; // Placeholder
  const financialScore = 80; // Placeholder

  const defaultWeight = 1 / 7;

  return [
    {
      dimensionName: 'delivery',
      score: deliveryScore,
      weight: defaultWeight,
      source: 'auto',
      calculatedAt: new Date().toISOString(),
    },
    {
      dimensionName: 'price',
      score: priceScore,
      weight: defaultWeight,
      source: 'auto',
      calculatedAt: new Date().toISOString(),
    },
    {
      dimensionName: 'financial',
      score: financialScore,
      weight: defaultWeight,
      source: 'auto',
      calculatedAt: new Date().toISOString(),
    },
  ];
};

/**
 * Get evaluation history for a supplier
 * 
 * @param supplierId Supplier ID
 * @param evaluations Array of all evaluations
 * @returns Evaluation history with trend analysis
 */
export const getEvaluationHistory = (
  supplierId: string,
  evaluations: SupplierEvaluation[]
): EvaluationHistory | null => {
  const supplierEvaluations = evaluations
    .filter(evaluation => evaluation.supplierId === supplierId)
    .sort((a, b) => new Date(b.evaluationDate).getTime() - new Date(a.evaluationDate).getTime());

  if (supplierEvaluations.length === 0) return null;

  const trend = supplierEvaluations.length > 1
    ? {
      score: supplierEvaluations[0].totalScore > supplierEvaluations[1].totalScore ? 1
        : supplierEvaluations[0].totalScore < supplierEvaluations[1].totalScore ? -1
          : 0,
      change: supplierEvaluations[0].totalScore - supplierEvaluations[1].totalScore,
      period: 'month',
    }
    : {
      score: 0,
      change: 0,
      period: 'month',
    };

  return {
    supplierId,
    evaluations: supplierEvaluations,
    trend,
  };
};

/**
 * Create a complete evaluation with calculated total score and risk level
 * 
 * @param partialEvaluation Partial evaluation data (without totalScore and riskLevel)
 * @returns Complete evaluation with calculated fields
 */
export const createCompleteEvaluation = (
  partialEvaluation: Omit<SupplierEvaluation, 'totalScore' | 'riskLevel'>
): SupplierEvaluation => {
  const totalScore = calculateTotalScore(partialEvaluation.dimensions);
  const riskLevel = calculateRiskLevel(totalScore);

  return {
    ...partialEvaluation,
    totalScore,
    riskLevel,
  };
};

