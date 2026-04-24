/**
 * RiskAssessmentSection Component
 * 
 * Displays comprehensive risk assessment details with real-time API calls for legal risks.
 * 
 * Principle 1: Types imported from ontology.ts
 * Principle 2: Uses semantic color variables
 * Principle 3: Component < 150 lines
 */

import { useState, useEffect } from 'react';
import type { RiskAssessment, LegalRisk } from '../../types/ontology';
import { fetchLegalRisks } from '../../services/legalRiskService';
import RiskBadge from './RiskBadge';

interface RiskAssessmentSectionProps {
  riskAssessment: RiskAssessment;
  supplierId?: string;
}

const RiskAssessmentSection = ({ riskAssessment, supplierId }: RiskAssessmentSectionProps) => {
  const [legalRisks, setLegalRisks] = useState<LegalRisk[]>(riskAssessment.legalRisks.risks);
  const [loadingLegalRisks, setLoadingLegalRisks] = useState(false);
  const [legalRisksError, setLegalRisksError] = useState<string | null>(null);

  useEffect(() => {
    if (supplierId) {
      const loadLegalRisks = async () => {
        setLoadingLegalRisks(true);
        setLegalRisksError(null);
        try {
          const risks = await fetchLegalRisks(supplierId);
          setLegalRisks(risks);
        } catch (error) {
          console.error('Failed to fetch legal risks:', error);
          setLegalRisksError('获取法律风险数据失败，使用缓存数据');
          // Fallback to cached data if available
          setLegalRisks(riskAssessment.legalRisks.risks);
        } finally {
          setLoadingLegalRisks(false);
        }
      };

      loadLegalRisks();
    }
  }, [supplierId, riskAssessment.legalRisks.risks]);

  const currentLegalRisks = legalRisks.length > 0 ? legalRisks : riskAssessment.legalRisks.risks;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
      <h3 className="text-xl font-bold text-slate-800 mb-4">供应商风险评估</h3>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Financial Status */}
        <div className="border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-slate-700">财务状况</div>
            <div className="text-xs text-slate-500">
              {new Date(riskAssessment.financialStatus.lastUpdated).toLocaleDateString()}
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800 mb-1">{riskAssessment.financialStatus.score}</div>
          {riskAssessment.financialStatus.creditRating && (
            <div className="text-xs text-slate-500">信用评级: {riskAssessment.financialStatus.creditRating}</div>
          )}
        </div>

        {/* Public Sentiment */}
        <div className="border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-slate-700">舆情</div>
            <div className="text-xs text-slate-500">
              {new Date(riskAssessment.publicSentiment.lastUpdated).toLocaleDateString()}
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800 mb-1">{riskAssessment.publicSentiment.score}</div>
          {riskAssessment.publicSentiment.notes && (
            <div className="text-xs text-slate-500 mt-1">{riskAssessment.publicSentiment.notes}</div>
          )}
          <div className="text-xs text-slate-400 mt-1">来源: 手动录入</div>
        </div>

        {/* Production Anomalies */}
        <div className="border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-slate-700">生产异常</div>
            <div className="text-xs text-slate-500">
              {new Date(riskAssessment.productionAnomalies.lastUpdated).toLocaleDateString()}
            </div>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <div className="text-2xl font-bold text-slate-800">{riskAssessment.productionAnomalies.count}</div>
            <RiskBadge 
              riskLevel={riskAssessment.productionAnomalies.severity === 'critical' ? 'critical' :
                        riskAssessment.productionAnomalies.severity === 'high' ? 'high' :
                        riskAssessment.productionAnomalies.severity === 'medium' ? 'medium' : 'low'}
              size="sm"
            />
          </div>
          {riskAssessment.productionAnomalies.details && (
            <div className="text-xs text-slate-500 mt-1">{riskAssessment.productionAnomalies.details}</div>
          )}
          <div className="text-xs text-slate-400 mt-1">来源: 手动录入</div>
        </div>

        {/* Legal Risks */}
        <div className="border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-slate-700">法律风险</div>
            <div className="flex items-center gap-2">
              {loadingLegalRisks && (
                <div className="text-xs text-slate-400">加载中...</div>
              )}
              <div className="text-xs text-slate-500">
                {new Date(riskAssessment.legalRisks.lastUpdated).toLocaleDateString()}
              </div>
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800 mb-1">{riskAssessment.legalRisks.score}</div>
          {legalRisksError && (
            <div className="text-xs text-amber-600 mb-2">{legalRisksError}</div>
          )}
          <div className="text-xs text-slate-500 mb-2">
            风险项: {currentLegalRisks.length} 个
          </div>
          {currentLegalRisks.length > 0 && (
            <div className="space-y-1">
              {currentLegalRisks.map((risk, index) => (
                <div key={index} className="text-xs text-slate-600 bg-slate-50 p-2 rounded">
                  <div className="font-semibold">{risk.description}</div>
                  <div className="text-slate-400 mt-0.5">
                    {risk.type === 'major_pledge' ? '重大质押' :
                     risk.type === 'legal_restriction' ? '法律限制' :
                     risk.type === 'lawsuit' ? '诉讼' : '其他'} · {risk.date}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="text-xs text-slate-400 mt-2">来源: 自动采集（实时更新）</div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-500">综合风险等级</div>
            <div className="mt-1">
              <RiskBadge riskLevel={riskAssessment.overallRiskLevel} />
            </div>
          </div>
          <div className="text-xs text-slate-400">
            评估日期: {new Date(riskAssessment.assessmentDate).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskAssessmentSection;

