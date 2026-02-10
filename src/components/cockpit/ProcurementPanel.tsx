/**
 * Procurement Panel
 * 
 * Displays procurement summary including monthly planned, purchased, in-transit quantities,
 * top 5 materials by planned quantity, and optimization recommendations.
 * 
 * Fetches data dynamically via ProcurementService.
 */

import { useState, useEffect, useMemo } from 'react';
import { ShoppingCart, TrendingUp, Loader2 } from 'lucide-react';
import { procurementService } from '../../services/procurementService';
import type { ProcurementSummary } from '../../utils/cockpitDataService';
import { generateProcurementRecommendations } from '../../utils/recommendationService';

interface Props {
  onNavigate?: (view: string) => void;
}

const ProcurementPanel = ({ onNavigate: _onNavigate }: Props) => {
  const [summary, setSummary] = useState<ProcurementSummary>({
    monthlyPlannedTotal: 0,
    monthlyPurchasedTotal: 0,
    monthlyInTransitTotal: 0,
    top5Materials: []
  });

  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await procurementService.getProcurementSummary();
        setSummary(data);
      } catch (error) {
        console.error('Failed to fetch procurement summary:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 执行率
  const overallExecutionPercentage = useMemo(() => {
    if (summary.monthlyPlannedTotal === 0) return 0;
    return (summary.monthlyPurchasedTotal / summary.monthlyPlannedTotal) * 100;
  }, [summary]);

  // Generate recommendations
  const recommendations = useMemo(() => {
    return generateProcurementRecommendations(
      overallExecutionPercentage,
      summary.top5Materials.map(m => ({
        materialName: m.materialName,
        executionPercentage: m.executionPercentage,
      }))
    );
  }, [overallExecutionPercentage, summary.top5Materials]);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-800">采购面板</h2>
      </div>
      <div className="p-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className="text-slate-600" size={20} />
              <span className="text-sm text-slate-600">计划采购总量</span>
            </div>
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin text-slate-400" size={16} />
                <span className="text-sm text-slate-400">加载中...</span>
              </div>
            ) : (
              <>
                <p className="text-2xl font-bold text-slate-800">{summary.monthlyPlannedTotal.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">本月</p>
              </>
            )}
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="text-green-600" size={20} />
              <span className="text-sm text-green-600">已采购量</span>
            </div>
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin text-green-400" size={16} />
                <span className="text-sm text-green-400">加载中...</span>
              </div>
            ) : (
              <>
                <p className="text-2xl font-bold text-green-600">{summary.monthlyPurchasedTotal.toLocaleString()}</p>
                <p className="text-xs text-green-600 mt-1">
                  执行率: {overallExecutionPercentage.toFixed(1)}%
                </p>
              </>
            )}
          </div>
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingCart className="text-blue-600" size={20} />
              <span className="text-sm text-blue-600">在途采购量</span>
            </div>
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin text-blue-400" size={16} />
                <span className="text-sm text-blue-400">加载中...</span>
              </div>
            ) : (
              <p className="text-2xl font-bold text-blue-600">{summary.monthlyInTransitTotal.toLocaleString()}</p>
            )}
          </div>
        </div>

        {/* Top 5 Materials */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">本月计划采购量前5的物料</h3>
          {loading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="animate-spin text-slate-400" size={24} />
            </div>
          ) : summary.top5Materials.length === 0 ? (
            <div className="text-center p-4 text-slate-500 text-sm bg-slate-50 rounded-lg">
              暂无数据
            </div>
          ) : (
            <div className="space-y-2">
              {summary.top5Materials.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-800">{item.materialName}</span>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="text-xs text-slate-600">
                        计划: {item.plannedQuantity.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-600">
                        已采购: {item.purchasedQuantity.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${item.executionPercentage >= 80 ? 'text-green-600' :
                      item.executionPercentage >= 50 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                      {item.executionPercentage.toFixed(1)}%
                    </div>
                    <div className="w-20 h-2 bg-slate-200 rounded-full mt-1 overflow-hidden">
                      <div
                        className={`h-full ${item.executionPercentage >= 80 ? 'bg-green-500' :
                          item.executionPercentage >= 50 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}
                        style={{ width: `${Math.min(item.executionPercentage, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recommendations */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">采购优化及调整建议</h3>
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {recommendations.length > 0 ? (
                recommendations.map((rec, index) => (
                  <div key={index} className="p-3 bg-indigo-50 rounded-lg border-l-4 border-indigo-500">
                    <p className="text-sm text-slate-700">{rec}</p>
                  </div>
                ))
              ) : (
                <div className="p-3 bg-slate-50 rounded-lg border-l-4 border-slate-300">
                  <p className="text-sm text-slate-500">暂无建议</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProcurementPanel;
