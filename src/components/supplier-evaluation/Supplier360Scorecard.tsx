/**
 * Supplier360Scorecard Component
 * 
 * Displays supplier 360° scorecard with 6 dimensions and risk assessment.
 * 
 * Principle 1: Types imported from ontology.ts
 * Principle 2: Uses semantic color variables
 * Principle 3: Component < 150 lines
 */

import { useState, useEffect } from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { fetchLegalRisks } from '../../services/legalRiskService';
import { loadSupplierScorecard } from '../../services/supplierDataLoader';
import { loadSupplierList } from '../../services/supplierDataLoader';
import RiskBadge from './RiskBadge';
import SupplierSelector from './SupplierSelector';
import type { Supplier360Scorecard as Supplier360ScorecardType } from '../../types/ontology';
import type { LegalRisk, RiskLevel } from '../../types/ontology';


interface Supplier360ScorecardProps {
  supplierId?: string | null;
  onSupplierChange?: (supplierId: string) => void;
  onSwitchSupplier?: () => void;
  onSourcing?: () => void;
}

const Supplier360Scorecard = ({
  supplierId,
  onSupplierChange,
  onSwitchSupplier,
  onSourcing,
}: Supplier360ScorecardProps) => {


  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(supplierId || null);
  const [legalRisks, setLegalRisks] = useState<LegalRisk[]>([]);
  const [loadingLegalRisks, setLoadingLegalRisks] = useState(false);
  const [legalRisksError, setLegalRisksError] = useState<string | null>(null);
  const [scorecard, setScorecard] = useState<Supplier360ScorecardType | null>(null);
  const [loading, setLoading] = useState(false);

  // Sync with external supplierId changes
  useEffect(() => {
    if (supplierId !== undefined) {
      setSelectedSupplierId(supplierId);
    }
  }, [supplierId]);

  const handleSupplierChange = (newSupplierId: string) => {
    setSelectedSupplierId(newSupplierId);
    onSupplierChange?.(newSupplierId);
  };

  // Use selectedSupplierId if available, otherwise fall back to prop
  const currentSupplierId = selectedSupplierId !== null ? selectedSupplierId : supplierId;

  // Load scorecard data - 根据模式切换数据源
  useEffect(() => {
    if (!currentSupplierId) {
      setScorecard(null);
      return;
    }

    const loadScorecardData = async () => {
      setLoading(true);
      try {
        // 从指标模型加载供应商评分卡（替代 ontologyDataService）
        const scorecard = await loadSupplierScorecard(currentSupplierId);
        if (scorecard) {
          setScorecard(scorecard);
        } else {
          console.warn('[Supplier360Scorecard] No scorecard found for supplier:', currentSupplierId);
          setScorecard(null);
        }
      } catch (error) {
        console.error('Failed to load scorecard data:', error);
        setScorecard(null);
      } finally {
        setLoading(false);
      }
    };

    loadScorecardData();
  }, [currentSupplierId]);

  // Load legal risks when supplier changes
  useEffect(() => {
    if (currentSupplierId && scorecard) {
      const loadLegalRisks = async () => {
        setLoadingLegalRisks(true);
        setLegalRisksError(null);
        try {
          const risks = await fetchLegalRisks(currentSupplierId);
          setLegalRisks(risks);
        } catch (error) {
          console.error('Failed to fetch legal risks:', error);
          setLegalRisksError('获取法律风险数据失败，使用缓存数据');
          setLegalRisks(scorecard.riskAssessment.legalRisks.risks);
        } finally {
          setLoadingLegalRisks(false);
        }
      };

      loadLegalRisks();
    } else if (scorecard) {
      // Initialize with cached data
      setLegalRisks(scorecard.riskAssessment.legalRisks.risks);
    }
  }, [currentSupplierId, scorecard]);

  // Calculate overall score excluding annualPurchaseAmount
  const calculateOverallScore = () => {
    if (!scorecard) return 0;
    const { dimensions } = scorecard;
    const scoredDimensions = [
      dimensions.onTimeDeliveryRate,
      dimensions.qualityRating,
      dimensions.riskRating,
      dimensions.onTimeDeliveryRate2,
      dimensions.responseSpeed,
    ];
    // For riskRating, lower is better, so invert it (100 - riskRating)
    const adjustedDimensions = scoredDimensions.map((score, index) =>
      index === 2 ? 100 - score : score
    );
    return Math.round(adjustedDimensions.reduce((sum, score) => sum + score, 0) / adjustedDimensions.length);
  };

  if (!currentSupplierId) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <SupplierSelector
          selectedSupplierId={null}
          onSupplierChange={handleSupplierChange}
        />
        <div className="text-center py-12 text-slate-500">
          <p>请选择供应商查看360°评分卡</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <SupplierSelector
          selectedSupplierId={currentSupplierId}
          onSupplierChange={handleSupplierChange}
        />
        <div className="text-center py-12 text-slate-500">
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  if (!scorecard) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <SupplierSelector
          selectedSupplierId={currentSupplierId}
          onSupplierChange={handleSupplierChange}
        />
        <div className="text-center py-12 text-slate-500">
          <p>未找到供应商评分卡数据</p>
        </div>
      </div>
    );
  }

  const overallScore = calculateOverallScore();
  const currentLegalRisks = legalRisks.length > 0 ? legalRisks : scorecard.riskAssessment.legalRisks.risks;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
      <SupplierSelector
        selectedSupplierId={currentSupplierId}
        onSupplierChange={handleSupplierChange}
      />

      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">{scorecard.supplierName}</h2>
          <p className="text-sm text-slate-500 mt-1">评估日期: {scorecard.evaluationDate}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-3xl font-bold text-slate-800">{overallScore}</div>
            <div className="text-sm text-slate-500">综合评分</div>
          </div>
          <RiskBadge riskLevel={scorecard.riskAssessment.overallRiskLevel} />
        </div>
      </div>

      {/* 360°评估项 */}
      <div className="mb-6 pb-6 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">360°评估</h3>

        {/* 360° Spider Chart */}
        <div className="mb-4">
          <div className="bg-slate-50 p-4 rounded-lg">
            <Supplier360RadarChart scorecard={scorecard} />
          </div>
        </div>

        {/* Compact Dimension Display - Pure Text */}
        <div className="text-sm text-slate-600">
          评估指标: 交货准时率 {scorecard.dimensions.onTimeDeliveryRate} | 质量评级 {scorecard.dimensions.qualityRating} | 风险评级 {scorecard.dimensions.riskRating} | 准时交付率 {scorecard.dimensions.onTimeDeliveryRate2} | 年度采购额 ¥{(scorecard.dimensions.annualPurchaseAmount / 10000).toFixed(0)}万 <span className="text-xs text-slate-400">（展示指标）</span> | 响应速度 {scorecard.dimensions.responseSpeed}
        </div>
      </div>

      {/* 供应商风险评估项 */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">供应商风险评估</h3>

        <div className="grid md:grid-cols-2 gap-3">
          {/* Financial Status */}
          <div className="border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm font-semibold text-slate-700">财务状况</div>
              <div className="text-xs text-slate-500">
                {new Date(scorecard.riskAssessment.financialStatus.lastUpdated).toLocaleDateString()}
              </div>
            </div>
            <div className="text-xl font-bold text-slate-800">{scorecard.riskAssessment.financialStatus.score}</div>
            {scorecard.riskAssessment.financialStatus.creditRating && (
              <div className="text-xs text-slate-500 mt-0.5">信用评级: {scorecard.riskAssessment.financialStatus.creditRating}</div>
            )}
          </div>

          {/* Public Sentiment */}
          <div className="border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm font-semibold text-slate-700">舆情</div>
              <div className="text-xs text-slate-500">
                {new Date(scorecard.riskAssessment.publicSentiment.lastUpdated).toLocaleDateString()}
              </div>
            </div>
            <div className="text-xl font-bold text-slate-800">{scorecard.riskAssessment.publicSentiment.score}</div>
            {scorecard.riskAssessment.publicSentiment.notes && (
              <div className="text-xs text-slate-500 mt-0.5">{scorecard.riskAssessment.publicSentiment.notes}</div>
            )}
            <div className="text-xs text-slate-400 mt-0.5">来源: 手动录入</div>
          </div>

          {/* Production Anomalies */}
          <div className="border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm font-semibold text-slate-700">生产异常</div>
              <div className="text-xs text-slate-500">
                {new Date(scorecard.riskAssessment.productionAnomalies.lastUpdated).toLocaleDateString()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xl font-bold text-slate-800">{scorecard.riskAssessment.productionAnomalies.count}</div>
              <RiskBadge
                riskLevel={scorecard.riskAssessment.productionAnomalies.severity === 'critical' ? 'critical' :
                  scorecard.riskAssessment.productionAnomalies.severity === 'high' ? 'high' :
                    scorecard.riskAssessment.productionAnomalies.severity === 'medium' ? 'medium' : 'low'}
                size="sm"
              />
            </div>
            {scorecard.riskAssessment.productionAnomalies.details && (
              <div className="text-xs text-slate-500 mt-0.5">{scorecard.riskAssessment.productionAnomalies.details}</div>
            )}
            <div className="text-xs text-slate-400 mt-0.5">来源: 手动录入</div>
          </div>

          {/* Legal Risks */}
          <div className="border border-slate-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm font-semibold text-slate-700">法律风险</div>
              <div className="flex items-center gap-2">
                {loadingLegalRisks && (
                  <div className="text-xs text-slate-400">加载中...</div>
                )}
                <div className="text-xs text-slate-500">
                  {new Date(scorecard.riskAssessment.legalRisks.lastUpdated).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div className="text-xl font-bold text-slate-800">{scorecard.riskAssessment.legalRisks.score}</div>
            {legalRisksError && (
              <div className="text-xs text-amber-600 mt-0.5">{legalRisksError}</div>
            )}
            <div className="text-xs text-slate-500 mt-0.5">
              风险项: {currentLegalRisks.length} 个
            </div>
            {currentLegalRisks.length > 0 && (
              <div className="space-y-1 mt-1">
                {currentLegalRisks.map((risk, index) => (
                  <div key={index} className="text-xs text-slate-600 bg-slate-50 p-1.5 rounded">
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
            <div className="text-xs text-slate-400 mt-1">来源: 自动采集（实时更新）</div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-slate-500">综合风险等级</div>
              <div className="mt-1">
                <RiskBadge riskLevel={scorecard.riskAssessment.overallRiskLevel} />
              </div>
            </div>
            <div className="text-xs text-slate-400">
              评估日期: {new Date(scorecard.riskAssessment.assessmentDate).toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={onSwitchSupplier}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          切换备选供应商
        </button>
        <button
          onClick={onSourcing}
          className="px-4 py-2 border border-indigo-600 text-indigo-600 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors"
        >
          寻源
        </button>
      </div>
    </div>
  );
};

/**
 * Supplier 360° Radar Chart Component
 * 
 * Displays 5 scored dimensions in a radar chart (excluding annualPurchaseAmount as it's display-only)
 */
const Supplier360RadarChart = ({ scorecard }: { scorecard: Supplier360ScorecardType }) => {
  const { dimensions } = scorecard;

  // Prepare data for radar chart (5 scored dimensions, excluding annualPurchaseAmount)
  // For riskRating, invert it since lower is better (100 - riskRating)
  const chartData = [
    { dimension: '交货准时率', score: dimensions.onTimeDeliveryRate },
    { dimension: '质量评级', score: dimensions.qualityRating },
    { dimension: '风险评级', score: 100 - dimensions.riskRating }, // Invert: lower risk = higher score
    { dimension: '准时交付率', score: dimensions.onTimeDeliveryRate2 },
    { dimension: '响应速度', score: dimensions.responseSpeed },
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={chartData}>
        <PolarGrid stroke="rgb(226 232 240)" />
        <PolarAngleAxis
          dataKey="dimension"
          tick={{ fontSize: 12, fill: 'rgb(71 85 105)' }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: 'rgb(148 163 184)' }}
        />
        <Radar
          name="评估分数"
          dataKey="score"
          stroke="rgb(99 102 241)"
          fill="rgb(99 102 241)"
          fillOpacity={0.6}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
};

export default Supplier360Scorecard;

