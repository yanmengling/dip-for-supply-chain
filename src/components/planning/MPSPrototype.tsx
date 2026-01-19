/**
 * MPS (Master Production Schedule) Prototype Component
 * 
 * 生产计划MPS原型设计，核心功能：
 * 1. 产品列表可选择，默认选择第一个产品
 * 2. 显示产品的生产计划量（来自需求计划的产品共识需求，未来3个月未完成的）
 * 3. 显示产品的库存量、安全库存量、月度产品生产产能、在手订单量
 * 4. 显示该产品当前生产计划的甘特图（按BOM展开）
 * 5. 计算产品合计出货周期
 */

import { useState, useMemo, useEffect } from 'react';
import { Package, AlertTriangle } from 'lucide-react';
import type { BOMItem, GanttTask, ProductionPlanMode, MaterialReadyGanttTask, MaterialReadyCalculationResult } from '../../types/ontology';
import { fetchProductList, buildPlanInfo, fetchMaterialReadyV2Data } from '../../services/mpsDataService';
import { calculateMaterialReadyModeV2 } from '../../utils/materialReadyCalculatorV2';
import { calculateDefaultMode, type DefaultModeCalculationResult } from '../../utils/defaultModeCalculator';
import { ProductSelector } from './ProductSelector';
import { ProductInfoPanel } from './ProductInfoPanel';
import { GanttChartSection } from './GanttChartSection';
import { PlanModeSelector } from './PlanModeSelector';
import { GanttHeader } from './GanttHeader';
import { monitorLoadTime } from '../../utils/mpsPerformanceMonitor';
// ============================================================================
// 类型定义（使用ontology.ts中的类型）
// ============================================================================

/** 产品信息（与ProductInfoPanel兼容） */
interface Product {
  id: string;
  name: string;
  /** 库存量 */
  inventory: number;
  /** 安全库存量 */
  safetyStock: number;
  /** 在手订单量（累计签约数量 - 累计发货数量） */
  orderQuantity: number;
  /** 生产计划量 */
  plannedQuantity: number;
  /** 计划开始时间 */
  planStartTime?: string;
  /** 计划结束时间 */
  planEndTime?: string;
  /** BOM结构 */
  bom: BOMItem[];
}

// ============================================================================
// 组件
// ============================================================================

