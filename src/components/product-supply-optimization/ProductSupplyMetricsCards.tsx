import React, { useState } from 'react';
import type { ProductSupplyAnalysis } from '../../types/ontology';
import type { BOMDetailPanelModel } from '../../services/productSupplyCalculator';
import { Layers, Truck, TrendingUp, AlertTriangle, Info, ChevronRight } from 'lucide-react';
import { productsData } from '../../utils/entityConfigService';
import { ProductOrderAnalysisCard } from './ProductOrderAnalysisCard';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { BOMDetailDrawer } from './BOMDetailDrawer';

interface Props {
  analysis: ProductSupplyAnalysis;
  bomDetailPanel?: BOMDetailPanelModel;
}

/**
 * 获取平均交货周期解释
 * 基于该产品所有物料的采购事件计算：
 * 交货周期 = 实际到货日期 - 订单日期
 * 平均交货周期 = 所有采购事件交货周期的平均值
 */
const getDeliveryCycleExplanation = (cycle: number): string => {
  if (cycle === 0) {
    return '暂无采购数据';
  } else if (cycle <= 15) {
    return '交货周期较短，供应链响应快';
  } else if (cycle <= 30) {
    return '交货周期正常，基于历史采购数据计算';
  } else if (cycle <= 60) {
    return '交货周期较长，建议提前备货';
  } else {
    return '交货周期很长，需重点关注供应链管理';
  }
};

/**
 * 获取供货稳定性评分解释
 * 供货稳定性 = 100 - 供应风险分数
 * 供应风险基于4个因素评估，每个因素占25分
 */
const getStabilityExplanation = (score: number): string => {
  const riskScore = 100 - score;
  const riskFactorCount = Math.round(riskScore / 25);

  if (score >= 75) {
    return '供应链稳定，风险因素少';
  } else if (score >= 50) {
    return `存在${riskFactorCount}项风险因素（如供应商集中、交付延迟等）`;
  } else {
    return `高风险：存在${riskFactorCount}项以上风险因素，需关注`;
  }
};

/**
 * 获取缺货风险解释
 * 基于库存可支撑天数判断：>30天=低，15-30天=中，<15天=高
 */
const getStockoutRiskExplanation = (riskLevel: string, stockDays?: number): string => {
  switch (riskLevel) {
    case 'low':
      return stockDays ? `库存可支撑${stockDays}天以上，充足` : '库存充足，可支撑30天以上';
    case 'medium':
      return stockDays ? `库存仅可支撑${stockDays}天，需关注` : '库存可支撑15-30天，需关注补货';
    case 'high':
    case 'critical':
      return stockDays ? `库存仅可支撑${stockDays}天，紧急补货` : '库存不足15天，需紧急补货';
    default:
      return '库存状态未知';
  }
};

