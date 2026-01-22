import React, { useState, useEffect } from 'react';
import { ShoppingCart, Loader2, AlertCircle, ChevronRight, CheckCircle2, Clock, Package } from 'lucide-react';
import { loadSalesOrderEvents } from '../../services/ontologyDataService';
import { loadOrderInfo } from '../../services/productSupplyCalculator';
import { metricModelApi, createLastDaysRange } from '../../api';
import { apiConfigService } from '../../services/apiConfigService';
import { OrderAnalysisModal } from './OrderAnalysisModal';

interface Props {
  productId: string;
  currentInventory?: number;
  inventoryUnit?: string;
}

interface OrderAnalysisResult {
  totalSigningQuantity: number;
  totalShippingQuantity: number;
  pendingQuantity: number;
  completionRate: number;
  orderCount: number;
}

// Note: Metric Model ID is now loaded from config service
// - Product Inventory Optimization: mm_product_inventory_optimization_huida
const PRODUCT_INVENTORY_DIMENSIONS = ['material_code', 'material_name', 'available_quantity'];
const SUPPORTED_PRODUCTS = ['T01-000055', 'T01-000167', 'T01-000173'];

/**
 * 订单分析卡片 - 根据 FR-001.5 要求
 * 显示总签约数量、已交付数量、待交付数量、完成率、当前库存
 */
