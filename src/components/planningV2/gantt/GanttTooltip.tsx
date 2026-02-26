/**
 * 甘特图 Tooltip - 倒排模式
 *
 * 显示 GanttBar 的详细信息
 */

import { createPortal } from 'react-dom';
import type { GanttBar } from '../../../types/planningV2';

interface GanttTooltipProps {
  bar: GanttBar;
  x: number;
  y: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const formatDate = (date: Date) => {
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
};

const GanttTooltip = ({ bar, x, y, onMouseEnter, onMouseLeave }: GanttTooltipProps) => {
  const duration = Math.ceil((bar.endDate.getTime() - bar.startDate.getTime()) / (1000 * 60 * 60 * 24));

  const statusLabel = bar.status === 'on_time' ? '按时'
    : bar.status === 'risk' ? '风险'
    : '已下单';

  const statusColor = bar.status === 'on_time' ? 'text-blue-700'
    : bar.status === 'risk' ? 'text-red-600'
    : 'text-green-600';

  const tooltip = (
    <div
      className="fixed z-50"
      style={{
        left: `${Math.min(x, window.innerWidth - 320)}px`,
        top: `${y}px`,
        transform: 'translateY(-50%)',
        pointerEvents: 'auto',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="bg-white border border-slate-300 rounded-lg shadow-xl w-72">
        {/* 标题 */}
        <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 rounded-t-lg">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-slate-600">{bar.materialCode}</span>
            <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${
              bar.materialType === '外购' ? 'bg-green-100 text-green-700' :
              bar.materialType === '委外' ? 'bg-orange-100 text-orange-700' :
              'bg-purple-100 text-purple-700'
            }`}>
              {bar.materialType || '自制'}
            </span>
            <span className="text-[10px] text-slate-400">L{bar.bomLevel}</span>
          </div>
          <div className="text-sm font-semibold text-slate-900">{bar.materialName}</div>
        </div>

        <div className="px-3 py-2 space-y-2 text-xs">
          {/* 状态与时间 */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">状态:</span>
              <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">时间范围:</span>
              <span className="text-slate-800">{formatDate(bar.startDate)} ~ {formatDate(bar.endDate)} ({duration}天)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">交期天数:</span>
              <span className="text-slate-800">{bar.leadtime} 天</span>
            </div>
          </div>

          {/* 缺口信息 */}
          {bar.hasShortage && (
            <div className="bg-red-50 border border-red-200 rounded px-2 py-1.5">
              <span className="text-red-700 font-medium">⚠ 缺口数量: {bar.shortageQuantity.toLocaleString()}</span>
            </div>
          )}

          {/* PR/PO 状态 */}
          {bar.poStatus !== 'not_applicable' && (
            <div className="space-y-1 border-t border-slate-100 pt-2">
              <div className="flex justify-between">
                <span className="text-slate-500">PR状态:</span>
                <span className={bar.prStatus === 'has_pr' ? 'text-green-600' : 'text-red-600'}>
                  {bar.prStatus === 'has_pr' ? '✅ 已PR' : '❌ 未PR'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">PO状态:</span>
                <span className={bar.poStatus === 'has_po' ? 'text-green-600' : 'text-red-600'}>
                  {bar.poStatus === 'has_po' ? '✅ 已PO' : '❌ 未PO'}
                </span>
              </div>
              {bar.poDeliverDate && (
                <div className="flex justify-between">
                  <span className="text-slate-500">最新交货承诺:</span>
                  <span className="text-slate-800">{bar.poDeliverDate}</span>
                </div>
              )}
            </div>
          )}

          {/* 倒排提示 */}
          {bar.bomLevel > 0 && (
            <div className="text-[11px] text-indigo-600 bg-indigo-50 rounded px-2 py-1 border border-indigo-100">
              倒排: 需在父级开工前 1 天齐套完成
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(tooltip, document.body);
};

export default GanttTooltip;