export const ProductSupplyMetricsCards: React.FC<Props> = ({ analysis, bomDetailPanel }) => {
  const [bomDrawerOpen, setBomDrawerOpen] = useState(false);
  const riskColors = {
    low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    high: 'bg-red-100 text-red-700 border-red-200',
    critical: 'bg-red-200 text-red-800 border-red-300',
  };

  const riskLabels = {
    low: '低',
    medium: '中',
    high: '高',
    critical: '严重',
  };

  const product = productsData.find(p => p.productId === analysis.productId);

  return (
    <div className="space-y-4">
      <BOMDetailDrawer
        open={bomDrawerOpen}
        onClose={() => setBomDrawerOpen(false)}
        model={bomDetailPanel}
      />
      {/* First row: Order Analysis Card (wider) + 4 smaller cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        {/* Order Analysis Card - spans 2 columns (FR-001.5) */}
        <div className="md:col-span-2">
          <ErrorBoundary name="OrderAnalysisCard">
            <ProductOrderAnalysisCard 
              productId={analysis.productId}
              currentInventory={analysis.currentInventoryLevel}
              inventoryUnit={product?.stockUnit}
            />
          </ErrorBoundary>
        </div>

        {/* Product BOM Card */}
        <button
          type="button"
          onClick={() => setBomDrawerOpen(true)}
          className="text-left bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-lg p-3 border border-indigo-100 hover:shadow-md hover:border-indigo-200 transition-all group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-indigo-500/10 rounded flex items-center justify-center">
                <Layers className="text-indigo-600" size={16} />
              </div>
              <div className="text-xs text-slate-600">产品BOM</div>
            </div>
            <ChevronRight className="text-indigo-400 group-hover:text-indigo-600 transition-colors" size={18} />
          </div>
          <div className="flex items-baseline gap-1">
            <div className="text-2xl font-bold text-slate-800">{bomDetailPanel?.main_materials ?? 0}</div>
            <div className="text-xs text-slate-500">种物料</div>
          </div>
          <div className="mt-1 text-xs text-slate-500 group-hover:text-slate-600 transition-colors">
            {bomDetailPanel?.alternative_materials ? `含${bomDetailPanel.alternative_materials}种替代料` : '查看BOM结构'}
          </div>
        </button>

        {/* Average Delivery Cycle */}
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-lg p-3 border border-emerald-100 hover:shadow-md transition-all">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-emerald-500/10 rounded flex items-center justify-center">
              <Truck className="text-emerald-600" size={16} />
            </div>
            <div className="text-xs text-slate-600">平均交货周期</div>
          </div>
          <div className="flex items-baseline gap-1">
            <div className="text-2xl font-bold text-slate-800">{analysis.averageDeliveryCycle}</div>
            <div className="text-xs text-slate-500">天</div>
          </div>
          <div className="mt-1 text-xs text-slate-500 flex items-start gap-1">
            <Info size={12} className="mt-0.5 flex-shrink-0" />
            <span>{getDeliveryCycleExplanation(analysis.averageDeliveryCycle)}</span>
          </div>
        </div>

        {/* Supply Stability Score */}
        <div className={`bg-gradient-to-br rounded-lg p-3 border hover:shadow-md transition-all ${
          analysis.supplyStabilityScore >= 75 ? 'from-emerald-50 to-emerald-100/50 border-emerald-100' :
          analysis.supplyStabilityScore >= 50 ? 'from-purple-50 to-purple-100/50 border-purple-100' :
          'from-amber-50 to-amber-100/50 border-amber-100'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-7 h-7 rounded flex items-center justify-center ${
              analysis.supplyStabilityScore >= 75 ? 'bg-emerald-500/10' :
              analysis.supplyStabilityScore >= 50 ? 'bg-purple-500/10' :
              'bg-amber-500/10'
            }`}>
              <TrendingUp className={
                analysis.supplyStabilityScore >= 75 ? 'text-emerald-600' :
                analysis.supplyStabilityScore >= 50 ? 'text-purple-600' :
                'text-amber-600'
              } size={16} />
            </div>
            <div className="text-xs text-slate-600">供货稳定性</div>
          </div>
          <div className="flex items-baseline gap-1">
            <div className="text-2xl font-bold text-slate-800">{analysis.supplyStabilityScore}</div>
            <div className="text-xs text-slate-500">分</div>
          </div>
          <div className="mt-1 text-xs text-slate-500 flex items-start gap-1">
            <Info size={12} className="mt-0.5 flex-shrink-0" />
            <span>{getStabilityExplanation(analysis.supplyStabilityScore)}</span>
          </div>
        </div>

        {/* Stockout Risk Level */}
        <div className={`bg-gradient-to-br rounded-lg p-3 border hover:shadow-md transition-all ${
          analysis.stockoutRiskLevel === 'critical' ? 'from-red-50 to-red-100/50 border-red-200' :
          analysis.stockoutRiskLevel === 'high' ? 'from-red-50 to-red-100/50 border-red-100' :
          analysis.stockoutRiskLevel === 'medium' ? 'from-amber-50 to-amber-100/50 border-amber-100' :
          'from-emerald-50 to-emerald-100/50 border-emerald-100'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-7 h-7 rounded flex items-center justify-center ${
              analysis.stockoutRiskLevel === 'critical' ? 'bg-red-500/10' :
              analysis.stockoutRiskLevel === 'high' ? 'bg-red-500/10' :
              analysis.stockoutRiskLevel === 'medium' ? 'bg-amber-500/10' :
              'bg-emerald-500/10'
            }`}>
              <AlertTriangle className={
                analysis.stockoutRiskLevel === 'critical' || analysis.stockoutRiskLevel === 'high' ? 'text-red-600' :
                analysis.stockoutRiskLevel === 'medium' ? 'text-amber-600' : 'text-emerald-600'
              } size={16} />
            </div>
            <div className="text-xs text-slate-600">缺货风险</div>
          </div>
          <div className={`text-sm font-bold px-2 py-1 rounded border inline-block ${riskColors[analysis.stockoutRiskLevel]}`}>
            {riskLabels[analysis.stockoutRiskLevel]}
          </div>
          <div className="mt-1 text-xs text-slate-500 flex items-start gap-1">
            <Info size={12} className="mt-0.5 flex-shrink-0" />
            <span>{getStockoutRiskExplanation(analysis.stockoutRiskLevel)}</span>
          </div>
        </div>
      </div>

    </div>
  );
};
