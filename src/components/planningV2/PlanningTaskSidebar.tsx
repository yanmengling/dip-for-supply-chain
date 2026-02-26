import { useState } from 'react';
import { Tooltip } from 'antd';
import { List, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PlanningTask, PlanningViewMode } from '../../types/planningV2';

interface PlanningTaskSidebarProps {
  currentView: PlanningViewMode;
  currentTaskId?: string;
  recentTasks: PlanningTask[];
  onViewChange: (view: PlanningViewMode) => void;
  onTaskSelect: (taskId: string) => void;
  onNewTask: () => void;
}

export default function PlanningTaskSidebar({
  currentView,
  currentTaskId,
  recentTasks,
  onViewChange,
  onTaskSelect,
  onNewTask,
}: PlanningTaskSidebarProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className={`flex-shrink-0 self-stretch sticky top-0 h-screen bg-white border-r border-slate-200 flex flex-col py-3 shadow-sm rounded-lg transition-all duration-200 ${
        expanded ? 'w-48' : 'w-14'
      }`}
    >
      {/* 收缩/展开切换按钮 */}
      <div className={`flex ${expanded ? 'justify-end px-2' : 'justify-center'} mb-2`}>
        <Tooltip title={expanded ? '收起侧边栏' : '展开侧边栏'} placement="right" mouseEnterDelay={0.3}>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            {expanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </Tooltip>
      </div>

      {/* 新建任务按钮（置顶） */}
      <div className="px-2 mb-3">
        <Tooltip title={expanded ? undefined : '新建计划协同任务'} placement="right" mouseEnterDelay={0.3}>
          <button
            onClick={onNewTask}
            className={`flex items-center gap-2 rounded-lg transition-colors w-full ${
              expanded ? 'px-3 py-2' : 'justify-center w-10 h-10 mx-auto'
            } ${
              currentView === 'new-task'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
            }`}
          >
            <Plus size={18} className="flex-shrink-0" />
            {expanded && (
              <span className="text-sm font-medium truncate">新建计划任务</span>
            )}
          </button>
        </Tooltip>
      </div>

      {/* 分隔线 */}
      <div className="mx-3 border-t border-slate-200 mb-2" />

      {/* 监测任务列表按钮 */}
      <div className="px-2 mb-2">
        <Tooltip title={expanded ? undefined : '监测任务列表'} placement="right" mouseEnterDelay={0.3}>
          <button
            onClick={() => onViewChange('task-list')}
            className={`flex items-center gap-2 rounded-lg transition-colors w-full ${
              expanded ? 'px-3 py-2' : 'justify-center w-10 h-10 mx-auto'
            } ${
              currentView === 'task-list'
                ? 'bg-indigo-50 text-indigo-600 font-medium'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <List size={18} className="flex-shrink-0" />
            {expanded && (
              <span className="text-sm font-medium truncate">监测任务列表</span>
            )}
          </button>
        </Tooltip>
      </div>

      {/* 分隔线 */}
      {recentTasks.length > 0 && (
        <div className="mx-3 border-t border-slate-200 mb-2" />
      )}

      {/* 最近任务 */}
      {recentTasks.length > 0 && (
        <div className="px-2 flex flex-col gap-1">
          {expanded && (
            <p className="text-[11px] text-slate-400 uppercase tracking-wider font-medium px-3 mb-1">最近任务</p>
          )}
          {recentTasks.map(task => {
            const isActive = currentView === 'task-detail' && currentTaskId === task.id;
            const initial = task.productName?.[0] || task.name?.[0] || '?';
            const statusColor =
              task.status === 'active'
                ? 'bg-emerald-500'
                : task.status === 'expired'
                  ? 'bg-red-500'
                  : 'bg-slate-400';
            const statusLabel =
              task.status === 'active' ? '进行中' : task.status === 'expired' ? '已过期' : '已结束';

            return (
              <Tooltip
                key={task.id}
                title={expanded ? undefined : `${task.name} · ${statusLabel}`}
                placement="right"
                mouseEnterDelay={0.3}
              >
                <button
                  onClick={() => onTaskSelect(task.id)}
                  className={`flex items-center gap-2 rounded-lg transition-colors w-full ${
                    expanded ? 'px-3 py-2' : 'justify-center w-10 h-10 mx-auto'
                  } ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                  }`}
                >
                {/* Avatar with status dot */}
                <div className="relative flex-shrink-0">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-medium ${
                      isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {initial}
                  </div>
                  <span
                    className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${statusColor} border-2 border-white`}
                  />
                </div>
                {expanded && (
                  <div className="min-w-0 text-left">
                    <p className="text-xs font-medium truncate text-slate-800">{task.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{statusLabel}</p>
                  </div>
                )}
              </button>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}