const MPSPrototype = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [loadStartTime, setLoadStartTime] = useState<number>(0);
  const [hoveredTask, setHoveredTask] = useState<GanttTask | MaterialReadyGanttTask | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);

  // 计划模式状态
  const [planMode, setPlanMode] = useState<ProductionPlanMode>('default');

  // 共享数据（两种模式都需要）
  const [sharedData, setSharedData] = useState<{
    product: any;
    productionPlan: any;
    bomItems: BOMItem[];
    materialDetails: Map<string, any>;
    inventoryMap: Map<string, number>;
  } | null>(null);

  // 默认模式计算结果
  const [defaultResult, setDefaultResult] = useState<DefaultModeCalculationResult | null>(null);

  // 齐套模式V2计算结果
  const [v2Result, setV2Result] = useState<MaterialReadyCalculationResult | null>(null);

  // 产品列表加载由ProductSelector组件内部处理（使用和DP面板相同的逻辑）

  // 加载选中产品的完整数据（包括BOM、物料详情、库存、生产计划）
  useEffect(() => {
    if (!selectedProductId) {
      console.log(`[MPSPrototype] ⏸️ 未选择产品，跳过数据加载`);
      return;
    }

    const loadProductData = async () => {
      const startTime = performance.now();
      setLoadStartTime(startTime);

      console.log(`[MPSPrototype] ========== 开始加载产品完整数据 ==========`);
      console.log(`[MPSPrototype] 产品ID: ${selectedProductId}`);
      console.log(`[MPSPrototype] 重试次数: ${retryCount}`);

      try {
        setLoading(true);
        setError(null);

        // 1. 获取产品列表以获取产品名称
        console.log(`[MPSPrototype] 步骤1: 获取产品列表...`);
        const productList = await fetchProductList();
        const productInfo = productList.find(p => p.product_code === selectedProductId);

        if (!productInfo) {
          throw new Error(`未找到产品: ${selectedProductId}`);
        }

        console.log(`[MPSPrototype] ✅ 找到产品: ${productInfo.product_name} (${productInfo.product_code})`);

        // 2. 获取计划信息（库存、安全库存、计划数量等）
        console.log(`[MPSPrototype] 步骤2: 获取计划信息...`);
        const planInfo = await buildPlanInfo(selectedProductId, productInfo.product_name);
        console.log(`[MPSPrototype] ✅ 计划信息:`, {
          inventory: planInfo.inventoryQuantity,
          safetyStock: planInfo.safetyStock,
          plannedQuantity: planInfo.productionPlanQuantity,
          pendingOrderQuantity: planInfo.pendingOrderQuantity,
        });

        // 3. 获取完整数据（产品扩展信息、生产计划、BOM、物料详情、库存）
        console.log(`[MPSPrototype] 步骤3: 获取完整数据（物料详情、库存、生产计划）...`);
        const data = await fetchMaterialReadyV2Data(selectedProductId);
        console.log(`[MPSPrototype] ✅ 完整数据加载完成:`, {
          hasProduct: !!data.product,
          hasProductionPlan: !!data.productionPlan,
          bomCount: data.bomItems.length,
          materialDetailsCount: data.materialDetails.size,
          inventoryCount: data.inventoryMap.size,
        });

        // 保存共享数据
        setSharedData(data);

        // 4. 构建Product对象用于ProductInfoPanel
        const product: Product = {
          id: selectedProductId,
          name: `${productInfo.product_code}-${productInfo.product_name}`,
          inventory: planInfo.inventoryQuantity,
          safetyStock: planInfo.safetyStock,
          orderQuantity: planInfo.pendingOrderQuantity,
          plannedQuantity: planInfo.productionPlanQuantity,
          planStartTime: data.productionPlan?.start_time,
          planEndTime: data.productionPlan?.end_time,
          bom: data.bomItems,
        };

        setProducts([product]);

        // 5. 计算两种模式的结果
        if (data.product && data.productionPlan) {
          // 计算默认模式（正排）
          console.log(`[MPSPrototype] 步骤4: 计算默认模式...`);
          const defaultModeResult = calculateDefaultMode(
            data.product,
            data.productionPlan,
            data.bomItems,
            data.materialDetails,
            data.inventoryMap
          );
          setDefaultResult(defaultModeResult);
          console.log(`[MPSPrototype] ✅ 默认模式计算完成:`, {
            totalCycle: defaultModeResult.totalCycle,
            isOverdue: defaultModeResult.isOverdue,
            overdueDays: defaultModeResult.overdueDays,
          });

          // 计算齐套模式V2（倒排）
          console.log(`[MPSPrototype] 步骤5: 计算齐套模式V2...`);
          const v2ModeResult = calculateMaterialReadyModeV2(
            data.product,
            data.productionPlan,
            data.bomItems,
            data.materialDetails,
            data.inventoryMap
          );
          setV2Result(v2ModeResult);
          console.log(`[MPSPrototype] ✅ 齐套模式V2计算完成:`, {
            totalCycle: v2ModeResult.totalCycle,
            isOverdue: v2ModeResult.isOverdue,
            overdueDays: v2ModeResult.overdueDays,
            readyCount: v2ModeResult.readyMaterials.length,
            notReadyCount: v2ModeResult.notReadyMaterials.length,
          });
        }

        monitorLoadTime(startTime);
        setRetryCount(0);

        console.log(`[MPSPrototype] ========== 数据加载成功 ==========`);
        console.log(`[MPSPrototype] 加载耗时: ${(performance.now() - startTime).toFixed(2)}ms`);
      } catch (err) {
        console.error(`[MPSPrototype] ========== 数据加载失败 ==========`);
        console.error(`[MPSPrototype] 错误:`, err);

        const errorMessage = err instanceof Error ? err.message : '加载产品数据失败';
        setError(errorMessage);

        if (retryCount < 2) {
          console.log(`[MPSPrototype] 🔄 准备第${retryCount + 1}次重试...`);
          setTimeout(() => {
            setRetryCount(prev => prev + 1);
          }, 1000 * (retryCount + 1));
        } else {
          console.error(`[MPSPrototype] ❌ 已达到最大重试次数，停止重试`);
        }
      } finally {
        setLoading(false);
        console.log(`[MPSPrototype] ========== 数据加载流程结束 ==========`);
      }
    };

    loadProductData();
  }, [selectedProductId, retryCount]);

  const selectedProduct = useMemo(
    () => {
      if (!selectedProductId) return null;
      return products.find(p => p.id === selectedProductId) || products[0] || null;
    },
    [products, selectedProductId]
  );

  // 计算库存状态
  // 规则：
  // 1. 如果在手订单量 < 生产计划量+库存量，则继续下单可直接供应
  // 2. 如果在手订单量 >= 生产计划量+库存量，则需要提示增加生产计划
  const inventoryStatus = useMemo(() => {
    if (!selectedProduct) {
      return {
        totalAvailable: 0,
        isSufficient: false,
        needsProduction: true
      };
    }
    const totalAvailable = selectedProduct.plannedQuantity + selectedProduct.inventory;
    const isSufficient = selectedProduct.orderQuantity < totalAvailable;
    return {
      totalAvailable,
      isSufficient,
      needsProduction: !isSufficient
    };
  }, [selectedProduct]);

  // 根据当前模式获取计算结果
  const currentResult = useMemo(() => {
    if (planMode === 'material-ready-v2') {
      return v2Result;
    }
    return defaultResult;
  }, [planMode, defaultResult, v2Result]);

  // 如果没有选中产品，显示等待选择状态
  if (!selectedProductId) {
    return (
      <div className="space-y-6">
        <ProductSelector
          selectedProductId={selectedProductId}
          onSelectionChange={setSelectedProductId}
        />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Package className="text-slate-400 mx-auto mb-4" size={48} />
            <p className="text-slate-600">请选择产品以查看生产计划</p>
          </div>
        </div>
      </div>
    );
  }

  // 如果正在加载BOM数据，显示加载状态
  if (loading) {
    const loadTime = loadStartTime > 0 ? Math.round((performance.now() - loadStartTime) / 1000) : 0;
    return (
      <div className="space-y-6">
        <ProductSelector
          selectedProductId={selectedProductId}
          onSelectionChange={setSelectedProductId}
        />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto mb-4"></div>
            <p className="text-slate-600 mb-1">正在加载产品BOM数据...</p>
            {loadTime > 0 && (
              <p className="text-xs text-slate-400">已用时 {loadTime} 秒</p>
            )}
            {retryCount > 0 && (
              <p className="text-xs text-yellow-600 mt-2">正在重试（第{retryCount}次）...</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 如果加载失败，显示错误状态
  if (error && retryCount >= 2) {
    return (
      <div className="space-y-6">
        <ProductSelector
          selectedProductId={selectedProductId}
          onSelectionChange={setSelectedProductId}
        />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center max-w-md p-6 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle className="text-red-500 mx-auto mb-4" size={48} />
            <p className="text-red-600 font-semibold mb-2">BOM数据加载失败</p>
            <p className="text-sm text-red-700 mb-4">{error}</p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setRetryCount(0);
                  setError(null);
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                重试加载
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 如果没有产品BOM数据，显示提示
  if (products.length === 0) {
    return (
      <div className="space-y-6">
        <ProductSelector
          selectedProductId={selectedProductId}
          onSelectionChange={setSelectedProductId}
        />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Package className="text-slate-400 mx-auto mb-4" size={48} />
            <p className="text-slate-600">暂无产品BOM数据</p>
            <p className="text-sm text-slate-500 mt-2">请检查产品 {selectedProductId} 的BOM数据是否存在</p>
          </div>
        </div>
      </div>
    );
  }

  // 如果没有选中的产品对象，显示初始化状态
  if (!selectedProduct) {
    return (
      <div className="space-y-6">
        <ProductSelector
          selectedProductId={selectedProductId}
          onSelectionChange={setSelectedProductId}
        />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-slate-600">正在初始化产品数据...</p>
          </div>
        </div>
      </div>
    );
  }

  // 根据模式选择要显示的数据
  const isV2Mode = planMode === 'material-ready-v2';
  const displayTasks = currentResult?.tasks || [];
  const displayCycle = currentResult?.totalCycle || 0;

  return (
    <div className="space-y-6">
      <ProductSelector
        selectedProductId={selectedProductId}
        onSelectionChange={setSelectedProductId}
      />

      <ProductInfoPanel
        product={selectedProduct}
        inventoryStatus={inventoryStatus}
      />

      {/* 计划模式选择器 */}
      <PlanModeSelector
        currentMode={planMode}
        onModeChange={setPlanMode}
        disabled={loading}
      />

      {/* 顶部信息栏（两种模式都显示） */}
      {currentResult && (
        <GanttHeader
          productCode={selectedProductId || ''}
          productName={selectedProduct.name}
          planStartDate={currentResult.planStartDate}
          planEndDate={currentResult.planEndDate}
          actualStartDate={currentResult.actualStartDate}
          actualEndDate={currentResult.actualEndDate}
          isOverdue={currentResult.isOverdue}
          overdueDays={currentResult.overdueDays}
          totalCycle={currentResult.totalCycle}
        />
      )}

      {/* 甘特图 */}
      {currentResult && (
        <GanttChartSection
          tasks={displayTasks as GanttTask[]}
          totalCycle={displayCycle}
          hoveredTask={hoveredTask}
          tooltipPosition={tooltipPosition}
          onTaskHover={(task, position) => {
            setHoveredTask(task);
            setTooltipPosition(position);
          }}
          onTaskLeave={() => {
            setHoveredTask(null);
            setTooltipPosition(null);
          }}
          mode={planMode}
        />
      )}

    </div>
  );
};

export default MPSPrototype;
