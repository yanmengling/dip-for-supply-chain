// src/components/planningV2/multiProduct/MultiProductGanttTab.tsx

import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Search, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import GanttChart from '../gantt/GanttChart';
import type { MultiProductTask, MultiProductGanttResult } from '../../../types/multiProductTask';
import { flattenGanttBars } from '../../../services/ganttService';

interface MultiProductGanttTabProps {
  task: MultiProductTask;
  result: MultiProductGanttResult | null;
  isLoading: boolean;
  onMaterialClick?: (materialCode: string) => void;
}

/**
 * Tab1：多产品甘特图。
 * 每个产品是一个可折叠分组，默认全部折叠。支持搜索/过滤（按产品编码或名称）。
 */
export const MultiProductGanttTab: React.FC<MultiProductGanttTabProps> = ({
  task,
  result,
  isLoading,
  onMaterialClick,
}) => {
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState('');

  const toggleProduct = (productCode: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productCode)) next.delete(productCode);
      else next.add(productCode);
      return next;
    });
  };

  const filteredProducts = useMemo(() => {
    if (!searchText.trim()) return task.products;
    const q = searchText.toLowerCase();
    return task.products.filter(
      p => p.productCode.toLowerCase().includes(q) || p.productName.toLowerCase().includes(q)
    );
  }, [task.products, searchText]);

  // 共用物料编码集合，传给 GanttChart 显示 badge
  const sharedMaterialCodes = useMemo(
    () => result ? new Set(result.sharedMaterials.keys()) : undefined,
    [result]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        正在加载 {task.products.length} 个产品的甘特图...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 搜索栏 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="搜索产品编码或名称..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
        </div>
        <span className="text-xs text-slate-400">
          {filteredProducts.length} / {task.products.length} 个产品
        </span>
        <button
          onClick={() => setExpandedProducts(new Set(filteredProducts.map(p => p.productCode)))}
          className="text-xs text-indigo-500 hover:text-indigo-700"
        >
          全部展开
        </button>
        <button
          onClick={() => setExpandedProducts(new Set())}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          全部折叠
        </button>
      </div>

      {/* 产品甘特图列表 */}
      {filteredProducts.map(product => {
        const entry = result?.productGantts.get(product.productCode);
        const isExpanded = expandedProducts.has(product.productCode);

        // 计算齐套状态
        let shortageCount = 0;
        if (entry?.loaded && entry.bars.length > 0) {
          const allBars = flattenGanttBars(entry.bars).filter(b => b.bomLevel > 0);
          shortageCount = allBars.filter(
            b => b.supplyStatus === 'shortage' || b.supplyStatus === 'anomaly'
          ).length;
        }

        // 该产品是否涉及库存不足的共用物料
        const hasSharedAllocationIssue = result
          ? Array.from(result.sharedMaterials.values()).some(
              sm => !sm.canFulfillAll && sm.relatedProducts.some(p => p.productCode === product.productCode)
            )
          : false;

        return (
          <div key={product.productCode} className="border border-slate-200 rounded-lg overflow-hidden">
            {/* 产品分组标题行 */}
            <button
              onClick={() => toggleProduct(product.productCode)}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              {isExpanded
                ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
              }
              <span className="font-medium text-slate-700 text-sm">{product.productName}</span>
              <span className="text-slate-400 text-xs">({product.productCode})</span>
              <span className="text-slate-500 text-xs ml-2">
                预测 {product.qty.toLocaleString()} 件 · 交期 {product.endDate}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                {hasSharedAllocationIssue && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> 共用物料不足
                  </span>
                )}
                {entry?.loaded && shortageCount === 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> 已齐套
                  </span>
                )}
                {entry?.loaded && shortageCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
                    缺料 {shortageCount} 项
                  </span>
                )}
                {entry && !entry.loaded && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-200">
                    BOM数据缺失
                  </span>
                )}
              </div>
            </button>

            {/* 甘特图内容 */}
            {isExpanded && entry && (
              <div className="border-t border-slate-100">
                {entry.loaded && entry.bars.length > 0 ? (
                  <GanttChart
                    bars={entry.bars}
                    productionStart={product.startDate}
                    productionEnd={product.endDate}
                    productName={product.productName}
                    sharedMaterialCodes={sharedMaterialCodes}
                    onMaterialClick={onMaterialClick}
                  />
                ) : (
                  <div className="px-4 py-6 text-sm text-slate-400 text-center">
                    {entry.errorMsg ?? '无甘特图数据'}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {filteredProducts.length === 0 && (
        <div className="text-center py-8 text-sm text-slate-400">未找到匹配的产品</div>
      )}
    </div>
  );
};
