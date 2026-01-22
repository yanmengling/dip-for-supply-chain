/**
 * Material Inventory Panel
 * 
 * Displays material inventory summary including total count, stagnant materials,
 * top 10 materials by stock, and optimization recommendations.
 */

import { useMemo } from 'react';
import { Box, ArrowRight, Loader2 } from 'lucide-react';
import { getMaterialInventorySummary } from '../../utils/cockpitDataService';
import { materialsData, materialStocksData } from '../../utils/entityConfigService';
import { calculateMaterialLogicRules } from '../../utils/logicRuleService';
import { generateMaterialRecommendations } from '../../utils/recommendationService';
import { useMetricData, useDimensionMetricData, latestValueTransform } from '../../hooks/useMetricData';
import { apiConfigService } from '../../services/apiConfigService';

// 获取指标 ID 的辅助函数
const getMetricIds = () => {
  try {
    const metrics = apiConfigService.getMetricModelConfigs();

    // 查找物料库存量指标 (标签: material, inventory_data)
    const stockMetric = metrics.find(m =>
      m.tags?.includes('material') &&
      m.tags?.includes('inventory_data')
    );

    const typeMetric = metrics.find(m => m.tags?.includes('material') && m.tags?.includes('count'));

    return {
      // 物料库存量
      TOTAL_MATERIAL_STOCK: stockMetric?.modelId || 'd58je8lg5lk40hvh48n0',
      // 其他指标
      TOTAL_MATERIAL_TYPES: typeMetric?.modelId || 'd58ihclg5lk40hvh48mg',
      STAGNANT_MATERIALS: 'd58jomlg5lk40hvh48o0',
    };
  } catch (error) {
    console.warn('[MaterialInventoryPanel] Failed to load metric IDs, using defaults');
    return {
      TOTAL_MATERIAL_STOCK: 'd58je8lg5lk40hvh48n0',
      TOTAL_MATERIAL_TYPES: 'd58ihclg5lk40hvh48mg',
      STAGNANT_MATERIALS: 'd58jomlg5lk40hvh48o0',
    };
  }
};

interface Props {
  onNavigate?: (view: string) => void;
}

