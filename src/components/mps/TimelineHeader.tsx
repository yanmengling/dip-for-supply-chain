/**
 * Timeline Header Component
 * 
 * 时间轴头部组件，显示时间轴刻度（横轴）
 */

import React from 'react';
import { buildTimeline } from '../../utils/ganttUtils';
import type { TimelineConfig } from '../../utils/ganttUtils';

interface Props {
    startDate: Date;
    endDate: Date;
    pixelsPerDay: number;
    scrollLeft?: number;
    onScroll?: (scrollLeft: number) => void;
}

export const TimelineHeader: React.FC<Props> = ({
    startDate,
    endDate,
    pixelsPerDay,
    scrollLeft = 0,
    onScroll,
}) => {
    const timelineConfig: TimelineConfig = buildTimeline(startDate, endDate, pixelsPerDay);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const newScrollLeft = e.currentTarget.scrollLeft;
        if (onScroll) {
            onScroll(newScrollLeft);
        }
    };

    return (
        <div
            className="overflow-x-auto border-b border-slate-200 bg-slate-50"
            style={{ height: '3.5rem' }}
            onScroll={handleScroll}
        >
            <div
                className="relative"
                style={{ width: `${timelineConfig.totalWidth}px`, minWidth: '100%' }}
            >
                {timelineConfig.dates.map((dateItem, index) => (
                    <div
                        key={index}
                        className="absolute top-0 bottom-0 flex flex-col items-center justify-center border-r border-slate-200"
                        style={{
                            left: `${dateItem.position}px`,
                            width: `${pixelsPerDay}px`,
                        }}
                    >
                        <div className="text-xs font-medium text-slate-700">
                            {dateItem.label}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
