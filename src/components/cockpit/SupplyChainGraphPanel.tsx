/**
 * Supply Chain Graph Panel
 * 
 * Displays supply chain stages in a card-based grid layout.
 * Shows total count and abnormal count for each stage.
 */

import { useMemo, useEffect, useState } from 'react';
import { Package, ShoppingCart, Warehouse, Box, Truck, Loader2, X, BarChart3 } from 'lucide-react';
import OrderDemandCharts from './OrderDemandCharts';
import ProductInventoryCharts from './ProductInventoryCharts';
import MaterialInventoryCharts from './MaterialInventoryCharts';
import { loadDeliveryOrders } from '../../services/deliveryDataService';
import type { DeliveryOrder } from '../../types/ontology';
import { getSupplyChainGraphData, type SupplyChainStageData } from '../../utils/cockpitDataService';
import { useMetricData, latestValueTransform } from '../../hooks/useMetricData';
import { apiConfigService } from '../../services/apiConfigService';
import { ApiConfigType, type MetricModelConfig } from '../../types/apiConfig';

import { calculateAllProductInventory, type ProductInventoryResult } from '../../services/productInventoryCalculator';
import { metricModelApi, createLastDaysRange } from '../../api';

/**
 * 从配置中心获取指标模型 ID
 * 使用标签查找对应的指标配置
 */
function getMetricIds() {
  try {
    const metrics = apiConfigService.getEnabledConfigsByType<MetricModelConfig>(ApiConfigType.METRIC_MODEL);

    // 使用标签查找各个指标
    const orderMetric = metrics.find(m => m.tags?.includes('order') && m.tags?.includes('graph'));
    const productMetric = metrics.find(m => m.tags?.includes('product') && m.tags?.includes('graph'));
    const materialMetric = metrics.find(m => m.tags?.includes('material') && m.tags?.includes('graph'));
    const supplierMetric = metrics.find(m => m.tags?.includes('supplier') && m.tags?.includes('graph'));
    const inventoryMetric = metrics.find(m => m.tags?.includes('inventory') && m.tags?.includes('product'));

    return {
      ORDER_DEMAND_COUNT: orderMetric?.modelId || 'd58fu5lg5lk40hvh48kg',
      PRODUCT_COUNT: productMetric?.modelId || 'd58fv0lg5lk40hvh48l0',
      WAREHOUSE_COUNT: 'd51m9htg5lk40hvh48fg',  // TODO: 待配置中心添加仓库指标
      MATERIAL_COUNT: materialMetric?.modelId || 'd58g085g5lk40hvh48lg',
      SUPPLIER_COUNT: supplierMetric?.modelId || 'd58g53lg5lk40hvh48m0',
      PRODUCT_INVENTORY_DETAIL: inventoryMetric?.modelId || 'd58keb5g5lk40hvh48og',
    };
  } catch (error) {
    console.warn('[SupplyChainGraphPanel] Failed to load metric IDs from config, using defaults:', error);
    // Fallback to hardcoded values
    return {
      ORDER_DEMAND_COUNT: apiConfigService.getMetricModelId('mm_order_demand') || 'd58fu5lg5lk40hvh48kg',
      PRODUCT_COUNT: apiConfigService.getMetricModelId('mm_product_count') || 'd58fv0lg5lk40hvh48l0',
      WAREHOUSE_COUNT: 'd51m9htg5lk40hvh48fg',
      MATERIAL_COUNT: apiConfigService.getMetricModelId('mm_material_count') || 'd58g085g5lk40hvh48lg',
      SUPPLIER_COUNT: apiConfigService.getMetricModelId('mm_supplier_count') || 'd58g53lg5lk40hvh48m0',
      PRODUCT_INVENTORY_DETAIL: apiConfigService.getMetricModelId('mm_product_inventory_optimization') || 'd58keb5g5lk40hvh48og',
    };
  }
}

// 产品库存分析的分析维度
const PRODUCT_INVENTORY_DIMENSIONS = ['material_code', 'material_name', 'available_quantity'];

