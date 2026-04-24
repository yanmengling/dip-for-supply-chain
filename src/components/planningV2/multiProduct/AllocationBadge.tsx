// src/components/planningV2/multiProduct/AllocationBadge.tsx

import React from 'react';
import { Tooltip } from 'antd';
import { AlertTriangle } from 'lucide-react';
import type { AllocationSuggestion } from '../../../types/multiProductTask';

interface AllocationBadgeProps {
  suggestion: AllocationSuggestion;
}

/**
 * 分配建议 badge：在物料卡片和物料清单中显示库存不足时的分配建议。
 * 显示形式：橙色警告图标 + "分配建议" 文字，hover 展示详情 tooltip。
 */
export const AllocationBadge: React.FC<AllocationBadgeProps> = ({ suggestion }) => {
  const tooltipContent = (
    <div className="text-xs space-y-1 max-w-xs">
      <div className="font-medium text-orange-200 mb-1">
        可用库存 {suggestion.availableQty.toLocaleString()} 个，按交期优先分配建议：
      </div>
      {suggestion.allocations.map(a => (
        <div key={a.productCode} className="flex justify-between gap-2">
          <span className="text-slate-300 truncate">{a.productName}</span>
          <span className={a.canFulfill ? 'text-green-400' : 'text-red-400'}>
            {a.suggestedQty.toLocaleString()} / {a.requiredQty.toLocaleString()}
            {a.canFulfill ? ' ✓' : ' ✗'}
          </span>
        </div>
      ))}
      <div className="text-slate-400 mt-1 text-[10px]">
        按交货截止日最早的产品优先分配
      </div>
    </div>
  );

  return (
    <Tooltip title={tooltipContent} color="#1e293b" overlayStyle={{ maxWidth: 320 }}>
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-600 border border-orange-200 cursor-help">
        <AlertTriangle className="w-3 h-3" />
        分配建议
      </span>
    </Tooltip>
  );
};
