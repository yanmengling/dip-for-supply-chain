import React, { useState, useEffect, useRef } from 'react';
import { ProductSupplyAnalysisPanel } from './ProductSupplyAnalysisPanel';
import type { ProductSupplyAnalysis, DemandForecast } from '../../types/ontology';
import type { SupplierDetailPanelModel } from '../../services/productSupplyCalculator';
import { Layers, MessageSquare } from 'lucide-react';

export const ProductSupplyOptimizationPage: React.FC<{ toggleCopilot?: () => void }> = ({ toggleCopilot }) => {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<ProductSupplyAnalysis[]>([]);
  const [demandForecasts, setDemandForecasts] = useState<Map<string, DemandForecast>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [supplierDetailPanels, setSupplierDetailPanels] = useState<Map<string, SupplierDetailPanelModel>>(new Map());

  // 唯一的数据加载useEffect
  useEffect(() => {
    const loadAllData = async () => {
      setLoading(true);
      setError(null);
      console.log(`[数据加载] 开始加载智能计算数据...`);

      try {
        let analysisData: ProductSupplyAnalysis[] = [];
        let forecastsMap = new Map<string, DemandForecast>();

        // ===== 大脑模式 =====
        console.log('[大脑模式] 开始加载智能计算数据...');
        const { calculateAllProductsSupplyAnalysis } = await import('../../services/productSupplyCalculator');
        const smartAnalyses = await calculateAllProductsSupplyAnalysis();

        const supplierPanels = new Map<string, SupplierDetailPanelModel>();
        smartAnalyses.forEach(analysis => {
          if (analysis.supplierDetailPanel) {
            supplierPanels.set(analysis.productId, analysis.supplierDetailPanel);
          }
        });
        setSupplierDetailPanels(supplierPanels);

        // 转换分析数据
        analysisData = smartAnalyses.map(analysis => ({
          productId: analysis.productId,
          productName: analysis.productName,
          currentStock: analysis.inventoryStatus.currentStock,
          safetyStock: Math.ceil(analysis.demandTrend.averageDailyDemand * 30),
          stockDays: analysis.inventoryStatus.stockDays,
          demandTrend: analysis.demandTrend.demandGrowthRate > 0 ? 'increasing' as const : 'decreasing' as const,
          supplyRisk: analysis.supplyRisk.riskLevel,
          recommendation: analysis.inventoryOptimization.reason,
          supplierCount: analysis.supplierMatch?.supplierCount ?? Math.min(10, Math.max(1, Math.ceil(analysis.demandTrend.last90DaysDemand / 2000))),
          averageDeliveryCycle: 30 + (analysis.demandTrend.demandGrowthRate > 50 ? 10 : 0),
          supplyStabilityScore: Math.round(100 - analysis.supplyRisk.riskScore),
          currentInventoryLevel: analysis.inventoryStatus.currentStock,
          stockoutRiskLevel: analysis.inventoryStatus.stockStatus === 'sufficient' ? 'low' as const :
            analysis.inventoryStatus.stockStatus === 'warning' ? 'medium' as const : 'high' as const,
          lastUpdated: new Date().toISOString(),
          leadTime: 30,
          reorderPoint: Math.ceil(analysis.demandTrend.averageDailyDemand * 30),
          economicOrderQuantity: Math.ceil(analysis.demandTrend.averageDailyDemand * 60),
        }));

        // 生成预测数据
        smartAnalyses.forEach(analysis => {
          const smartForecast = analysis.demandForecast;
          const models = [
            { method: 'moving_average' as const, name: '移动平均', predictions: smartForecast.predictions.movingAverage },
            { method: 'exponential_smoothing' as const, name: '指数平滑', predictions: smartForecast.predictions.exponentialSmoothing },
            { method: 'linear_regression' as const, name: '线性回归', predictions: smartForecast.predictions.linearRegression },
          ];

          models.forEach(model => {
            const avgPrediction = model.predictions.reduce((sum, val) => sum + val, 0) / model.predictions.length;
            forecastsMap.set(`${analysis.productId}-${model.method}`, {
              productId: analysis.productId,
              productName: analysis.productName,
              forecastPeriod: smartForecast.forecastPeriod,
              predictedDemand: Math.round(avgPrediction),
              confidenceLevel: smartForecast.confidence >= 80 ? 'high' : smartForecast.confidence >= 60 ? 'medium' : 'low',
              calculationMethod: model.method,
              forecastModel: model.name,
              historicalDataPoints: analysis.demandTrend.demandHistory.length,
              lastUpdated: new Date().toISOString(),
            });
          });
        });
        console.log('[大脑模式] 数据加载完成, 分析数据:', analysisData.length, '预测数据:', forecastsMap.size);

        // 设置分析数据
        setAnalyses(analysisData);

        // 关键修复：模式切换时总是选择第一个产品，不使用旧的selectedProductId
        // 因为旧的ID可能在新模式中不存在
        let productIdToSelect: string | null = null;
        if (analysisData.length > 0) {
          productIdToSelect = analysisData[0].productId;
          setSelectedProductId(productIdToSelect);
          console.log(`[数据加载] 自动选择第一个产品: ${productIdToSelect}`);
        }

        // 设置预测数据
        setDemandForecasts(forecastsMap);
        console.log(`[数据加载] 完成, 预测数据size: ${forecastsMap.size}`);
      } catch (error) {
        console.error('Failed to load product supply optimization data:', error);
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    };

    loadAllData();
  }, []);

  const selectedAnalysis = analyses.find(a => a.productId === selectedProductId);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      if (selectedProductId) {
        window.sessionStorage.setItem('copilot.optimization.selectedProductId', selectedProductId);
      } else {
        window.sessionStorage.removeItem('copilot.optimization.selectedProductId');
      }
    } catch (e) {
      console.warn('[Copilot] Failed to persist selectedProductId:', e);
    }
  }, [selectedProductId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-lg flex items-center justify-center">
              <Layers size={20} className="text-white" />
            </div>
            产品供应优化
          </h1>
          <p className="text-slate-500 mt-1">NPI 选型、EOL 决策与供应链风险评估</p>
        </div>

      </div>

      {/* Main Content */}
      <div>
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <h3 className="text-xl font-bold text-red-700 mb-2">Error Loading Data</h3>
            <p className="text-red-600">{error}</p>
            <p className="text-red-600">{error}</p>
          </div>
        ) : (
          <ProductSupplyAnalysisPanel
            analysis={selectedAnalysis || null}
            loading={loading}
            allProducts={analyses}
            selectedProductId={selectedProductId}
            onProductSelect={setSelectedProductId}
            demandForecasts={demandForecasts}
            supplierDetailPanels={supplierDetailPanels}
          />
        )}
      </div>

      {/* Floating Chat Bubble Button */}
      {toggleCopilot && (
        <button
          onClick={toggleCopilot}
          className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-40"
          aria-label="打开AI助手"
        >
          <MessageSquare size={24} />
        </button>
      )}
    </div>
  );
};
