/**
 * 齐套模式倒排甘特图
 *
 * 基于 GanttBar[] 树形数据渲染倒排甘特图
 * 数据来源：ganttService.buildGanttData() 实时 API 查询
 */

import { useState, useMemo, useRef } from 'react';
import { ChevronRight, ChevronDown, Maximize2, Minimize2 } from 'lucide-react';
import type { GanttBar } from '../../../types/planningV2';
import GanttTimeAxis from './GanttTimeAxis';
import GanttTaskBar from './GanttTaskBar';
import GanttTooltip from './GanttTooltip';
import GanttLegend from './GanttLegend';
import { ganttService } from '../../../services/ganttService';

interface GanttChartProps {
  bars: GanttBar[];
  productionStart: string;
}

/** 单次最多渲染行数，超出时提示折叠 */
const MAX_VISIBLE_ROWS = 200;

const GanttChart = ({ bars, productionStart }: GanttChartProps) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    // 默认只展开 L0（产品层），不展开子节点，避免一次渲染上千行
    const initial = new Set<string>();
    bars.forEach(root => initial.add(root.materialCode));
    return initial;
  });
  const [hoveredBar, setHoveredBar] = useState<{ bar: GanttBar; x: number; y: number } | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 计算时间范围
  const timeRange = useMemo(() => ganttService.getGanttTimeRange(bars), [bars]);

  const totalDays = useMemo(() => {
    return Math.ceil((timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24));
  }, [timeRange]);

  const productionStartDate = useMemo(() => new Date(productionStart), [productionStart]);

  // 收集所有节点 ID（用于全展开）
  const allNodeIds = useMemo(() => {
    const ids = new Set<string>();
    const walk = (bar: GanttBar) => {
      if (bar.children.length > 0) ids.add(bar.materialCode);
      bar.children.forEach(walk);
    };
    bars.forEach(walk);
    return ids;
  }, [bars]);

  const expandAll = () => setExpandedNodes(new Set(allNodeIds));
  const collapseAll = () => setExpandedNodes(new Set());

  const toggleExpand = (code: string) => {
    const next = new Set(expandedNodes);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setExpandedNodes(next);
  };

  const handleBarMouseEnter = (bar: GanttBar, e: React.MouseEvent<HTMLDivElement>) => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredBar({ bar, x: rect.right + 10, y: rect.top });
  };

  const handleBarMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => setHoveredBar(null), 200);
  };

  const renderRow = (bar: GanttBar, level: number = 0): React.ReactNode[] => {
    const isExpanded = expandedNodes.has(bar.materialCode);
    const hasChildren = bar.children.length > 0;
    const rows: React.ReactNode[] = [];

    // Material type label
    const typeLabel = bar.materialType === '外购' ? '外购'
      : bar.materialType === '委外' ? '委外'
      : bar.materialType === '自制' ? '自制'
      : bar.bomLevel === 0 ? '产品' : '自制';
    const typeColor = typeLabel === '外购' ? 'bg-green-100 text-green-700'
      : typeLabel === '委外' ? 'bg-orange-100 text-orange-700'
      : typeLabel === '产品' ? 'bg-indigo-100 text-indigo-700'
      : 'bg-purple-100 text-purple-700';

    rows.push(
      <div
        key={bar.materialCode}
        id={`gantt-bar-${bar.materialCode}`}
        className={`flex border-b border-slate-100 hover:bg-slate-50 transition-colors ${
          bar.hasShortage ? 'bg-red-50/50' : ''
        }`}
      >
        {/* 左侧 BOM 树 */}
        <div
          className="w-60 flex-shrink-0 border-r border-slate-200 py-2 px-3 flex items-center gap-1.5"
          style={{ paddingLeft: `${level * 20 + 8}px` }}
        >
          {hasChildren ? (
            <button onClick={() => toggleExpand(bar.materialCode)} className="p-0.5 hover:bg-slate-200 rounded">
              {isExpanded
                ? <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
                : <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              }
            </button>
          ) : (
            <div className="w-4" />
          )}
          {bar.hasShortage && <span className="text-red-500 text-xs font-bold">⚠</span>}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`px-1 py-0.5 text-[10px] rounded font-medium ${typeColor}`}>
                {typeLabel}
              </span>
              <span className="text-[11px] text-slate-500">L{bar.bomLevel}</span>
            </div>
            <div className="text-xs text-slate-800 truncate mt-0.5">{bar.materialName}</div>
          </div>
        </div>

        {/* 右侧甘特图区域 */}
        <div className="flex-1 relative py-2 px-1">
          <GanttTaskBar
            bar={bar}
            chartStart={timeRange.start}
            totalDays={totalDays}
            productionStartDate={productionStartDate}
            onMouseEnter={(e) => handleBarMouseEnter(bar, e)}
            onMouseLeave={handleBarMouseLeave}
          />
        </div>
      </div>
    );

    if (isExpanded && hasChildren) {
      bar.children.forEach(child => {
        rows.push(...renderRow(child, level + 1));
      });
    }

    return rows;
  };

  if (bars.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400">
        暂无甘特图数据
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* 表头 */}
        <div className="flex border-b-2 border-slate-300 bg-slate-50">
          <div className="w-60 flex-shrink-0 border-r border-slate-300 py-2.5 px-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">物料 BOM 结构</div>
              <div className="flex items-center gap-1">
                <button onClick={expandAll} className="p-1 hover:bg-slate-200 rounded" title="全部展开">
                  <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
                </button>
                <button onClick={collapseAll} className="p-1 hover:bg-slate-200 rounded" title="全部折叠">
                  <Minimize2 className="w-3.5 h-3.5 text-slate-600" />
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 py-2.5 px-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">齐套倒排甘特图</div>
              <div className="text-xs text-slate-500">
                子级结束 = 父级开始 - 1天
              </div>
            </div>
          </div>
        </div>

        {/* 时间轴 */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <div className="w-60 flex-shrink-0 border-r border-slate-200" />
          <div className="flex-1">
            <GanttTimeAxis startDate={timeRange.start} endDate={timeRange.end} totalDays={totalDays} />
          </div>
        </div>

        {/* 任务行 */}
        <div className="overflow-y-auto" style={{ maxHeight: '500px' }}>
          {(() => {
            const allRows: React.ReactNode[] = [];
            for (const bar of bars) {
              allRows.push(...renderRow(bar));
              if (allRows.length >= MAX_VISIBLE_ROWS) break;
            }
            const totalVisible = allRows.length;
            const flat = ganttService.flattenGanttBars(bars);
            const totalRows = flat.length;
            return (
              <>
                {allRows}
                {totalRows > totalVisible && (
                  <div className="py-3 px-4 text-center text-xs text-slate-400 border-t border-slate-100 bg-slate-50">
                    已显示 {totalVisible} / {totalRows} 条（展开更多层级可查看子节点，建议按层级逐步展开）
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Tooltip */}
        {hoveredBar && (
          <GanttTooltip
            bar={hoveredBar.bar}
            x={hoveredBar.x}
            y={hoveredBar.y}
            onMouseEnter={() => {
              if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
              }
            }}
            onMouseLeave={() => setHoveredBar(null)}
          />
        )}
      </div>

      <GanttLegend />
    </div>
  );
};

export default GanttChart;
