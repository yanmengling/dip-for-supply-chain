import React from 'react';
import type { ProductSupplyAnalysis, DemandForecast } from '../../types/ontology';
import type { BOMDetailPanelModel } from '../../services/productSupplyCalculator';
import { Package } from 'lucide-react';
import { ProductSupplyMetricsCards } from './ProductSupplyMetricsCards';
import { ProductDemandForecastPanelNew } from './ProductDemandForecastPanelNew';
import ProductSearchSection from './ProductSearchSection';


interface Props {
  analysis: ProductSupplyAnalysis | null;
  loading?: boolean;
  allProducts?: ProductSupplyAnalysis[];
  selectedProductId?: string | null;
  onProductSelect?: (productId: string) => void;
  demandForecasts?: Map<string, DemandForecast>;
  bomDetailPanels?: Map<string, BOMDetailPanelModel>;
}

export const ProductSupplyAnalysisPanel: React.FC<Props> = ({
  analysis,
  loading = false,
  allProducts = [],
  selectedProductId = null,
  onProductSelect,
  demandForecasts = new Map(),
  bomDetailPanels = new Map(),
}) => {
  // 产品列表加载中（初始加载）
  const isListLoading = loading && allProducts.length === 0;
  // 产品详情加载中
  const isDetailLoading = loading && allProducts.length > 0;

  // 初始加载：显示完整骨架屏
  if (isListLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-10 bg-slate-200 rounded w-64 mb-6"></div>
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

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow">

      {/* Product Selection - 始终显示 */}
      <ProductSearchSection
        allProducts={allProducts}
        selectedProductId={selectedProductId || undefined}
        onProductSelect={onProductSelect || (() => {})}
      />

      {/* 详情加载中：显示骨架屏但保留产品选择器 */}
      {isDetailLoading && (
        <div className="animate-pulse mt-6">
          <div className="h-6 bg-slate-200 rounded w-48 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-slate-100 rounded-lg p-4">
                <div className="h-4 bg-slate-200 rounded w-24 mb-2"></div>
                <div className="h-8 bg-slate-200 rounded w-16"></div>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center text-slate-500 text-sm">
            正在加载产品详情...
          </div>
        </div>
      )}

      {/* 无数据状态 */}
      {!isDetailLoading && !analysis && (
        <div className="text-center py-8 text-slate-500">
          <Package className="mx-auto mb-2 text-slate-400" size={48} />
          <p>请选择一个产品查看分析</p>
        </div>
      )}

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

      {/* Product Name and ID Display (FR-001.1) */}
      {analysis && (
        <div className="mb-6">
          <h3 className="text-lg font-bold text-slate-800">
            {analysis.productName}
            <span className="text-sm font-normal text-slate-500 ml-2">({analysis.productId})</span>
          </h3>
        </div>
      )}

      {/* Product Supply Metrics Cards */}
      {analysis && (
        <ProductSupplyMetricsCards
          analysis={analysis}
          bomDetailPanel={bomDetailPanels.get(analysis.productId)}
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
