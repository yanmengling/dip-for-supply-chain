/**
 * 采购工作台 - 左侧可收缩边栏
 *
 * 对齐 PlanningTaskSidebar 结构；风格参考采购个人工作台 v2 HTML 原型。
 * 颜色：主色 #2f6bff / 激活背景 #eef4ff / 边框 #e5ebf3 / 次要文字 #6c7a90
 */

import { useState } from 'react';
import { Tooltip } from 'antd';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  List,
  LayoutDashboard,
  ShoppingCart,
} from 'lucide-react';
import type { ProcurementTask } from '../../types/procurementWorkbench';

type WorkbenchView = 'dashboard' | 'task-list' | 'task-detail' | 'create-task';

interface ProcurementSidebarProps {
  view: WorkbenchView;
  activeTaskId: string | null;
  recentTasks: ProcurementTask[];
  onDashboard: () => void;
  onTaskList: () => void;
  onTaskSelect: (id: string) => void;
  onNewTask: () => void;
}

export default function ProcurementSidebar({
  view,
  activeTaskId,
  recentTasks,
  onDashboard,
  onTaskList,
  onTaskSelect,
  onNewTask,
}: ProcurementSidebarProps) {
  const [expanded, setExpanded] = useState(true);

  const navBtn = (
    opts: {
      icon: React.ReactNode;
      label: string;
      active: boolean;
      onClick: () => void;
      tooltip?: string;
    },
  ) => {
    const { icon, label, active, onClick, tooltip } = opts;
    return (
      <Tooltip
        title={expanded ? undefined : (tooltip ?? label)}
        placement="right"
        mouseEnterDelay={0.3}
      >
        <button
          type="button"
          onClick={onClick}
          className={`flex items-center gap-2 rounded-xl transition-all duration-150 w-full ${
            expanded ? 'px-3 py-2' : 'justify-center w-10 h-10 mx-auto'
          } ${
            active
              ? 'bg-[#2f6bff] text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 hover:text-[#2f6bff]'
          }`}
        >
          <span className="flex-shrink-0">{icon}</span>
          {expanded && <span className="text-sm font-medium truncate">{label}</span>}
        </button>
      </Tooltip>
    );
  };

  return (
    <div
      className={`flex-shrink-0 self-stretch sticky top-0 h-screen bg-white border-r border-[#e5ebf3] flex flex-col py-3 shadow-sm transition-all duration-200 ${
        expanded ? 'w-52' : 'w-14'
      }`}
    >
      {/* 收缩/展开 */}
      <div className={`flex ${expanded ? 'justify-end px-2' : 'justify-center'} mb-2`}>
        <Tooltip
          title={expanded ? '收起侧边栏' : '展开侧边栏'}
          placement="right"
          mouseEnterDelay={0.3}
        >
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6c7a90] hover:text-[#2f6bff] hover:bg-[#eef4ff] transition-colors"
          >
            {expanded ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
          </button>
        </Tooltip>
      </div>

      {/* 新建任务 */}
      <div className="px-2 mb-2">
        {navBtn({
          icon: <Plus size={17} />,
          label: '新建任务',
          active: view === 'create-task',
          onClick: onNewTask,
          tooltip: '新建采购跟单任务',
        })}
      </div>

      {/* 分隔线 */}
      <div className="mx-3 border-t border-[#e5ebf3] mb-2" />

      {/* 任务总览 */}
      <div className="px-2 mb-1">
        {navBtn({
          icon: <LayoutDashboard size={17} />,
          label: '任务总览',
          active: view === 'dashboard',
          onClick: onDashboard,
        })}
      </div>

      {/* 任务列表 */}
      <div className="px-2 mb-2">
        {navBtn({
          icon: <List size={17} />,
          label: '任务列表',
          active: view === 'task-list',
          onClick: onTaskList,
        })}
      </div>

      {/* 分隔线 */}
      {recentTasks.length > 0 && (
        <div className="mx-3 border-t border-[#e5ebf3] mb-2" />
      )}

      {/* 最近任务 */}
      {recentTasks.length > 0 && (
        <div className="px-2 flex flex-col gap-0.5 overflow-y-auto">
          {expanded && (
            <p className="text-[10px] text-[#6c7a90] uppercase tracking-wider font-semibold px-3 mb-1">
              最近任务
            </p>
          )}
          {recentTasks.slice(0, 5).map((task) => {
            const isActive = view === 'task-detail' && activeTaskId === task.id;
            const initial = task.name?.[0] ?? '?';

            return (
              <Tooltip
                key={task.id}
                title={`${task.name} · ${task.status === 'active' ? '进行中' : '已归档'}`}
                placement="right"
                mouseEnterDelay={0.3}
              >
                <button
                  onClick={() => onTaskSelect(task.id)}
                  className={`flex items-center gap-2 rounded-xl transition-all duration-150 w-full text-left ${
                    expanded ? 'px-3 py-2' : 'justify-center w-10 h-10 mx-auto'
                  } ${
                    isActive
                      ? 'bg-[#eef4ff] text-[#2f6bff] ring-1 ring-[#2f6bff]/30'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-[#2f6bff]'
                  }`}
                >
                  {/* Avatar + 状态点 */}
                  <div className="relative flex-shrink-0">
                    <div
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold ${
                        isActive ? 'bg-[#dbeafe] text-[#2f6bff]' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {initial}
                    </div>
                    <span
                      className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border-2 border-white ${
                        task.status === 'active' ? 'bg-[#2fb36d]' : 'bg-[#6c7a90]'
                      }`}
                    />
                  </div>
                  {expanded && (
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate leading-tight">{task.name}</p>
                      <p className="text-[10px] text-[#6c7a90]">
                        {task.status === 'active' ? '进行中' : '已归档'}
                      </p>
                    </div>
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>
      )}

      {/* 底部品牌标识 */}
      {expanded && (
        <div className="mt-auto px-4 pt-3 border-t border-[#e5ebf3]">
          <div className="flex items-center gap-2 text-[#6c7a90]">
            <ShoppingCart size={13} />
            <span className="text-[10px] font-medium">采购工作台</span>
          </div>
        </div>
      )}
    </div>
  );
}
