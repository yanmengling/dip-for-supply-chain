/**
 * Gantt Grid Component
 * 
 * 甘特图Grid组件，使用CSS Grid布局
 * 左侧固定列（192px）：BOM树形结构
 * 右侧滚动区域：时间轴和任务条
 */

import React, { useState, useRef } from 'react';
import { TimelineHeader } from './TimelineHeader';
import { TaskBar } from './TaskBar';
import type { GanttTask } from '../../types/ontology';

interface Props {
    startDate: Date;
    endDate: Date;
    pixelsPerDay: number;
    tasks: GanttTask[];
    bomTree: React.ReactNode; // BOM树组件
}

export const GanttGrid: React.FC<Props> = ({
    startDate,
    endDate,
    pixelsPerDay,
    tasks,
    bomTree,
}) => {
    const [scrollLeft, setScrollLeft] = useState(0);
    const timelineRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // 同步滚动
    const handleTimelineScroll = (newScrollLeft: number) => {
        setScrollLeft(newScrollLeft);
        if (contentRef.current) {
            contentRef.current.scrollLeft = newScrollLeft;
        }
    };

    const handleContentScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const newScrollLeft = e.currentTarget.scrollLeft;
        setScrollLeft(newScrollLeft);
        if (timelineRef.current) {
            timelineRef.current.scrollLeft = newScrollLeft;
        }
    };

    // 根据层级获取行背景色（FR-026）
    const getRowBackgroundColor = (level: number): string => {
        // level 0: 产品 -> bg-white
        // level 1: 一级组件 -> bg-white
        // level 2: 二级组件 -> bg-slate-50
        // level 3: 三级组件 -> bg-blue-50
        // level 4+: 物料 -> bg-purple-50
        if (level === 0 || level === 1) {
            return 'bg-white';
        } else if (level === 2) {
            return 'bg-slate-50';
        } else if (level === 3) {
            return 'bg-blue-50';
        } else {
            return 'bg-purple-50';
        }
    };

    // 计算时间轴总宽度
    const totalDays = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const timelineWidth = totalDays * pixelsPerDay;

    return (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            {/* Grid布局：左侧固定列 + 右侧滚动区域 */}
            <div className="grid grid-cols-[192px_1fr]">
                {/* 左侧固定列：BOM树 */}
                <div className="border-r border-slate-200 bg-slate-50">
                    <div className="h-14 border-b border-slate-200 flex items-center justify-center">
                        <span className="text-sm font-semibold text-slate-700">BOM结构</span>
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: '600px' }}>
                        {bomTree}
                    </div>
                </div>

                {/* 右侧滚动区域：时间轴和任务条 */}
                <div className="overflow-hidden">
                    {/* 时间轴头部 */}
                    <div ref={timelineRef} className="overflow-x-auto">
                        <TimelineHeader
                            startDate={startDate}
                            endDate={endDate}
                            pixelsPerDay={pixelsPerDay}
                            scrollLeft={scrollLeft}
                            onScroll={handleTimelineScroll}
                        />
                    </div>

                    {/* 任务条区域 */}
                    <div
                        ref={contentRef}
                        className="overflow-x-auto overflow-y-auto relative"
                        style={{ maxHeight: '600px' }}
                        onScroll={handleContentScroll}
                    >
                        <div
                            className="relative"
                            style={{ width: `${timelineWidth}px`, minWidth: '100%' }}
                        >
                            {/* 任务条容器 */}
                            {tasks.map((task) => (
                                <div
                                    key={task.id}
                                    className={`absolute border-b border-slate-100 ${getRowBackgroundColor(task.level)}`}
                                    style={{
                                        top: `${task.level * 3.5}rem`,
                                        height: '3.5rem',
                                    }}
                                >
                                    <TaskBar task={task} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
