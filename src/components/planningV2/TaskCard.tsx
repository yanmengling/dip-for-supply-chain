import React from 'react';
import { X } from 'lucide-react';
import type { PlanningTask } from '../../types/planningV2';

interface TaskCardProps {
  task: PlanningTask;
  shortageCount?: number;
  onViewDetail: (taskId: string) => void;
  onEndTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
}

const statusConfig = {
  active: { label: '进行中', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
  ended: { label: '已结束', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  expired: { label: '已过期', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
} as const;

export default function TaskCard({
  task,
  shortageCount,
  onViewDetail,
  onEndTask,
  onDeleteTask,
}: TaskCardProps) {
  const sc = statusConfig[task.status];
  const canDelete = task.status === 'ended' || task.status === 'expired';
  const createdDate = new Date(task.createdAt);
  const dateStr = `${String(createdDate.getMonth() + 1).padStart(2, '0')}-${String(createdDate.getDate()).padStart(2, '0')}`;

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 p-4 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer relative group"
      onClick={() => onViewDetail(task.id)}
    >
      {/* 状态标签 + 日期 + 删除按钮 */}
      <div className="flex items-center justify-between mb-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
          {sc.label}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{dateStr}</span>
          {canDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
              className="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
              title="删除任务"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* 任务名称 */}
      <h3 className="text-sm font-semibold text-gray-800 mb-3 line-clamp-2">{task.name}</h3>

      {/* 信息字段 */}
      <div className="space-y-1.5 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-8">产品</span>
          <span className="text-gray-700">{task.productCode}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-8">生产</span>
          <span className="text-gray-700">
            {task.productionStart?.slice(5)} ~ {task.productionEnd?.slice(5)}
          </span>
        </div>
        {shortageCount !== undefined && (
          <div className="flex items-center gap-2">
            <span className="text-gray-400 w-8">缺料</span>
            <span className={shortageCount > 0 ? 'text-red-600 font-medium' : 'text-green-600'}>
              {shortageCount} 项
            </span>
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onViewDetail(task.id); }}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          查看详情
        </button>
        {task.status === 'active' && (
          <button
            onClick={(e) => { e.stopPropagation(); onEndTask(task.id); }}
            className="text-xs text-gray-500 hover:text-orange-600 font-medium ml-auto"
          >
            结束任务
          </button>
        )}
      </div>
    </div>
  );
}
