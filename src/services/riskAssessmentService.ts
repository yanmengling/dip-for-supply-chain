/**
 * Risk Assessment Service
 * 
 * Handles risk assessment data acquisition (hybrid: auto for legal risks, manual for others).
 * 
 * Principle 1: All types imported from ontology.ts
 */

import type { RiskAssessment, LegalRisk } from '../types/ontology';
import { supplier360ScorecardsData } from '../utils/entityConfigService';

/**
 * Get risk assessment for a supplier
 * 
 * @param supplierId Supplier ID
 * @returns Risk assessment or null if not found
 */
export const getRiskAssessment = (supplierId: string): RiskAssessment | null => {
  const scorecard = supplier360ScorecardsData.find(sc => sc.supplierId === supplierId);
  return scorecard ? scorecard.riskAssessment : null;
};

/**
 * Update manual risk data (production anomalies and public sentiment)
 * 
 * @param supplierId Supplier ID
 * @param updates Partial risk assessment data for manual fields
 * @returns Updated risk assessment or null if supplier not found
 */
export const updateManualRiskData = (
  supplierId: string,
  updates: {
    publicSentiment?: {
      score: number;
      notes?: string;
    };
    productionAnomalies?: {
      count: number;
      severity: 'low' | 'medium' | 'high' | 'critical';
      details?: string;
    };
  }
): RiskAssessment | null => {
  const existing = getRiskAssessment(supplierId);
  if (!existing) return null;

  const now = new Date().toISOString();

  // Update public sentiment if provided
  if (updates.publicSentiment) {
    existing.publicSentiment = {
      ...existing.publicSentiment,
      score: updates.publicSentiment.score,
      notes: updates.publicSentiment.notes,
      lastUpdated: now,
    };
  }

  // Update production anomalies if provided
  if (updates.productionAnomalies) {
    existing.productionAnomalies = {
      ...existing.productionAnomalies,
      count: updates.productionAnomalies.count,
      severity: updates.productionAnomalies.severity,
      details: updates.productionAnomalies.details,
      lastUpdated: now,
    };
  }

  // Recalculate overall risk level
  existing.overallRiskLevel = calculateOverallRiskLevel(existing);

  return existing;
};

/**
 * Fetch legal risks from external data source (auto acquisition)
 * 
 * @param supplierId Supplier ID
 * @returns Array of legal risks or empty array
 */
export const fetchLegalRisks = async (supplierId: string): Promise<LegalRisk[]> => {
  // Placeholder implementation - would call external API in production
  // For now, return empty array or mock data

  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 100));

  // Mock legal risks data
  return [
    // Example: No legal risks found
  ];
};

/**
 * Calculate overall risk level from risk assessment components
 * 
 * @param assessment Risk assessment
 * @returns Overall risk level
 */
const calculateOverallRiskLevel = (assessment: RiskAssessment): 'low' | 'medium' | 'high' | 'critical' => {
  // Calculate weighted risk score
  const financialRisk = 100 - assessment.financialStatus.score; // Invert (higher score = lower risk)
  const sentimentRisk = 100 - assessment.publicSentiment.score; // Invert
  const anomalyRisk = assessment.productionAnomalies.severity === 'critical' ? 100 :
    assessment.productionAnomalies.severity === 'high' ? 75 :
      assessment.productionAnomalies.severity === 'medium' ? 50 : 25;
  const legalRisk = assessment.legalRisks.score;

  // Weighted average (can be adjusted)
  const overallRiskScore = (
    financialRisk * 0.3 +
    sentimentRisk * 0.2 +
    anomalyRisk * 0.3 +
    legalRisk * 0.2
  );

  // Convert to risk level
  if (overallRiskScore >= 75) return 'critical';
  if (overallRiskScore >= 50) return 'high';
  if (overallRiskScore >= 25) return 'medium';
  return 'low';
};

/**
 * Refresh legal risks for a supplier (auto update)
 * 
 * @param supplierId Supplier ID
 * @returns Updated risk assessment or null if supplier not found
 */
export const refreshLegalRisks = async (_supplierId: string): Promise<RiskAssessment | null> => {
  const existing = getRiskAssessment(_supplierId);
  if (!existing) return null;

  // Fetch latest legal risks
  const legalRisks = await fetchLegalRisks(_supplierId);

  // Calculate legal risk score based on risks
  const legalRiskScore = legalRisks.length === 0 ? 0 :
    legalRisks.reduce((max, risk) => {
      const riskScore = risk.severity === 'critical' ? 100 :
        risk.severity === 'high' ? 75 :
          risk.severity === 'medium' ? 50 : 25;
      return Math.max(max, riskScore);
    }, 0);

  // Update legal risks
  existing.legalRisks = {
    score: legalRiskScore,
    source: 'auto',
    lastUpdated: new Date().toISOString(),
    risks: legalRisks,
  };

  // Recalculate overall risk level
  existing.overallRiskLevel = calculateOverallRiskLevel(existing);

  return existing;
};