interface Props {
  onNavigate?: (view: string) => void;
}

const SupplyChainGraphPanel = ({ onNavigate }: Props) => {
  const baseGraphData = useMemo(() => {
    return [
      { stageName: '订单需求', totalCount: 0, abnormalCount: 0, navigateTo: 'delivery' },
      { stageName: '产品', totalCount: 0, abnormalCount: 0, navigateTo: 'optimization' },
      { stageName: '仓库', totalCount: 0, abnormalCount: 0 },
      { stageName: '物料', totalCount: 0, abnormalCount: 0 },
      { stageName: '供应商', totalCount: 0, abnormalCount: 0, navigateTo: 'evaluation' },
    ] as SupplyChainStageData[];
  }, []);



  // 订单需求弹窗状态
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderModalData, setOrderModalData] = useState<DeliveryOrder[]>([]);
  const [orderModalLoading, setOrderModalLoading] = useState(false);

  // 产品库存弹窗状态
  const [showProductModal, setShowProductModal] = useState(false);
  const [productModalData, setProductModalData] = useState<ProductInventoryResult[]>([]);
  const [productModalLoading, setProductModalLoading] = useState(false);

  // 物料库存弹窗状态
  const [showMaterialModal, setShowMaterialModal] = useState(false);

  // 从配置中心获取指标 ID
  const currentMetricIds = useMemo(() => getMetricIds(), []);

  // 从真实 API 获取各阶段数量
  // Fix: Memoize date range to prevent infinite re-rendering loop
  const last30DaysRange = useMemo(() => createLastDaysRange(30), []);

  const {
    value: orderDemandCountFromApi,
    loading: orderDemandCountLoading,
    error: orderDemandCountError,
  } = useMetricData(currentMetricIds.ORDER_DEMAND_COUNT, {
    instant: true,
    step: '1d',
    transform: latestValueTransform,
    includeModel: true,
    ...last30DaysRange,
  });

  const {
    value: productCountFromApi,
    loading: productCountLoading,
    error: productCountError,
  } = useMetricData(currentMetricIds.PRODUCT_COUNT, {
    instant: true,
    step: '1d',
    transform: latestValueTransform,
  });

  const {
    value: warehouseCountFromApi,
    loading: warehouseCountLoading,
    error: warehouseCountError,
  } = useMetricData(currentMetricIds.WAREHOUSE_COUNT, {
    instant: true,
    transform: latestValueTransform,
  });

  const {
    value: materialCountFromApi,
    loading: materialCountLoading,
    error: materialCountError,
  } = useMetricData(currentMetricIds.MATERIAL_COUNT, {
    instant: true,
    transform: latestValueTransform,
  });

  const {
    value: supplierCountFromApi,
    loading: supplierCountLoading,
    error: supplierCountError,
  } = useMetricData(currentMetricIds.SUPPLIER_COUNT, {
    instant: true,
    transform: latestValueTransform,
  });



  // 更新各阶段的数量为 API 数据，如果失败则使用原始数据
  const graphData = useMemo(() => {
    const updatedData = [...baseGraphData];

    // 更新订单需求
    const orderStageIndex = updatedData.findIndex(stage => stage.stageName === '订单需求');
    if (orderStageIndex !== -1) {
      updatedData[orderStageIndex] = {
        ...updatedData[orderStageIndex],
        totalCount: orderDemandCountFromApi ?? updatedData[orderStageIndex].totalCount,
      };
    }

    // 更新产品
    const productStageIndex = updatedData.findIndex(stage => stage.stageName === '产品');
    if (productStageIndex !== -1) {
      updatedData[productStageIndex] = {
        ...updatedData[productStageIndex],
        totalCount: productCountFromApi ?? updatedData[productStageIndex].totalCount,
      };
    }

    // 更新仓库
    const warehouseStageIndex = updatedData.findIndex(stage => stage.stageName === '仓库');
    if (warehouseStageIndex !== -1) {
      updatedData[warehouseStageIndex] = {
        ...updatedData[warehouseStageIndex],
        totalCount: warehouseCountFromApi ?? updatedData[warehouseStageIndex].totalCount,
      };
    }

    // 更新物料
    const materialStageIndex = updatedData.findIndex(stage => stage.stageName === '物料');
    if (materialStageIndex !== -1) {
      updatedData[materialStageIndex] = {
        ...updatedData[materialStageIndex],
        totalCount: materialCountFromApi ?? updatedData[materialStageIndex].totalCount,
      };
    }

    // 更新供应商
    const supplierStageIndex = updatedData.findIndex(stage => stage.stageName === '供应商');
    if (supplierStageIndex !== -1) {
      updatedData[supplierStageIndex] = {
        ...updatedData[supplierStageIndex],
        totalCount: supplierCountFromApi ?? updatedData[supplierStageIndex].totalCount,
      };
    }

    return updatedData;
  }, [
    baseGraphData,
    orderDemandCountFromApi,
    productCountFromApi,
    warehouseCountFromApi,
    materialCountFromApi,
    supplierCountFromApi,
  ]);

  const stageIcons: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    '订单需求': ShoppingCart,
    '产品': Package,
    '仓库': Warehouse,
    '物料': Box,
    '供应商': Truck,
  };

  const handleCardClick = async (stage: SupplyChainStageData) => {
    // 订单需求 - 弹出数据分析弹窗
    if (stage.stageName === '订单需求') {
      setShowOrderModal(true);
      setOrderModalLoading(true);
      try {
        const orders = await loadDeliveryOrders();
        setOrderModalData(orders);
      } catch (err) {
        console.error('Failed to load orders for modal:', err);
        setOrderModalData([]);
      } finally {
        setOrderModalLoading(false);
      }
      return;
    }

    // 产品 - 弹出产品库存分析弹窗
    if (stage.stageName === '产品') {
      setShowProductModal(true);
      setProductModalLoading(true);
      try {
        // 使用指标模型 API 获取产品库存数据
        const modelId = currentMetricIds.PRODUCT_INVENTORY_DETAIL;
        const timeRange = createLastDaysRange(1);

        const result = await metricModelApi.queryByModelId(
          modelId,
          {
            instant: true,
            start: timeRange.start,
            end: timeRange.end,
            analysis_dimensions: PRODUCT_INVENTORY_DIMENSIONS,
          },
          { includeModel: true }
        );

        // 转换 API 数据为组件期望的格式
        const transformedData: ProductInventoryResult[] = [];

        if (result.datas && result.datas.length > 0) {
          for (const series of result.datas) {
            const materialCode = series.labels?.material_code || '';
            const materialName = series.labels?.material_name || '';
            // 获取 available_quantity：可能在 labels 中作为维度，或在 values 中作为度量值
            let availableQuantity = 0;

            // 优先从 labels 中获取（如果作为维度传递）
            if (series.labels?.available_quantity) {
              availableQuantity = parseFloat(series.labels.available_quantity) || 0;
            }
            // 其次从 values 中获取最新值（如果作为度量值）
            else if (series.values && series.values.length > 0) {
              // 取最后一个非空值
              for (let i = series.values.length - 1; i >= 0; i--) {
                if (series.values[i] !== null) {
                  availableQuantity = series.values[i]!;
                  break;
                }
              }
            }

            transformedData.push({
              productCode: materialCode,
              productName: materialName,
              calculatedStock: Math.floor(availableQuantity),
              details: [],
            });
          }
        }

        // 按库存量降序排序
        transformedData.sort((a, b) => b.calculatedStock - a.calculatedStock);

        setProductModalData(transformedData);
      } catch (err) {
        console.error('Failed to load product inventory from API:', err);
        // API 失败时回退到本地计算
        try {
          const results = await calculateAllProductInventory();
          setProductModalData(results);
        } catch (fallbackErr) {
          console.error('Fallback calculation also failed:', fallbackErr);
          setProductModalData([]);
        }
      } finally {
        setProductModalLoading(false);
      }
      return;
    }

    // 物料 - 弹出物料库存分析弹窗
    if (stage.stageName === '物料') {
      setShowMaterialModal(true);
      return;
    }

    // 其他卡片 - 正常导航
    if (stage.navigateTo && onNavigate) {
      onNavigate(stage.navigateTo);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-800">供应链对象类</h2>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {graphData.map((stage, index) => {
            const Icon = stageIcons[stage.stageName] || Package;
            const hasAbnormal = stage.abnormalCount > 0;

            return (
              <div
                key={index}
                onClick={() => handleCardClick(stage)}
                className={`
                  p-4 rounded-lg border-2 cursor-pointer transition-all
                  ${hasAbnormal
                    ? 'border-red-200 bg-red-50 hover:bg-red-100'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }
                `}
              >
                <div className="flex items-center justify-between mb-3">
                  <Icon
                    size={24}
                    className={hasAbnormal ? 'text-red-600' : 'text-slate-600'}
                  />
                  <span className="text-xs font-medium text-slate-500">{stage.stageName}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-baseline gap-2">
                    {(() => {
                      let isLoading = false;
                      let error = null;
                      if (stage.stageName === '订单需求') { isLoading = orderDemandCountLoading; error = orderDemandCountError; }
                      else if (stage.stageName === '产品') { isLoading = productCountLoading; error = productCountError; }
                      else if (stage.stageName === '仓库') { isLoading = warehouseCountLoading; error = warehouseCountError; }
                      else if (stage.stageName === '物料') { isLoading = materialCountLoading; error = materialCountError; }
                      else if (stage.stageName === '供应商') { isLoading = supplierCountLoading; error = supplierCountError; }

                      if (isLoading) {
                        return (
                          <div className="flex items-center gap-2">
                            <Loader2 className="animate-spin text-slate-400" size={16} />
                            <span className="text-sm text-slate-400">加载中...</span>
                          </div>
                        );
                      }

                      if (error) {
                        return (
                          <div className="flex flex-col">
                            <span className="text-lg font-bold text-red-600">Error</span>
                            <span className="text-xs text-red-500 truncate max-w-[100px]" title={error}>{error || '加载失败'}</span>
                          </div>
                        );
                      }

                      return (
                        <>
                          <span className="text-2xl font-bold text-slate-800">{stage.totalCount}</span>
                          <span className="text-sm text-slate-600">总数</span>
                        </>
                      );
                    })()}
                  </div>
                  {hasAbnormal && (
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-red-600">{stage.abnormalCount}</span>
                      <span className="text-xs text-red-600 font-medium">异常</span>
                    </div>
                  )}
                  {!hasAbnormal && (
                    <div className="text-xs text-green-600 font-medium">正常</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 订单需求数据分析弹窗 */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-indigo-50/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <BarChart3 className="text-indigo-600" size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">订单需求分析</h3>
                  <p className="text-xs text-slate-500">
                    数据分析与洞察
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowOrderModal(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {orderModalLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <Loader2 className="animate-spin text-indigo-600 mx-auto mb-4" size={32} />
                    <p className="text-slate-600">加载订单数据中...</p>
                  </div>
                </div>
              ) : orderModalData.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-slate-500">暂无订单数据</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5">
                  <OrderDemandCharts orders={orderModalData} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 产品库存分析弹窗 */}
      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-green-50/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Package className="text-green-600" size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">产品库存分析</h3>
                  <p className="text-xs text-slate-500">
                    基于指标模型实时查询
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowProductModal(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {productModalLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <Loader2 className="animate-spin text-green-600 mx-auto mb-4" size={32} />
                    <p className="text-slate-600">获取产品库存中...</p>
                  </div>
                </div>
              ) : productModalData.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <p className="text-slate-500">暂无产品数据</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-5">
                  <ProductInventoryCharts products={productModalData} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 物料库存分析弹窗 */}
      {showMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-orange-50/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Box className="text-orange-600" size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">物料库存分析</h3>
                  <p className="text-xs text-slate-500">
                    物料库存状态与呆滞分析
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMaterialModal(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-5">
                <MaterialInventoryCharts />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplyChainGraphPanel;

