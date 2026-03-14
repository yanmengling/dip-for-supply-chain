/**
 * 齐套模式倒排甘特图
 *
 * 布局：左侧 240px 固定列（sticky）+ 右侧横向可滚动甘特区域
 * 每天一格，固定 DAY_WIDTH px，支持任意时间跨度无损显示。
 */

import { useState, useMemo, useRef } from 'react';
import { ChevronRight, ChevronDown, Maximize2, Minimize2 } from 'lucide-react';
import type { GanttBar } from '../../../types/planningV2';
import GanttTimeAxis from './GanttTimeAxis';
import GanttTaskBar from './GanttTaskBar';
import GanttTooltip from './GanttTooltip';
import GanttLegend from './GanttLegend';
import GanttSummaryCard from './GanttSummaryCard';
import { ganttService } from '../../../services/ganttService';

interface GanttChartProps {
  bars: GanttBar[];
  productionStart: string;
  productionEnd: string;
  productCode?: string;
  productName?: string;
  forecastBillnos?: string[];
}

/** 每天对应的像素宽度 */
const DAY_WIDTH = 28;

/** 左侧 BOM 树列宽度（px） */
const LEFT_COL_WIDTH = 240;

/** 单次最多渲染行数，超出时提示折叠 */
const MAX_VISIBLE_ROWS = 200;

const GanttChart = ({ bars, productionStart, productionEnd, productCode, productName, forecastBillnos }: GanttChartProps) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
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

  /** 甘特图区域总宽度（px） */
  const ganttWidth = totalDays * DAY_WIDTH;

  const productionStartDate = useMemo(() => new Date(productionStart), [productionStart]);

  // 计划进度总结
  const summary = useMemo(
    () => ganttService.getGanttSummary(bars, productionStart, productionEnd),
    [bars, productionStart, productionEnd],
  );

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
        style={{ minWidth: `${LEFT_COL_WIDTH + ganttWidth}px` }}
      >
        {/* 左侧 BOM 树列 — sticky 固定 */}
        <div
          className="flex-shrink-0 border-r border-slate-200 py-2 px-3 flex items-center gap-1.5 bg-white sticky left-0 z-10"
          style={{ width: `${LEFT_COL_WIDTH}px`, paddingLeft: `${level * 16 + 8}px` }}
        >
          {hasChildren ? (
            <button onClick={() => toggleExpand(bar.materialCode)} className="p-0.5 hover:bg-slate-200 rounded flex-shrink-0">
              {isExpanded
                ? <ChevronDown className="w-3.5 h-3.5 text-slate-600" />
                : <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              }
            </button>
          ) : (
            <div className="w-4 flex-shrink-0" />
          )}
          {bar.hasShortage && <span className="text-red-500 text-xs font-bold flex-shrink-0">⚠</span>}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className={`px-1 py-0.5 text-[10px] rounded font-medium flex-shrink-0 ${typeColor}`}>
                {typeLabel}
              </span>
              <span className="text-[10px] text-slate-400 flex-shrink-0">L{bar.bomLevel}</span>
            </div>
            <div className="text-xs text-slate-800 truncate mt-0.5">{bar.materialName}</div>
          </div>
        </div>

        {/* 右侧甘特图任务条区域 */}
        <div
          className="relative py-1 flex-shrink-0"
          style={{ width: `${ganttWidth}px` }}
        >
          <GanttTaskBar
            bar={bar}
            chartStart={timeRange.start}
            dayWidth={DAY_WIDTH}
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
    <div className="space-y-3">
      {/* 计划进度总结卡片 */}
      <GanttSummaryCard summary={summary} productCode={productCode} productName={productName} forecastBillnos={forecastBillnos} />

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* 表头行（sticky top，不滚动） */}
        <div className="flex border-b-2 border-slate-300 bg-slate-50">
          <div
            className="flex-shrink-0 border-r border-slate-300 py-2.5 px-3 sticky left-0 bg-slate-50 z-20"
            style={{ width: `${LEFT_COL_WIDTH}px` }}
          >
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
          <div className="flex-1 py-2.5 px-3 min-w-0">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">齐套倒排甘特图</div>
              <div className="text-xs text-slate-500">子级结束 = 父级开始 - 1天</div>
            </div>
          </div>
        </div>

        {/* 横向滚动容器：时间轴 + 任务行共享同一个滚动区域 */}
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '520px' }}>
          {/* 时间轴（sticky top 在滚动容器内） */}
          <div
            className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-20"
            style={{ minWidth: `${LEFT_COL_WIDTH + ganttWidth}px` }}
          >
            <div
              className="flex-shrink-0 border-r border-slate-200 bg-slate-50 sticky left-0 z-30"
              style={{ width: `${LEFT_COL_WIDTH}px` }}
            />
            <div className="flex-shrink-0" style={{ width: `${ganttWidth}px` }}>
              <GanttTimeAxis
                startDate={timeRange.start}
                endDate={timeRange.end}
                dayWidth={DAY_WIDTH}
              />
            </div>
          </div>

          {/* 任务行 */}
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
                  <div
                    className="py-3 px-4 text-center text-xs text-slate-400 border-t border-slate-100 bg-slate-50 sticky left-0"
                    style={{ minWidth: `${LEFT_COL_WIDTH + ganttWidth}px` }}
                  >
                    已显示 {totalVisible} / {totalRows} 条（展开更多层级可查看子节点）
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