export const ProductOrderAnalysisCard: React.FC<Props> = ({
  productId,
  currentInventory,
  inventoryUnit = '单位'
}) => {

  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<OrderAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [inventoryCount, setInventoryCount] = useState<number | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  useEffect(() => {
    const fetchOrderAnalysis = async () => {
      if (!productId) return;

      setLoading(true);
      setError(null);

      try {
        let orders: any[] = [];

        // 大脑模式：使用 productSupplyCalculator 的 loadOrderInfo
        const orderInfo = await loadOrderInfo();
        orders = orderInfo.filter(o => o.product_code === productId);

        if (orders.length === 0) {
          setAnalysis({
            totalSigningQuantity: 0,
            totalShippingQuantity: 0,
            pendingQuantity: 0,
            completionRate: 0,
            orderCount: 0,
          });
          return;
        }

        // 计算订单指标
        let totalSigning = 0;
        let totalShipping = 0;

        orders.forEach(order => {
          // 大脑模式使用 signing_quantity/shipping_quantity
          totalSigning += order.signing_quantity || 0;
          totalShipping += order.shipping_quantity || 0;
        });

        const pending = Math.max(0, totalSigning - totalShipping);
        const rate = totalSigning > 0 ? (totalShipping / totalSigning) * 100 : 0;

        setAnalysis({
          totalSigningQuantity: Math.floor(totalSigning),
          totalShippingQuantity: Math.floor(totalShipping),
          pendingQuantity: Math.floor(pending),
          completionRate: Math.min(100, Math.max(0, rate)),
          orderCount: orders.length,
        });
      } catch (err) {
        console.error('[ProductOrderAnalysisCard] Failed to fetch:', err);
        setError('获取订单数据失败');
      } finally {
        setLoading(false);
      }
    };

    fetchOrderAnalysis();
  }, [productId]);

  // 获取当前库存（如果支持API模式）
  useEffect(() => {
    const shouldUseApi = SUPPORTED_PRODUCTS.includes(productId);

    if (!shouldUseApi) {
      setInventoryCount(null);
      return;
    }

    const fetchInventory = async () => {
      setInventoryLoading(true);
      try {
        const range = createLastDaysRange(1);

        // Load metric model ID from config
        const modelId = apiConfigService.getMetricModelId('mm_product_inventory_optimization');

        if (!modelId) {
          console.warn('[ProductOrderAnalysisCard] Metric model ID not configured');
          setInventoryCount(0);
          setInventoryLoading(false);
          return;
        }
        const result = await metricModelApi.queryByModelId(
          modelId as string,
          {
            instant: true,
            start: range.start,
            end: range.end,
            analysis_dimensions: PRODUCT_INVENTORY_DIMENSIONS,
          },
          { includeModel: true }
        );

        // 从返回数据中找到匹配当前产品的记录
        let total = 0;
        if (result.datas && result.datas.length > 0) {
          for (const series of result.datas) {
            if (!series || !series.labels) continue;
            const materialCode = series.labels.material_code || '';

            if (materialCode === productId) {
              const availableQty = series.labels?.available_quantity;
              if (availableQty) {
                const qty = parseFloat(availableQty);
                if (!isNaN(qty)) {
                  total += qty;
                }
              } else if (series.values && series.values.length > 0) {
                for (let i = series.values.length - 1; i >= 0; i--) {
                  if (series.values[i] !== null && series.values[i] !== undefined) {
                    total += Number(series.values[i]);
                    break;
                  }
                }
              }
            }
          }
        }

        setInventoryCount(Math.floor(total));
      } catch (err) {
        console.error(`[ProductOrderAnalysisCard] Failed to fetch inventory for ${productId}:`, err);
      } finally {
        setInventoryLoading(false);
      }
    };

    fetchInventory();
  }, [productId]);

  // 确定显示的库存值：优先使用API数据，其次使用props，最后使用0
  const displayInventory = inventoryCount !== null ? inventoryCount : (currentInventory ?? 0);

  const handleClick = () => {
    if (!loading && !error && analysis) {
      setShowModal(true);
    }
  };

  return (
    <>
      <div
        onClick={handleClick}
        className={`bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-lg p-4 border border-indigo-100
          ${!loading && !error && analysis ? 'cursor-pointer hover:shadow-md hover:border-indigo-200 group' : ''}
          transition-all`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center">
              <ShoppingCart className="text-indigo-600" size={18} />
            </div>
            <span className="text-sm font-medium text-slate-700">订单交付分析</span>
          </div>
          {!loading && !error && analysis && (
            <ChevronRight className="text-indigo-400 group-hover:text-indigo-600 transition-colors" size={18} />
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="animate-spin text-indigo-500" size={24} />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-red-500 text-sm py-2">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        ) : analysis ? (
          <div className="space-y-3">
            {/* Main Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/60 rounded-lg p-2">
                <div className="text-xs text-slate-500 mb-1">总签约数量</div>
                <div className="text-lg font-bold text-slate-800">
                  {analysis.totalSigningQuantity.toLocaleString()}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  共 {analysis.orderCount} 笔订单
                </div>
              </div>
              <div className="bg-white/60 rounded-lg p-2">
                <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-emerald-500" />
                  已交付
                </div>
                <div className="text-lg font-bold text-emerald-600">
                  {analysis.totalShippingQuantity.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Current Inventory, Pending & Completion Rate */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Current Inventory */}
                <div className="flex items-center gap-1.5">
                  <Package size={14} className="text-amber-500" />
                  <span className="text-xs text-slate-500">当前库存:</span>
                  {inventoryLoading ? (
                    <Loader2 className="animate-spin text-amber-500" size={12} />
                  ) : (
                    <span className="text-sm font-semibold text-slate-700">
                      {displayInventory.toLocaleString()} {inventoryUnit}
                    </span>
                  )}
                </div>
                {/* Pending */}
                <div className="flex items-center gap-1.5">
                  <Clock size={14} className="text-amber-500" />
                  <span className="text-xs text-slate-500">待交付:</span>
                  <span className="text-sm font-semibold text-amber-600">
                    {analysis.pendingQuantity.toLocaleString()}
                  </span>
                </div>
              </div>
              {/* Completion Rate */}
              <div className={`text-sm font-bold px-2 py-0.5 rounded-lg ${analysis.completionRate >= 80 ? 'bg-emerald-100 text-emerald-700' :
                analysis.completionRate >= 50 ? 'bg-amber-100 text-amber-700' :
                  'bg-red-100 text-red-700'
                }`}>
                {analysis.completionRate.toFixed(1)}%
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-200/50 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${analysis.completionRate >= 80 ? 'bg-emerald-500' :
                  analysis.completionRate >= 50 ? 'bg-amber-500' :
                    'bg-red-500'
                  }`}
                style={{ width: `${analysis.completionRate}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Modal */}
      <OrderAnalysisModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        productId={productId}
      />
    </>
  );
};

