/**
 * 甘特图任务条 - Gantt Task Bar
 *
 * 显示单个物料的时间进度条，根据状态显示不同颜色
 */

import { useMemo } from 'react';
import type { MaterialTask } from '../../../types/planningV2';

interface GanttTaskBarProps {
  task: MaterialTask;
  startDate: Date;
  totalDays: number;
  productionEndDate: Date;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: () => void;
}

const GanttTaskBar = ({
  task,
  startDate,
  totalDays,
  productionEndDate,
  onMouseEnter,
  onMouseLeave
}: GanttTaskBarProps) => {
  // 计算任务条的位置和宽度
  const barStyle = useMemo(() => {
    const taskStart = task.startDate.getTime();
    const taskEnd = task.endDate.getTime();
    const chartStart = startDate.getTime();
    const chartEnd = startDate.getTime() + totalDays * 24 * 60 * 60 * 1000;

    // 计算开始位置（百分比）
    const startOffset = Math.max(0, (taskStart - chartStart) / (chartEnd - chartStart) * 100);

    // 计算宽度（百分比）
    const duration = Math.max(1, (taskEnd - taskStart) / (chartEnd - chartStart) * 100);

    return {
      left: `${startOffset}%`,
      width: `${Math.min(duration, 100 - startOffset)}%`
    };
  }, [task, startDate, totalDays]);

  // 根据状态确定颜色
  const getBarColor = () => {
    switch (task.status) {
      case 'ready':
        return 'bg-green-500 hover:bg-green-600';
      case 'no_po':
        return 'bg-slate-400 hover:bg-slate-500';
      case 'po_placed':
        return 'bg-blue-500 hover:bg-blue-600';
      case 'normal':
        return 'bg-blue-500 hover:bg-blue-600';
      case 'abnormal':
        return 'bg-orange-500 hover:bg-orange-600';
      default:
        return 'bg-slate-400 hover:bg-slate-500';
    }
  };

  // 根据状态确定边框颜色（用于风险标记）
  const getBorderColor = () => {
    if (task.tooltipData.riskLevel === 'severe') {
      return 'border-2 border-red-600';
    }
    if (task.tooltipData.riskLevel === 'abnormal') {
      return 'border-2 border-orange-400';
    }
    if (task.tooltipData.riskLevel === 'advance_notice') {
      return 'border-2 border-yellow-400';
    }
    return '';
  };

  // 计算当前日期标记线
  const todayMarker = useMemo(() => {
    const today = new Date();
    const chartStart = startDate.getTime();
    const chartEnd = startDate.getTime() + totalDays * 24 * 60 * 60 * 1000;
    const todayOffset = (today.getTime() - chartStart) / (chartEnd - chartStart) * 100;

    if (todayOffset >= 0 && todayOffset <= 100) {
      return todayOffset;
    }
    return null;
  }, [startDate, totalDays]);

  return (
    <div className="relative h-8">
      {/* 任务条 */}
      <div
        className={`absolute top-1 h-6 rounded cursor-pointer transition-colors
          ${getBarColor()} ${getBorderColor()}`}
        style={barStyle}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* 任务标签 */}
        <div className="px-2 py-1 text-xs text-white font-medium truncate flex items-center gap-1">
          {task.requiredQuantity} {task.unit}
          {/* 齐套倒排指示箭头 */}
          {task.bomLevel > 0 && (
            <span className="text-[10px] opacity-75">←</span>
          )}
        </div>

        {/* 风险标记 */}
        {task.tooltipData.riskLevel && (
          <div className="absolute -top-1 -right-1">
            {task.tooltipData.riskLevel === 'severe' && (
              <span className="inline-block w-3 h-3 bg-red-600 rounded-full border border-white" />
            )}
            {task.tooltipData.riskLevel === 'abnormal' && (
              <span className="inline-block w-3 h-3 bg-orange-500 rounded-full border border-white" />
            )}
            {task.tooltipData.riskLevel === 'advance_notice' && (
              <span className="inline-block w-3 h-3 bg-yellow-500 rounded-full border border-white" />
            )}
          </div>
        )}
      </div>

      {/* 齐套连接线 - 显示子级到父级的依赖关系 */}
      {task.parentCode && (
        <div
          className="absolute top-7 left-0 w-px h-4 bg-slate-300 pointer-events-none"
          style={{ left: barStyle.left }}
        />
      )}

      {/* 今日标记线 */}
      {todayMarker !== null && (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-indigo-600 opacity-50 pointer-events-none z-10"
          style={{ left: `${todayMarker}%` }}
        />
      )}
    </div>
  );
};

export default GanttTaskBar;
