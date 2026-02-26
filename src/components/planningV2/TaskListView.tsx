import React, { useState, useMemo } from 'react';
import { Plus, Search } from 'lucide-react';
import type { PlanningTask } from '../../types/planningV2';
import TaskCard from './TaskCard';

type TabFilter = 'all' | 'active' | 'closed';

interface TaskListViewProps {
  tasks: PlanningTask[];
  shortageCountMap: Record<string, number>;
  onViewDetail: (taskId: string) => void;
  onEndTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onNewTask: () => void;
}

export default function TaskListView({
  tasks,
  shortageCountMap,
  onViewDetail,
  onEndTask,
  onDeleteTask,
  onNewTask,
}: TaskListViewProps) {
  const [tab, setTab] = useState<TabFilter>('all');
  const [searchText, setSearchText] = useState('');

  const filtered = useMemo(() => {
    let list = tasks;
    if (tab === 'active') list = list.filter(t => t.status === 'active');
    if (tab === 'closed') list = list.filter(t => t.status === 'ended' || t.status === 'expired');
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q));
    }
    return list;
  }, [tasks, tab, searchText]);

  const counts = useMemo(() => ({
    all: tasks.length,
    active: tasks.filter(t => t.status === 'active').length,
    closed: tasks.filter(t => t.status === 'ended' || t.status === 'expired').length,
  }), [tasks]);

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'active', label: '进行中', count: counts.active },
    { key: 'closed', label: '已关闭', count: counts.closed },
  ];

  return (
    <div className="p-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">监测任务列表</h2>
        <button
          onClick={onNewTask}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={16} />
          新建任务
        </button>
      </div>

      {/* Tab 筛选 */}
      <div className="flex items-center gap-4 mb-3 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-2 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}({t.count})
          </button>
        ))}
      </div>

      {/* 搜索栏 */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="搜索任务名称..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
        />
      </div>

      {/* 卡片网格 */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              shortageCount={shortageCountMap[task.id]}
              onViewDetail={onViewDetail}
              onEndTask={onEndTask}
              onDeleteTask={onDeleteTask}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">暂无监测任务</p>
          <p className="text-xs mt-1">点击右上角「新建任务」创建第一个计划协同任务</p>
        </div>
      )}
    </div>
  );
}
