import React, { useState, useEffect, useRef } from 'react';
import { ProductSupplyAnalysisPanel } from './ProductSupplyAnalysisPanel';
import type { ProductSupplyAnalysis, DemandForecast } from '../../types/ontology';
import type { BOMDetailPanelModel, ProductListItem } from '../../services/productSupplyCalculator';
import { Layers, MessageSquare } from 'lucide-react';

export const ProductSupplyOptimizationPage: React.FC<{ toggleCopilot?: () => void }> = ({ toggleCopilot }) => {
  // 产品列表（轻量级，快速加载）
  const [productList, setProductList] = useState<ProductListItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // 当前选中产品的详细分析（按需加载）
  const [currentAnalysis, setCurrentAnalysis] = useState<ProductSupplyAnalysis | null>(null);
  const [demandForecasts, setDemandForecasts] = useState<Map<string, DemandForecast>>(new Map());
  const [bomDetailPanels, setBomDetailPanels] = useState<Map<string, BOMDetailPanelModel>>(new Map());

  // 加载状态
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 缓存已加载的分析结果
  const analysisCache = useRef<Map<string, ProductSupplyAnalysis>>(new Map());

  // 防止 React.StrictMode 双重加载
  const loadingRef = useRef(false);

  // 第一步：快速加载产品列表
  useEffect(() => {
    if (loadingRef.current) {
      console.log('[懒加载] 跳过重复加载产品列表');
      return;
    }

    const loadProductList = async () => {
      loadingRef.current = true;
      setListLoading(true);
      setError(null);
      console.log('[懒加载] 开始加载产品列表...');

      try {
        const { loadProductList: fetchProductList, startBackgroundPreload } = await import('../../services/productSupplyCalculator');

        // 快速加载产品列表
        const list = await fetchProductList();
        setProductList(list);

        // 自动选择第一个产品
        if (list.length > 0) {
          setSelectedProductId(list[0].productId);
          console.log(`[懒加载] 自动选择第一个产品: ${list[0].productId}`);
        }

        // 开始后台预加载数据索引（不阻塞UI）
        startBackgroundPreload();

        console.log(`[懒加载] 产品列表加载完成: ${list.length} 个产品`);
      } catch (error) {
        console.error('[懒加载] 加载产品列表失败:', error);
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        setListLoading(false);
      }
    };

    loadProductList();
  }, []);

  // 第二步：当选择产品时，加载该产品的详细分析
  useEffect(() => {
    if (!selectedProductId) return;

    // 检查缓存
    const cached = analysisCache.current.get(selectedProductId);
    if (cached) {
      console.log(`[懒加载] 使用缓存的分析结果: ${selectedProductId}`);
      setCurrentAnalysis(cached);
      setDetailLoading(false);
      return;
    }

    // 用于取消过期的请求
    let cancelled = false;

    const loadProductAnalysis = async () => {
      setDetailLoading(true);
      console.log(`[懒加载] 加载产品详细分析: ${selectedProductId}`);

      try {
        const { calculateSingleProductAnalysis } = await import('../../services/productSupplyCalculator');
        const analysis = await calculateSingleProductAnalysis(selectedProductId);

        // 如果请求已取消（用户切换了产品），不更新状态
        if (cancelled) {
          console.log(`[懒加载] 请求已取消: ${selectedProductId}`);
          return;
        }

        if (analysis) {
          // 转换为UI需要的格式（符合 ontology.ProductSupplyAnalysis）
          const uiAnalysis: ProductSupplyAnalysis = {
            productId: analysis.productId,
            productName: analysis.productName,
            supplierCount: analysis.supplierMatch?.supplierCount ?? 0,
            averageDeliveryCycle: 30 + (analysis.demandTrend.demandGrowthRate > 50 ? 10 : 0),
            supplyStabilityScore: Math.round(100 - analysis.supplyRisk.riskScore),
            currentInventoryLevel: analysis.inventoryStatus.currentStock,
            stockoutRiskLevel: analysis.inventoryStatus.stockStatus === 'sufficient' ? 'low' :
              analysis.inventoryStatus.stockStatus === 'warning' ? 'medium' : 'high',
            lastUpdated: new Date().toISOString(),
          };

          // 缓存结果
          analysisCache.current.set(selectedProductId, uiAnalysis);

          setCurrentAnalysis(uiAnalysis);

          // 更新BOM面板
          if (analysis.bomDetailPanel) {
            setBomDetailPanels(prev => {
              const newMap = new Map(prev);
              newMap.set(analysis.productId, analysis.bomDetailPanel!);
              return newMap;
            });
          }

          // 生成预测数据
          const smartForecast = analysis.demandForecast;
          const models = [
            { method: 'moving_average' as const, name: '移动平均', predictions: smartForecast.predictions.movingAverage },
            { method: 'exponential_smoothing' as const, name: '指数平滑', predictions: smartForecast.predictions.exponentialSmoothing },
            { method: 'linear_regression' as const, name: '线性回归', predictions: smartForecast.predictions.linearRegression },
          ];

          setDemandForecasts(prev => {
            const newMap = new Map(prev);
            models.forEach(model => {
              const avgPrediction = model.predictions.reduce((sum, val) => sum + val, 0) / model.predictions.length;
              newMap.set(`${analysis.productId}-${model.method}`, {
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
            return newMap;
          });

          console.log(`[懒加载] 产品分析加载完成: ${selectedProductId}`);
        }
      } catch (error) {
        if (!cancelled) {
          console.error(`[懒加载] 加载产品分析失败: ${selectedProductId}`, error);
          setError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    };

    loadProductAnalysis();

    // 清理函数：取消过期的请求
    return () => {
      cancelled = true;
    };
  }, [selectedProductId]);

  // 持久化选中的产品ID
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

  // 将产品列表转换为 allProducts 格式（用于下拉选择，符合 ontology.ProductSupplyAnalysis）
  const allProducts = productList.map(p => ({
    productId: p.productId,
    productName: p.productName,
    supplierCount: 0,
    averageDeliveryCycle: 0,
    supplyStabilityScore: 0,
    currentInventoryLevel: 0,
    stockoutRiskLevel: 'low' as const,
    lastUpdated: '',
  }));

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
          </div>
        ) : (
          <ProductSupplyAnalysisPanel
            analysis={currentAnalysis}
            loading={listLoading || detailLoading}
            allProducts={allProducts}
            selectedProductId={selectedProductId}
            onProductSelect={setSelectedProductId}
            demandForecasts={demandForecasts}
            bomDetailPanels={bomDetailPanels}
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
