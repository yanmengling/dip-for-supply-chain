/**
 * Procurement Panel
 * 
 * Displays procurement summary including monthly planned, purchased, in-transit quantities,
 * top 5 materials by planned quantity, and optimization recommendations.
 */

import { useMemo } from 'react';
import { ShoppingCart, TrendingUp, Loader2 } from 'lucide-react';
import { getProcurementSummary } from '../../utils/cockpitDataService';
import { generateProcurementRecommendations } from '../../utils/recommendationService';
import { useMetricData, latestValueTransform } from '../../hooks/useMetricData';


// 采购指标模型 ID 配置 - 根据数据模式使用不同的指标
// 采购指标模型 ID 配置
const METRIC_IDS = {
  /** 计划采购总量 */
  PLANNED_PURCHASE_TOTAL: 'd51nnclg5lk40hvh48h0',
  /** 已采购量 */
  PURCHASED_QUANTITY: 'd51o5rtg5lk40hvh48hg',
  /** 执行率 */
  EXECUTION_RATE: 'd51o6qtg5lk40hvh48i0',
  /** 在途采购量 */
  IN_TRANSIT_QUANTITY: 'd51oh5lg5lk40hvh48ig',
};

interface Props {
  onNavigate?: (view: string) => void;
}

const ProcurementPanel = ({ onNavigate: _onNavigate }: Props) => {
  const summary = useMemo(() => getProcurementSummary(), []);

  // 使用配置的指标 ID
  const currentMetricIds = METRIC_IDS;

  // 从真实 API 获取采购指标数据
  const {
    value: plannedPurchaseTotalFromApi,
    loading: plannedPurchaseLoading,
  } = useMetricData(currentMetricIds.PLANNED_PURCHASE_TOTAL, {
    instant: true,
    transform: latestValueTransform,
  });

  const {
    value: purchasedQuantityFromApi,
    loading: purchasedQuantityLoading,
  } = useMetricData(currentMetricIds.PURCHASED_QUANTITY, {
    instant: true,
    transform: latestValueTransform,
  });

  const {
    value: executionRateFromApi,
    loading: _executionRateLoading,
  } = useMetricData(currentMetricIds.EXECUTION_RATE, {
    instant: true,
    transform: latestValueTransform,
  });

  // FIXME: This metric returns 500 error, temporarily disabled
  // const {
  //   value: inTransitQuantityFromApi,
  //   loading: inTransitQuantityLoading,
  // } = useMetricData(currentMetricIds.IN_TRANSIT_QUANTITY, {
  //   instant: true,
  //   transform: latestValueTransform,
  // });

  // Temporarily use mock data for in-transit quantity
  const inTransitQuantityFromApi = null;
  const inTransitQuantityLoading = false;

  // 使用 API 数据，如果失败则使用 mock 数据
  const monthlyPlannedTotal = plannedPurchaseTotalFromApi ?? summary.monthlyPlannedTotal;
  const monthlyPurchasedTotal = purchasedQuantityFromApi ?? summary.monthlyPurchasedTotal;
  const monthlyInTransitTotal = inTransitQuantityFromApi ?? summary.monthlyInTransitTotal;

  // 执行率：优先使用 API 数据，否则计算
  const overallExecutionPercentage = executionRateFromApi ??
    (monthlyPlannedTotal > 0
      ? (monthlyPurchasedTotal / monthlyPlannedTotal) * 100
      : 0);

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
            {plannedPurchaseLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin text-slate-400" size={16} />
                <span className="text-sm text-slate-400">加载中...</span>
              </div>
            ) : (
              <>
                <p className="text-2xl font-bold text-slate-800">{monthlyPlannedTotal.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">本月</p>
              </>
            )}
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="text-green-600" size={20} />
              <span className="text-sm text-green-600">已采购量</span>
            </div>
            {purchasedQuantityLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin text-green-400" size={16} />
                <span className="text-sm text-green-400">加载中...</span>
              </div>
            ) : (
              <>
                <p className="text-2xl font-bold text-green-600">{monthlyPurchasedTotal.toLocaleString()}</p>
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
            {inTransitQuantityLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin text-blue-400" size={16} />
                <span className="text-sm text-blue-400">加载中...</span>
              </div>
            ) : (
              <p className="text-2xl font-bold text-blue-600">{monthlyInTransitTotal.toLocaleString()}</p>
            )}
          </div>
        </div>

        {/* Top 5 Materials */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">本月计划采购量前5的物料</h3>
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
        </div>

        {/* Recommendations */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">采购优化及调整建议</h3>
          <div className="space-y-2">
            {recommendations.map((rec, index) => (
              <div key={index} className="p-3 bg-indigo-50 rounded-lg border-l-4 border-indigo-500">
                <p className="text-sm text-slate-700">{rec}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProcurementPanel;