const MaterialInventoryPanel = ({ onNavigate }: Props) => {
  // 动态获取指标 ID
  const currentMetricIds = useMemo(() => getMetricIds(), []);

  const summary = {
    totalTypes: 0,
    totalStock: 0,
    top10ByStock: [],
    stagnantCount: 0,
    stagnantPercentage: 0,
    stagnantDetails: [],
  };





  // 从真实 API 获取物料总种类数（item_type=Material 的数量）
  // 对 Hook 选项进行 memo，避免每次 render 传入新对象导致 useEffect 触发
  const materialTypesOptions = useMemo(() => ({
    instant: true,
    transform: latestValueTransform,
  }), []);

  const {
    value: totalMaterialTypesFromApi,
    loading: totalMaterialTypesLoading,
    error: totalMaterialTypesError,
  } = useMetricData(currentMetricIds.TOTAL_MATERIAL_TYPES, materialTypesOptions);

  // 调试：打印API调用结果
  if (import.meta.env.DEV) {
    console.log('[MaterialInventoryPanel] API调用结果:', {
      modelId: currentMetricIds.TOTAL_MATERIAL_TYPES,
    });
  }

  // 使用 API 数据，如果失败则回退到 mock 数据
  const totalMaterialTypes = totalMaterialTypesFromApi ?? summary.totalTypes;

  // 在供应链大脑模式下，直接获取总库存量（API不支持维度分析）
  // 在Mock模式下，通过维度分析获取详细数据
  const stockOptions = useMemo(() => ({
    instant: true,
    transform: latestValueTransform,
  }), []);

  const {
    value: totalMaterialStockFromApi,
    loading: totalMaterialStockLoading,
    error: totalMaterialStockError,
  } = useMetricData(
    currentMetricIds.TOTAL_MATERIAL_STOCK,
    stockOptions
  );

  // 从真实 API 获取物料库存排名
  // Mock模式：按 item_name 分组
  // 大脑模式：按 material_name 和 inventory_data 分组
  const rankingDimensions = useMemo(() => ['material_code', 'material_name', 'inventory_data'], []);
  const rankingOptions = useMemo(() => ({ instant: true }), []);

  const {
    items: materialStockRankingItems,
    loading: materialStockRankingLoading,
    error: materialStockRankingError,
  } = useDimensionMetricData(
    currentMetricIds.TOTAL_MATERIAL_STOCK,
    rankingDimensions,
    rankingOptions
  );

  // 计算总库存量
  // 计算总库存量
  const totalMaterialStock = useMemo(() => {
    // 大脑模式：直接使用API返回的总量
    return totalMaterialStockFromApi ?? summary.totalStock;
  }, [totalMaterialStockFromApi, summary.totalStock]);

  // 取前10名
  const top10MaterialStockItems = materialStockRankingItems.slice(0, 10);


  // 从真实 API 获取呆滞物料详细情况（只在Mock模式下）
  // 过滤出库龄超过115天的物料，并按库龄降序排序
  const stagnantMaterials = useMemo(() => {
    // 大脑模式：没有详细数据，返回空数组
    return [];
  }, []);

  // 计算呆滞物料统计
  const stagnantStats = useMemo(() => {
    // 大脑模式：直接返回0
    return { count: 0, percentage: 0 };
  }, []);

  // Calculate recommendations for all materials
  const allRecommendations = useMemo(() => {
    const recommendations = new Set<string>();
    materialsData.forEach(material => {
      const stock = materialStocksData.find(ms => ms.materialCode === material.materialCode);
      const rules = calculateMaterialLogicRules(material, stock);
      const materialRecs = generateMaterialRecommendations(rules);
      materialRecs.forEach(rec => recommendations.add(rec));
    });
    return Array.from(recommendations);
  }, []);

  const handleViewDetails = () => {
    if (onNavigate) {
      onNavigate('inventory');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">物料库存智能体</h2>
        <button
          onClick={handleViewDetails}
          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
        >
          查看详情
          <ArrowRight size={14} />
        </button>
      </div>
      <div className="p-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Box className="text-slate-600" size={20} />
              <span className="text-sm text-slate-600">总种类数</span>
            </div>
            {totalMaterialTypesLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin text-slate-400" size={20} />
                <span className="text-sm text-slate-400">加载中...</span>
              </div>
            ) : totalMaterialTypesError ? (
              <div>
                <p className="text-2xl font-bold text-red-600">Error</p>
                <p className="text-xs text-red-500 mt-1">加载失败</p>
              </div>
            ) : (
              <p className="text-2xl font-bold text-slate-800">{totalMaterialTypes}</p>
            )}
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Box className="text-slate-600" size={20} />
              <span className="text-sm text-slate-600">总库存量</span>
            </div>
            {totalMaterialStockLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin text-slate-400" size={20} />
                <span className="text-sm text-slate-400">加载中...</span>
              </div>
            ) : totalMaterialStockError ? (
              <div>
                <p className="text-2xl font-bold text-red-600">Error</p>
                <p className="text-xs text-red-500 mt-1">
                  {totalMaterialStockError || '加载失败'}
                </p>
              </div>
            ) : (
              <p className="text-2xl font-bold text-slate-800">{totalMaterialStock?.toLocaleString() ?? 0}个</p>
            )}
          </div>
        </div>

        {/* Stagnant Materials - 使用真实 API 数据 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">呆滞物料情况</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-600 font-medium">
                0种 (0.0%)
              </span>
            </div>
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            <div className="text-sm text-slate-400 p-2">
              暂无详细数据
            </div>
          </div>
        </div>

        {/* Top 10 by Stock - 使用真实 API 数据 */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3">库存量排名前十</h3>
          <div className="space-y-2">
            {materialStockRankingLoading ? (
              <div className="flex items-center gap-2 p-4">
                <Loader2 className="animate-spin text-slate-400" size={20} />
                <span className="text-sm text-slate-400">加载中...</span>
              </div>
            ) : materialStockRankingError ? (
              <div className="text-sm text-red-500 p-2 bg-red-50 rounded">
                数据加载失败: {materialStockRankingError || '未知错误'}
              </div>
            ) : top10MaterialStockItems.length > 0 ? (
              // 使用真实 API 数据
              top10MaterialStockItems.map((item, index) => {
                // 尝试多个可能的字段名
                const materialCode = item.labels.material_code
                  || item.labels.item_code
                  || item.labels.code
                  || '';

                const materialName = item.labels.material_name
                  || item.labels.inventory_data
                  || item.labels.item_name
                  || '未知物料';

                return (
                  <div key={index} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                    <div className="flex-1">
                      <div className="text-xs text-slate-500 font-mono">{materialCode}</div>
                      <div className="text-sm text-slate-700">{materialName}</div>
                    </div>
                    <span className="text-sm font-medium text-slate-800">{item.value ?? 0}个</span>
                  </div>
                );
              })
            ) : (
              <div className="text-sm text-slate-400 p-2">暂无数据</div>
            )}
          </div>
        </div>


      </div>
    </div>
  );
};

export default MaterialInventoryPanel;



