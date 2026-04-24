/**
 * Task Tooltip Component
 * 
 * 任务详情提示框组件，鼠标悬浮时显示任务详细信息
 */

import React from 'react';
import type { GanttTask } from '../../types/ontology';
import { formatDateLabel } from '../../utils/ganttUtils';

interface Props {
    task: GanttTask;
}

export const TaskTooltip: React.FC<Props> = ({ task }) => {
    return (
        <div className="absolute z-50 bg-slate-900 text-white text-xs rounded-lg shadow-lg p-3 pointer-events-none"
            style={{
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginBottom: '8px',
                minWidth: '200px',
            }}>
            {/* 任务名称 */}
            <div className="font-semibold mb-2">{task.name}</div>

            {/* 任务类型 */}
            <div className="mb-1">
                <span className="text-slate-400">类型:</span>{' '}
                <span>{task.type === 'product' ? '产品' : task.type === 'component' ? '组件' : '物料'}</span>
            </div>

            {/* 持续时间 */}
            <div className="mb-1">
                <span className="text-slate-400">持续时间:</span>{' '}
                <span>{task.duration}天</span>
            </div>

            {/* 开始时间 */}
            <div className="mb-1">
                <span className="text-slate-400">开始时间:</span>{' '}
                <span>{formatDateLabel(task.startDate)}</span>
            </div>

            {/* 结束时间 */}
            <div className="mb-1">
                <span className="text-slate-400">结束时间:</span>{' '}
                <span>{formatDateLabel(task.endDate)}</span>
            </div>

            {/* 状态 */}
            <div>
                <span className="text-slate-400">状态:</span>{' '}
                <span className={
                    task.status === 'critical' ? 'text-red-400' :
                        task.status === 'warning' ? 'text-yellow-400' :
                            'text-green-400'
                }>
                    {task.status === 'critical' ? '严重' :
                        task.status === 'warning' ? '警告' :
                            '正常'}
                </span>
            </div>
        </div>
    );
};
