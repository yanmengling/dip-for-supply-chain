/**
 * 甘特图任务条 - 倒排模式
 *
 * 颜色方案：
 * - 深蓝 #1E3A5F: on_time（按时，无风险）
 * - 红色 #E24C4B: risk（需立即行动）
 * - 绿色 #27AE60: ordered（已下单，就绪）
 */

import { useMemo } from 'react';
import type { GanttBar } from '../../../types/planningV2';

interface GanttTaskBarProps {
  bar: GanttBar;
  chartStart: Date;
  totalDays: number;
  productionStartDate: Date;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: () => void;
}

const STATUS_COLORS: Record<GanttBar['status'], string> = {
  on_time: '#1E3A5F',
  risk: '#E24C4B',
  ordered: '#27AE60',
};

const GanttTaskBar = ({
  bar,
  chartStart,
  totalDays,
  productionStartDate,
  onMouseEnter,
  onMouseLeave,
}: GanttTaskBarProps) => {
  const barStyle = useMemo(() => {
    const chartStartMs = chartStart.getTime();
    const chartRange = totalDays * 24 * 60 * 60 * 1000;
    const startOffset = Math.max(0, (bar.startDate.getTime() - chartStartMs) / chartRange * 100);
    const width = Math.max(0.5, (bar.endDate.getTime() - bar.startDate.getTime()) / chartRange * 100);
    return {
      left: `${startOffset}%`,
      width: `${Math.min(width, 100 - startOffset)}%`,
      backgroundColor: STATUS_COLORS[bar.status],
    };
  }, [bar, chartStart, totalDays]);

  // 今天标记线
  const todayOffset = useMemo(() => {
    const today = new Date();
    const chartStartMs = chartStart.getTime();
    const chartRange = totalDays * 24 * 60 * 60 * 1000;
    const offset = (today.getTime() - chartStartMs) / chartRange * 100;
    return offset >= 0 && offset <= 100 ? offset : null;
  }, [chartStart, totalDays]);

  return (
    <div className="relative h-7">
      {/* 任务条 */}
      <div
        className="absolute top-1 h-5 rounded cursor-pointer transition-opacity hover:opacity-80"
        style={barStyle}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div className="px-1.5 py-0.5 text-[10px] text-white font-medium truncate flex items-center gap-1">
          {bar.materialCode}
          {bar.hasShortage && <span className="text-yellow-300">⚠缺</span>}
        </div>
      </div>

      {/* 今天标记线 */}
      {todayOffset !== null && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-10"
          style={{
            left: `${todayOffset}%`,
            width: '1px',
            borderLeft: '1px dashed #EF4444',
          }}
        />
      )}
    </div>
  );
};

export default GanttTaskBar;
