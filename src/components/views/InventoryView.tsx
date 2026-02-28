import { useState, useMemo, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { materialsData, productsData } from '../../utils/entityConfigService';
import { useDimensionMetricData } from '../../hooks/useMetricData';
import { metricModelApi, createCurrentYearRange, createLastDaysRange } from '../../api';
import type { Label } from '../../api/metricModelApi';
import type { Product, Material } from '../../types/ontology';

import { calculateAllProductInventory } from '../../services/productInventoryCalculator';

// Sub-components
import { ProductInventoryPanel } from './inventory/ProductInventoryPanel';
import { MaterialInventoryPanel } from './inventory/MaterialInventoryPanel';

import { BOMInventoryTree } from './inventory/BOMInventoryTree';
import InventoryAIAnalysisPanel from './inventory/InventoryAIAnalysisPanel';

// 验证指标模型ID是否存在
const validateMetricModel = async (modelId: string) => {
  try {
    const range = createLastDaysRange(1);
    const result = await metricModelApi.queryByModelId(
      modelId,
      { instant: true, start: range.start, end: range.end },
      { includeModel: true }
    );
    return { exists: true, model: result.model, error: null };
  } catch (err) {
    return { exists: false, model: null, error: err };
  }
};

import { apiConfigService } from '../../services/apiConfigService';

// 动态获取指标模型ID
const getProductInventoryMetricId = () => apiConfigService.getMetricModelId('mm_product_inventory_optimization') || 'd58keb5g5lk40hvh48og';
const getMaterialInventoryMetricId = () => apiConfigService.getMetricModelId('mm_material_inventory_optimization') || 'd58je8lg5lk40hvh48n0';

// ── 模块级结果缓存（3 分钟 TTL，页面切换时不重复请求）─────────────────────
const _INV_VIEW_CACHE_TTL = 3 * 60 * 1000;
let _allProductsCache: any[] | null = null;
let _allProductsCacheTime = 0;
let _matDimsCache: string[] | null = null;
let _matDimsCacheTime = 0;

interface Props {
  toggleCopilot?: () => void;
}

const InventoryView = ({ toggleCopilot }: Props) => {
  // Modal state for BOM Inventory Tree




  const _prodValid = !!(_allProductsCache && Date.now() - _allProductsCacheTime < _INV_VIEW_CACHE_TTL);
  const [products, setProducts] = useState<any[]>(_prodValid ? _allProductsCache! : []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const calculate = async () => {
      // 命中模块级缓存则直接使用
      const now = Date.now();
      if (_allProductsCache && now - _allProductsCacheTime < _INV_VIEW_CACHE_TTL) {
        setProducts(_allProductsCache);
        return;
      }
      try {
        setLoading(true);
        const results = await calculateAllProductInventory();
        _allProductsCache = results;
        _allProductsCacheTime = Date.now();
        setProducts(results);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    calculate();
  }, []);

  // --- Data Fetching Logic (Materials) ---
  const _matDimsValid = !!(_matDimsCache && Date.now() - _matDimsCacheTime < _INV_VIEW_CACHE_TTL);
  const [materialAvailableDimensions, setMaterialAvailableDimensions] = useState<string[]>(_matDimsValid ? _matDimsCache! : []);
  const [materialModelLoading, setMaterialModelLoading] = useState(!_matDimsValid);

  useEffect(() => {
    const fetchMaterialModelInfo = async () => {
      // 命中模块级缓存则直接使用
      const now = Date.now();
      if (_matDimsCache && now - _matDimsCacheTime < _INV_VIEW_CACHE_TTL) {
        setMaterialAvailableDimensions(_matDimsCache);
        setMaterialModelLoading(false);
        return;
      }
      try {
        const metricId = getMaterialInventoryMetricId();
        const validation = await validateMetricModel(metricId);
        if (!validation.exists) {
          setMaterialAvailableDimensions(['item_id', 'item_code', 'item_name', 'warehouse_name']);
          setMaterialModelLoading(false);
          return;
        }
        const range = createLastDaysRange(1);
        const result = await metricModelApi.queryByModelId(
          metricId,
          { instant: true, start: range.start, end: range.end },
          { includeModel: true }
        );
        if (result.model?.analysis_dimensions) {
          const dimensions = result.model.analysis_dimensions.map((dim: Label | string) =>
            typeof dim === 'string' ? dim : dim.name
          );
          _matDimsCache = dimensions;
          _matDimsCacheTime = Date.now();
          setMaterialAvailableDimensions(dimensions);
        } else {
          setMaterialAvailableDimensions(['item_id', 'item_code', 'item_name', 'warehouse_name']);
        }
      } catch (err) {
        setMaterialAvailableDimensions(['item_id', 'item_code', 'item_name', 'warehouse_name']);
      } finally {
        setMaterialModelLoading(false);
      }
    };
    fetchMaterialModelInfo();
  }, []);

  const materialDimensionsToUse = useMemo(() => {
    if (materialAvailableDimensions.length === 0) return [];
    const preferredDimensions = ['item_id', 'item_code', 'item_name', 'material_name', 'material_code', 'warehouse_name', 'max_storage_age'];
    const selectedDimensions = preferredDimensions.filter(dim =>
      materialAvailableDimensions.some(avail => avail.toLowerCase().includes(dim.toLowerCase()) || dim.toLowerCase().includes(avail.toLowerCase()))
    );
    return selectedDimensions.length > 0 ? selectedDimensions.slice(0, 9) : materialAvailableDimensions.slice(0, 9);
  }, [materialAvailableDimensions]);

  const {
    items: materialInventoryItems,
    loading: materialInventoryLoading,
  } = useDimensionMetricData(
    getMaterialInventoryMetricId(),
    materialDimensionsToUse,
    { instant: true, immediate: true }
  );

  const materialsDataFromApi = useMemo(() => {
    if (!materialInventoryItems || materialInventoryItems.length === 0) return null;
    return materialInventoryItems.map((item) => {
      const labels = item.labels || {};
      const currentStock = item.value ?? 0;
      const materialCode = labels.item_code || labels.code || labels.material_code || '';
      const materialName = labels.item_name || labels.name || labels.material_name || '';
      const finalCode = materialCode || `MAT-API-${materialInventoryItems.indexOf(item)}`;
      const finalName = materialName || `物料 ${materialInventoryItems.indexOf(item)}`;
      const mockMaterial = materialsData.find(m => m.materialCode === finalCode || m.materialName === finalName);

      return {
        materialCode: finalCode,
        materialName: finalName,
        currentStock,
        bomId: mockMaterial?.bomId || 'BOM-M-UNKNOWN',
        status: mockMaterial?.status || '正常',
        inventoryDistribution: mockMaterial?.inventoryDistribution || {
          available: Math.floor(currentStock * 0.7),
          locked: Math.floor(currentStock * 0.2),
          inTransit: Math.floor(currentStock * 0.08),
          scrapped: Math.floor(currentStock * 0.02)
        }
      } as Material;
    });
  }, [materialInventoryItems, materialsData]);

  // --- Final Data Aggregation ---
  const finalProductsData = useMemo(() => {
    if (products.length > 0) {
      return products.map(p => ({
        productId: p.productCode,
        productName: p.productName,
        stockQuantity: p.calculatedStock,
        stockUnit: '件',
        status: '销售中',
        bomId: 'BOM-P-API',
        inventoryDistribution: { available: p.calculatedStock, locked: 0, inTransit: 0, scrapped: 0 }
      } as Product));
    }
    return productsData;
  }, [products, productsData]);

  const finalMaterialsData = materialsDataFromApi ?? materialsData;

  const productInventoryData = useMemo(() => {
    return finalProductsData.map(product => {
      let inventoryStatus = product.inventoryStatus || '正常';
      if (!inventoryStatus) {
        const isStagnant = (product.status === '停止服务' && (product.stockQuantity || 0) > 0);
        if (isStagnant) inventoryStatus = '呆滞';
      }
      return { ...product, inventoryStatus };
    });
  }, [finalProductsData]);

  const isActuallyLoading = loading || materialInventoryLoading;



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">库存优化</h1>
      </div>

      {/* Inverse Calculator - Embedded directly */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 h-[700px] overflow-hidden">
        <BOMInventoryTree isEmbedded={true} />
      </div>

      {/* AI Analysis Panel - Full Width */}
      <InventoryAIAnalysisPanel />

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Product Inventory */}
        <div className="space-y-6">
          <ProductInventoryPanel />
        </div>

        {/* Material Inventory */}
        <div className="space-y-6">
          <MaterialInventoryPanel />
        </div>
      </div>



      {toggleCopilot && (
        <button
          onClick={toggleCopilot}
          className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-40"
        >
          <MessageSquare size={24} />
        </button>
      )}
    </div>
  );
};

export default InventoryView;
