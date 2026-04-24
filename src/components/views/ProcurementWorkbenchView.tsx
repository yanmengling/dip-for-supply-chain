/**
 * 采购工作台 - 主入口视图 (v0.4.0)
 *
 * 布局：左侧可收缩边栏 + 右侧四视图路由
 *   视图 A（dashboard）    ：任务总览 Dashboard
 *   视图 B（task-list）    ：任务列表（搜索/筛选/操作）
 *   视图 C（task-detail）  ：任务详情（6 模块 Tab 切换）
 *   视图 D（create-task）  ：新建任务（搜索 PR 记录 + 维度添加）
 *
 * 整体背景：#f4f7fb，顶部渐变 #eef3ff → #f4f7fb (220px)。
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { procurementTaskService } from '../../services/procurementTaskService';
import type { ProcurementTask } from '../../types/procurementWorkbench';

import ProcurementSidebar from '../procurement-workbench/ProcurementSidebar';
import ProcurementDashboardView from '../procurement-workbench/ProcurementDashboardView';
import ProcurementTaskListView from '../procurement-workbench/ProcurementTaskListView';
import ProcurementTaskDetailView from '../procurement-workbench/ProcurementTaskDetailView';
import CreateTaskPanel from '../procurement-workbench/CreateTaskPanel';

type WorkbenchView = 'dashboard' | 'task-list' | 'task-detail' | 'create-task';

interface ProcurementWorkbenchViewProps {
  toggleCopilot?: () => void;
}

export default function ProcurementWorkbenchView({ toggleCopilot: _toggleCopilot }: ProcurementWorkbenchViewProps) {
  const [tasks, setTasks] = useState<ProcurementTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [view, setView] = useState<WorkbenchView>('dashboard');

  const refresh = useCallback(() => {
    const allTasks = procurementTaskService.getActiveTasks();
    setTasks(allTasks);
    const persistedId = procurementTaskService.getActiveTaskId();
    if (persistedId && allTasks.some((t) => t.id === persistedId)) {
      setActiveTaskId(persistedId);
    } else if (allTasks.length > 0) {
      setActiveTaskId(allTasks[0].id);
      procurementTaskService.setActiveTaskId(allTasks[0].id);
    } else {
      setActiveTaskId(null);
      procurementTaskService.setActiveTaskId(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleTaskSelect = (id: string) => {
    setActiveTaskId(id);
    procurementTaskService.setActiveTaskId(id);
    setView('task-detail');
  };

  const handleCreated = (task: ProcurementTask) => {
    refresh();
    setActiveTaskId(task.id);
    setView('task-detail');
  };

  const handleArchive = (id: string) => {
    procurementTaskService.archive(id);
    refresh();
    // 若正在查看该任务详情，返回列表
    if (activeTaskId === id && view === 'task-detail') {
      setView('task-list');
    }
  };

  const handleRemove = (id: string) => {
    procurementTaskService.remove(id);
    refresh();
    if (activeTaskId === id && view === 'task-detail') {
      setView('dashboard');
    }
  };

  // 稳定 activeTask 引用，避免子组件因引用变化触发不必要重新请求
  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeTaskId) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeTaskId, tasks],
  );

  // 边栏最近任务（最多 5 条，进行中优先）
  const recentTasks = useMemo(
    () =>
      [...tasks]
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        })
        .slice(0, 5),
    [tasks],
  );

  return (
    <div
      className="h-full flex"
      style={{
        background: 'linear-gradient(180deg, #eef3ff 0px, #f4f7fb 220px) #f4f7fb',
      }}
    >
      {/* 左侧边栏 */}
      <ProcurementSidebar
        view={view}
        activeTaskId={activeTaskId}
        recentTasks={recentTasks}
        onDashboard={() => setView('dashboard')}
        onTaskList={() => setView('task-list')}
        onTaskSelect={handleTaskSelect}
        onNewTask={() => setView('create-task')}
      />

      {/* 右侧内容区 */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {view === 'dashboard' && (
          <ProcurementDashboardView
            tasks={tasks}
            onTaskSelect={handleTaskSelect}
            onNewTask={() => setView('create-task')}
          />
        )}

        {view === 'task-list' && (
          <ProcurementTaskListView
            tasks={tasks}
            onTaskSelect={handleTaskSelect}
            onNewTask={() => setView('create-task')}
            onArchive={handleArchive}
            onRemove={handleRemove}
          />
        )}

        {view === 'task-detail' && activeTask ? (
          <ProcurementTaskDetailView
            task={activeTask}
            onBack={() => setView('task-list')}
            onTaskMutated={refresh}
          />
        ) : view === 'task-detail' ? (
          /* 任务已被删除或加载中，回退到 Dashboard */
          <ProcurementDashboardView
            tasks={tasks}
            onTaskSelect={handleTaskSelect}
            onNewTask={() => setView('create-task')}
          />
        ) : null}

        {view === 'create-task' && (
          <CreateTaskPanel
            onCreated={handleCreated}
            onCancel={() => setView('dashboard')}
          />
        )}
      </div>
    </div>
  );
}
