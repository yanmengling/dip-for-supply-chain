/**
 * Legal Risk Service
 * 
 * Handles real-time external API calls for legal risk data.
 * 
 * Principle 1: All types imported from ontology.ts
 */

import type { LegalRisk } from '../types/ontology';

/**
 * Fetch legal risks for a supplier from external API
 * 
 * @param supplierId Supplier ID
 * @returns Promise resolving to array of legal risks
 */
export const fetchLegalRisks = async (supplierId: string): Promise<LegalRisk[]> => {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Mock API response - in real implementation, would call external API
  // For now, return mock data based on supplierId
  const mockRisks: LegalRisk[] = [];
  
  // Simulate different risk scenarios based on supplier ID
  if (supplierId === 'SUP-001') {
    mockRisks.push({
      type: 'major_pledge',
      description: '公司股权质押，质押比例30%',
      severity: 'medium',
      date: new Date().toISOString().split('T')[0],
      source: '企业信用信息公示系统',
    });
  } else if (supplierId === 'SUP-002') {
    mockRisks.push({
      type: 'legal_restriction',
      description: '法人代表被限制高消费',
      severity: 'high',
      date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      source: '法院执行信息网',
    });
  }
  
  // In real implementation, would make actual API call:
  // const response = await fetch(`https://api.legal-risk-service.com/suppliers/${supplierId}/risks`);
  // const data = await response.json();
  // return data.risks;
  
  return mockRisks;
};



