// src/components/planningV2/multiProduct/SharedMaterialPanel.tsx

import React, { useState } from 'react';
import { Star } from 'lucide-react';
import type { SharedMaterial } from '../../../types/multiProductTask';
import { AllocationBadge } from './AllocationBadge';

interface SharedMaterialPanelProps {
  material: SharedMaterial;
}

function BomPathPanel({ relatedProducts }: { relatedProducts: SharedMaterial['relatedProducts'] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-indigo-200 overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-slate-500 bg-white hover:bg-indigo-50 transition-colors"
      >
        <span className="text-indigo-400 text-[11px] leading-none flex-shrink-0">{open ? '▼' : '▶'}</span>
        BOM 展开路径
      </button>
      {open && (
        <div className="bg-white border-t border-indigo-100 px-3 py-2 space-y-1 pl-4 border-l-2 border-l-indigo-300">
          {relatedProducts.map(p => (
            <div key={p.productCode} className="text-slate-500 flex items-baseline gap-1.5 flex-wrap">
              <span className="text-slate-400">{p.productName}：</span>
              <span>{p.bomPath}</span>
              <span className="text-slate-400">= {p.requiredQty.toLocaleString()} 个</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 共用物料展开详情面板。
 * 展示：关联产品列表（各产品折算需求量 + 交期）、需求总量 vs MRP数量、倒排基准产品标注、BOM路径。
 * 默认收缩，点击标题展开。
 */
export const SharedMaterialPanel: React.FC<SharedMaterialPanelProps> = ({ material }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-indigo-50 border-t border-indigo-100">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 w-full px-4 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
      >
        <span className="text-indigo-500 text-[11px] leading-none flex-shrink-0">{open ? '▼' : '▶'}</span>
        <span>关联产品（{material.relatedProducts.length} 个）</span>
      </button>
      {open && (
    <div className="px-4 pb-3 space-y-3">

      {/* 关联产品列表 */}
      <div>
        <div className="text-xs font-medium text-indigo-600 mb-1.5">关联产品（按交期排序）</div>
        <div className="space-y-1">
          {material.relatedProducts.map(p => (
            <div key={p.productCode} className="flex items-center gap-2 text-xs">
              {p.productCode === material.anchorProductCode ? (
                <span title="倒排基准产品（最早交期）" className="flex-shrink-0"><Star className="w-3 h-3 text-amber-500" /></span>
              ) : (
                <span className="w-3 h-3 flex-shrink-0" />
              )}
              <span className="text-slate-700 min-w-0 truncate flex-1">
                {p.productName}
                <span className="text-slate-400 ml-1">({p.productCode})</span>
              </span>
              <span className="text-slate-500 flex-shrink-0">预测 {p.qty.toLocaleString()} 件</span>
              <span className="text-slate-500 flex-shrink-0">交期 {p.endDate}</span>
              <span className="text-slate-500 flex-shrink-0">BOM需 {p.requiredQty.toLocaleString()} 个</span>
            </div>
          ))}
        </div>
      </div>

      {/* 需求总量 vs MRP 数量 */}
      <div className="flex items-center gap-4 text-xs bg-white rounded border border-indigo-200 px-3 py-2 flex-wrap">
        <div>
          <span className="text-slate-500">BOM展开需求总量</span>
          <span className="font-medium text-slate-800 ml-1">{material.totalRequiredQty.toLocaleString()} 个</span>
        </div>
        {material.mrpQty !== null && (
          <>
            <div className="text-slate-300">|</div>
            <div>
              <span className="text-slate-500">MRP修正数量</span>
              <span className="font-medium text-slate-800 ml-1">{material.mrpQty.toLocaleString()} 个</span>
            </div>
            {material.qtyDiff !== null && material.qtyDiff !== 0 && (
              <>
                <div className="text-slate-300">|</div>
                <div>
                  <span className="text-slate-500">差异</span>
                  <span className={`font-medium ml-1 ${material.qtyDiff > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    {material.qtyDiff > 0 ? '+' : ''}{material.qtyDiff.toLocaleString()} 个
                  </span>
                </div>
              </>
            )}
          </>
        )}
        {material.mrpQty === null && (
          <span className="text-slate-400">（无MRP数据）</span>
        )}
      </div>

      {/* 倒排基准说明 */}
      <div className="text-xs text-slate-500 flex items-center gap-1">
        <Star className="w-3 h-3 text-amber-500" />
        倒排基准产品：
        {(() => {
          const anchor = material.relatedProducts.find(p => p.productCode === material.anchorProductCode);
          return anchor
            ? <span className="text-slate-700">{anchor.productName}（最早交期 {anchor.endDate}）</span>
            : <span className="text-slate-700">{material.anchorProductCode}</span>;
        })()}
        —— 该物料最晚到货时间以此产品交期为基准
      </div>

      {/* 分配建议 */}
      {material.allocationSuggestion && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">库存不足，</span>
          <AllocationBadge suggestion={material.allocationSuggestion} />
        </div>
      )}

      {/* BOM 路径（默认折叠）*/}
      <BomPathPanel relatedProducts={material.relatedProducts} />

    </div>
      )}
    </div>
  );
};
