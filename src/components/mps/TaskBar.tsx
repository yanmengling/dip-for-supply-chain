/**
 * Task Bar Component
 * 
 * 任务进度条组件，显示任务的时间进度
 */

import React, { useState } from 'react';
import type { GanttTask } from '../../types/ontology';
import { formatDateLabel } from '../../utils/ganttUtils';
import { TaskTooltip } from './TaskTooltip';

interface Props {
    task: GanttTask;
}

export const TaskBar: React.FC<Props> = ({ task }) => {
    const [showTooltip, setShowTooltip] = useState(false);

    // 根据任务类型和状态确定颜色
    const getTaskColor = (): string => {
        if (task.status === 'critical') {
            return 'bg-red-500';
        }
        if (task.status === 'warning') {
            return 'bg-yellow-500';
        }

        // 根据任务类型设置颜色
        switch (task.type) {
            case 'product':
                return 'bg-blue-500';
            case 'component':
                return 'bg-indigo-500';
            case 'material':
                return 'bg-purple-500';
            default:
                return 'bg-slate-500';
        }
    };

    return (
        <div
            className="relative h-full flex items-center"
            style={{
                left: `${task.left}px`,
                width: `${task.width}px`,
            }}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            {/* 任务条 */}
            <div
                className={`${getTaskColor()} rounded px-2 py-1 text-white text-xs font-medium h-8 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity`}
                style={{ minWidth: '60px' }}
            >
                {/* 产品行显示时间信息 */}
                {task.level === 0 ? (
                    <div className="text-center">
                        <div className="text-xs">{formatDateLabel(task.startDate)}</div>
                        <div className="text-xs">-</div>
                        <div className="text-xs">{formatDateLabel(task.endDate)}</div>
                    </div>
                ) : (
                    // 子节点显示持续时间
                    <div className="text-center">
                        {task.duration}天
                    </div>
                )}
            </div>

            {/* 任务详情提示框 */}
            {showTooltip && (
                <TaskTooltip task={task} />
            )}
        </div>
    );
};
