/**
 * 甘特图任务条 - 倒排模式
 *
 * 颜色方案（与整体 indigo/slate 风格对齐）：
 * - indigo  #4F46E5: on_time（按时，无风险）
 * - red     #DC2626: risk（风险，需行动）
 * - emerald #059669: ordered（已下单，就绪）
 */

import { useMemo } from 'react';
import type { GanttBar } from '../../../types/planningV2';

interface GanttTaskBarProps {
  bar: GanttBar;
  chartStart: Date;
  /** 每天对应的像素宽度 */
  dayWidth: number;
  productionStartDate: Date;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: () => void;
}

const STATUS_COLORS: Record<GanttBar['status'], string> = {
  on_time: '#4F46E5',   // indigo-600：按时，无风险
  risk:    '#DC2626',   // red-600：风险，需行动
  ordered: '#059669',  // emerald-600：已下单，就绪
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const GanttTaskBar = ({
  bar,
  chartStart,
  dayWidth,
  productionStartDate,
  onMouseEnter,
  onMouseLeave,
}: GanttTaskBarProps) => {
  const barStyle = useMemo(() => {
    // 全部归零到当天零点，避免时分秒差导致偏移一天
    const chartStartDay = new Date(chartStart); chartStartDay.setHours(0, 0, 0, 0);
    const barStart = new Date(bar.startDate); barStart.setHours(0, 0, 0, 0);
    const barEnd = new Date(bar.endDate); barEnd.setHours(0, 0, 0, 0);
    const startOffsetDays = (barStart.getTime() - chartStartDay.getTime()) / MS_PER_DAY;
    const durationDays = (barEnd.getTime() - barStart.getTime()) / MS_PER_DAY;
    const left = Math.max(0, startOffsetDays * dayWidth);
    const width = Math.max(dayWidth * 0.5, durationDays * dayWidth);
    return {
      left: `${left}px`,
      width: `${width}px`,
      backgroundColor: STATUS_COLORS[bar.status],
    };
  }, [bar, chartStart, dayWidth]);

  // 今天标记线（像素定位）
  const todayLeft = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // chartStart 也归零，避免时区/时分秒差导致偏移一天
    const chartStartDay = new Date(chartStart);
    chartStartDay.setHours(0, 0, 0, 0);
    const offsetDays = (today.getTime() - chartStartDay.getTime()) / MS_PER_DAY;
    if (offsetDays < 0) return null;
    return offsetDays * dayWidth;
  }, [chartStart, dayWidth]);

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
      {todayLeft !== null && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none z-10"
          style={{
            left: `${todayLeft}px`,
            width: '1px',
            borderLeft: '1px dashed #EF4444',
          }}
        />
      )}
    </div>
  );
};

export default GanttTaskBar;
