/**
 * 甘特图时间轴头部 - Gantt Time Axis Header
 *
 * 显示日期网格和标记
 */

import { useMemo } from 'react';

interface GanttTimeAxisProps {
  startDate: Date;
  endDate: Date;
  totalDays: number;
}

const GanttTimeAxis = ({ startDate, endDate, totalDays }: GanttTimeAxisProps) => {
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

  // 按月份分组
  const monthGroups = useMemo(() => {
    const groups: { month: string; startIdx: number; count: number }[] = [];
    let currentMonth = '';
    let startIdx = 0;
    let count = 0;

    dates.forEach((date, idx) => {
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (monthKey !== currentMonth) {
        if (currentMonth) {
          groups.push({ month: currentMonth, startIdx, count });
        }
        currentMonth = monthKey;
        startIdx = idx;
        count = 1;
      } else {
        count++;
      }
    });

    // 添加最后一个月
    if (currentMonth) {
      groups.push({ month: currentMonth, startIdx, count });
    }

    return groups;
  }, [dates]);

  const formatMonthLabel = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    return `${year}年${month}月`;
  };

  const formatDayLabel = (date: Date) => {
    return date.getDate();
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
    <div>
      {/* 月份行 */}
      <div className="flex border-b border-slate-200">
        {monthGroups.map((group, idx) => (
          <div
            key={idx}
            className="border-r border-slate-200 py-2 px-1 text-center bg-slate-100"
            style={{ width: `${(group.count / totalDays) * 100}%` }}
          >
            <div className="text-xs font-semibold text-slate-700">
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
                ${today ? 'bg-indigo-50' : ''}
              `}
              style={{ width: `${100 / totalDays}%` }}
            >
              <div className={`text-xs font-medium
                ${weekend ? 'text-slate-400' : 'text-slate-600'}
                ${today ? 'text-indigo-600 font-bold' : ''}
              `}>
                {formatDayLabel(date)}
              </div>
              {today && (
                <div className="text-[10px] text-indigo-600 font-bold">今</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GanttTimeAxis;
