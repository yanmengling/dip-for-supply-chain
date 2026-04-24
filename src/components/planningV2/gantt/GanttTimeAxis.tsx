/**
 * 甘特图时间轴头部 - Gantt Time Axis Header
 *
 * 每天一格，每格固定 dayWidth 像素宽，支持横向滚动。
 * 上行显示月份，下行显示每天日期数字。
 */

import { useMemo } from 'react';

interface GanttTimeAxisProps {
  startDate: Date;
  endDate: Date;
  /** 每天对应的像素宽度，与 GanttTaskBar 保持一致 */
  dayWidth: number;
}

const GanttTimeAxis = ({ startDate, endDate, dayWidth }: GanttTimeAxisProps) => {
  // 生成日期数组
  const dates = useMemo(() => {
    const dateArray: Date[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      dateArray.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return dateArray;
  }, [startDate, endDate]);

  // 按月份分组（用于月份行）
  const monthGroups = useMemo(() => {
    const groups: { month: string; count: number }[] = [];
    let currentMonth = '';
    let count = 0;
    for (const date of dates) {
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthKey !== currentMonth) {
        if (currentMonth) groups.push({ month: currentMonth, count });
        currentMonth = monthKey;
        count = 1;
      } else {
        count++;
      }
    }
    if (currentMonth) groups.push({ month: currentMonth, count });
    return groups;
  }, [dates]);

  const formatMonthLabel = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return `${year}年${month}月`;
  };

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  return (
    <div style={{ display: 'inline-block', minWidth: '100%' }}>
      {/* 月份行 */}
      <div className="flex border-b border-slate-200">
        {monthGroups.map((group, idx) => (
          <div
            key={idx}
            className="border-r border-slate-200 py-1.5 px-1 text-center bg-slate-100 overflow-hidden flex-shrink-0"
            style={{ width: `${group.count * dayWidth}px` }}
          >
            <div className="text-xs font-semibold text-slate-700 truncate">
              {formatMonthLabel(group.month)}
            </div>
          </div>
        ))}
      </div>

      {/* 日期行 */}
      <div className="flex">
        {dates.map((date, idx) => {
          const weekend = isWeekend(date);
          const today = isToday(date);
          return (
            <div
              key={idx}
              className={`border-r border-slate-200 py-1 text-center flex-shrink-0
                ${weekend ? 'bg-slate-50' : 'bg-white'}
                ${today ? '!bg-indigo-50' : ''}
              `}
              style={{ width: `${dayWidth}px` }}
            >
              <div className={`font-medium leading-none
                ${dayWidth >= 20 ? 'text-[11px]' : 'text-[9px]'}
                ${weekend ? 'text-slate-400' : 'text-slate-600'}
                ${today ? 'text-indigo-600 font-bold' : ''}
              `}>
                {date.getDate()}
              </div>
              {today && dayWidth >= 20 && (
                <div className="text-[9px] text-indigo-600 font-bold leading-none mt-0.5">今</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GanttTimeAxis;
