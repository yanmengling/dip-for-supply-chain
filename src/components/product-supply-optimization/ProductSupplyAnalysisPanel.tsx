import React, { useState } from 'react';
import type { ProductSupplyAnalysis, DemandForecast } from '../../types/ontology';
import type { SupplierDetailPanelModel } from '../../services/productSupplyCalculator';
import { Package, Sparkles, Search } from 'lucide-react';
import { ProductSupplyMetricsCards } from './ProductSupplyMetricsCards';
import { ProductDemandForecastCard } from './ProductDemandForecastCard';
import { ProductDemandForecastPanelNew } from './ProductDemandForecastPanelNew';
import { ProductSelectionSection } from './ProductSelectionSection';


interface Props {
  analysis: ProductSupplyAnalysis | null;
  loading?: boolean;
  allProducts?: ProductSupplyAnalysis[];
  selectedProductId?: string | null;
  onProductSelect?: (productId: string) => void;
  demandForecasts?: Map<string, DemandForecast>;
  supplierDetailPanels?: Map<string, SupplierDetailPanelModel>;
}

export const ProductSupplyAnalysisPanel: React.FC<Props> = ({
  analysis,
  loading = false,
  allProducts = [],
  selectedProductId = null,
  onProductSelect,
  demandForecasts = new Map(),
  supplierDetailPanels = new Map(),
}) => {

  // AI suggestions
  const aiSuggestions = [
    '建议优先关注库存量前3的产品，及时调整供应策略',
    '根据需求预测，建议提前准备高需求产品的原材料',
  ];
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-48 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-slate-100 rounded-lg p-4">
                <div className="h-4 bg-slate-200 rounded w-24 mb-2"></div>
                <div className="h-8 bg-slate-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">产品供应分析</h2>
        <div className="text-center py-8 text-slate-500">
          <Package className="mx-auto mb-2 text-slate-400" size={48} />
          <p>暂无数据</p>
        </div>
      </div>
    );
  }


  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow">
      {/* AI Suggestions Section */}
      {allProducts.length > 0 && (
        <div className="mb-6 bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-4">
          <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
            <Sparkles size={20} className="text-indigo-600" />
            AI 建议
          </h3>
          <ul className="text-sm text-slate-700 space-y-1">
            {aiSuggestions.map((suggestion, i) => (
              <li key={i}>• {suggestion}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Product Selection */}
      <ProductSelectionSection
        allProducts={allProducts}
        selectedProductId={selectedProductId}
        onProductSelect={onProductSelect}
      />

      {/* Panel Header */}
      {analysis && (
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-100 to-indigo-50 rounded-lg flex items-center justify-center">
              <Package className="text-indigo-600" size={20} />
            </div>
            产品供应分析
          </h2>
          <div className="text-xs text-slate-500">
            更新时间: {new Date(analysis.lastUpdated).toLocaleString('zh-CN')}
          </div>
        </div>
      )}

      {/* Product Name Display (FR-001.1) */}
      {analysis && (
        <div className="mb-6">
          <h3 className="text-lg font-bold text-slate-800">{analysis.productName}</h3>
        </div>
      )}

      {/* Product Supply Metrics Cards */}
      {analysis && (
        <ProductSupplyMetricsCards
          analysis={analysis}
          supplierDetailPanel={supplierDetailPanels.get(analysis.productId)}
        />
      )}


      {/* Demand Forecast Panel - New enhanced version with algorithm selection (FR-001.4) */}
      {selectedProductId && analysis && (
        <ProductDemandForecastPanelNew
          productId={selectedProductId}
          productName={analysis.productName}
          loading={loading}
        />
      )}


    </div >
  );
};
