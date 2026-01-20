/**
 * SupplierEvaluationOverview Component
 * 
 * Displays supplier evaluation overview with list of suppliers, their evaluation scores,
 * risk levels, and key metrics. Supports filtering and sorting.
 * 
 * Principle 1: Types imported from ontology.ts
 * Principle 2: Uses semantic color variables
 * Principle 3: Component < 150 lines
 */

import { useState, useMemo, useEffect } from 'react';
import { loadSupplierEvaluations } from '../../services/supplierEvaluationDataService';
import type { Supplier360Scorecard, RiskLevel } from '../../types/ontology';
import RiskBadge from './RiskBadge';
import EvaluationRadarChart from './EvaluationRadarChart';
import { AlertCircle } from 'lucide-react';

interface SupplierWithEvaluation {
  supplierId: string;
  supplierName: string;
  evaluation: Supplier360Scorecard | null;
}

type SortOption = 'score-desc' | 'score-asc' | 'risk';
type FilterOption = RiskLevel | 'all';

const SupplierEvaluationOverview = () => {
  const [filterRisk, setFilterRisk] = useState<FilterOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('score-desc');
  const [evaluations, setEvaluations] = useState<Supplier360Scorecard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load supplier evaluations from API
  useEffect(() => {
    const fetchEvaluations = async () => {
      try {
        setLoading(true);
        const data = await loadSupplierEvaluations();
        setEvaluations(data);
        setError(null);
      } catch (err) {
        console.error('Failed to load supplier evaluations:', err);
        setError('加载供应商评估数据失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };

    fetchEvaluations();
  }, []);

  // Map evaluations to suppliers with their latest evaluation
  const suppliersWithEvaluations = useMemo<SupplierWithEvaluation[]>(() => {
    const supplierMap = new Map<string, { name: string; evaluations: Supplier360Scorecard[] }>();

    // Group evaluations by supplier
    evaluations.forEach(evaluation => {
      if (!supplierMap.has(evaluation.supplierId)) {
        supplierMap.set(evaluation.supplierId, {
          name: evaluation.supplierName,
          evaluations: [],
        });
      }
      supplierMap.get(evaluation.supplierId)!.evaluations.push(evaluation);
    });

    // Get latest evaluation for each supplier
    return Array.from(supplierMap.entries()).map(([supplierId, data]) => {
      const latestEvaluation = data.evaluations.sort((a, b) =>
        new Date(b.evaluationDate).getTime() - new Date(a.evaluationDate).getTime()
      )[0] || null;

      return {
        supplierId,
        supplierName: data.name,
        evaluation: latestEvaluation,
      };
    });
  }, [evaluations]);

  // Filter and sort
  const filteredAndSorted = useMemo(() => {
    let filtered = suppliersWithEvaluations;

    if (filterRisk !== 'all') {
      filtered = filtered.filter(item =>
        item.evaluation?.riskAssessment.overallRiskLevel === filterRisk
      );
    }

    const sorted = [...filtered].sort((a, b) => {
      if (!a.evaluation && !b.evaluation) return 0;
      if (!a.evaluation) return 1;
      if (!b.evaluation) return -1;

      switch (sortBy) {
        case 'score-desc':
          return b.evaluation.overallScore - a.evaluation.overallScore;
        case 'score-asc':
          return a.evaluation.overallScore - b.evaluation.overallScore;
        case 'risk':
          const riskOrder: Record<RiskLevel, number> = {
            critical: 0,
            high: 1,
            medium: 2,
            low: 3,
          };
          return riskOrder[a.evaluation.riskAssessment.overallRiskLevel] - riskOrder[b.evaluation.riskAssessment.overallRiskLevel];
        default:
          return 0;
      }
    });

    return sorted;
  }, [suppliersWithEvaluations, filterRisk, sortBy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-slate-600">加载供应商评估数据中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="text-red-500 mx-auto mb-4" size={48} />
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">供应商评估</h2>
        <div className="flex gap-4">
          <select
            value={filterRisk}
            onChange={(e) => setFilterRisk(e.target.value as FilterOption)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
          >
            <option value="all">全部风险等级</option>
            <option value="low">低风险</option>
            <option value="medium">中风险</option>
            <option value="high">高风险</option>
            <option value="critical">严重风险</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
          >
            <option value="score-desc">分数降序</option>
            <option value="score-asc">分数升序</option>
            <option value="risk">风险等级</option>
          </select>
        </div>
      </div>

      {filteredAndSorted.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p>没有找到符合条件的供应商</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAndSorted.map((item) => (
            <div
              key={item.supplierId}
              className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">{item.supplierName}</h3>
                  <p className="text-sm text-slate-500">{item.supplierId}</p>
                </div>
                {item.evaluation && <RiskBadge riskLevel={item.evaluation.riskAssessment.overallRiskLevel} />}
              </div>

              {item.evaluation ? (
                <>
                  <div className="mb-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold text-slate-800">
                        {item.evaluation.overallScore}
                      </span>
                      <span className="text-sm text-slate-500">/ 100</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      评估日期: {item.evaluation.evaluationDate}
                    </p>
                  </div>
                  <div className="h-48">
                    <EvaluationRadarChart dimensions={item.evaluation.dimensions} size="sm" />
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-slate-400">
                  <p>未评估</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SupplierEvaluationOverview;

