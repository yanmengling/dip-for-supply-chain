/**
 * 视图1：监测任务列表
 *
 * PRD v2.8 第 3 章 + 第 9.3 节（导入功能）
 *
 * 数据溯源:
 *   任务数据: localStorage (planning_v2_tasks)
 *   导入: .scb.json 文件 → taskService.importTask()
 */

import React, { useState, useMemo, useRef } from 'react';
import { Plus, Search, Upload } from 'lucide-react';
import type { PlanningTask, TaskExportPackage } from '../../types/planningV2';
import { taskService } from '../../services/taskService';
import TaskCard from './TaskCard';
import ConfirmDialog from './ConfirmDialog';

type TabFilter = 'all' | 'active' | 'closed';

interface TaskListViewProps {
  tasks: PlanningTask[];
  shortageCountMap: Record<string, number>;
  onViewDetail: (taskId: string) => void;
  onEndTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onNewTask: () => void;
  onTaskImported: () => void;
}

export default function TaskListView({
  tasks,
  shortageCountMap,
  onViewDetail,
  onEndTask,
  onDeleteTask,
  onNewTask,
  onTaskImported,
}: TaskListViewProps) {
  const [tab, setTab] = useState<TabFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [importPreview, setImportPreview] = useState<TaskExportPackage | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    let list = tasks;
    if (tab === 'active') list = list.filter(t => t.status === 'active');
    if (tab === 'closed') list = list.filter(t =>
      t.status === 'completed' || t.status === 'incomplete' || t.status === 'expired' ||
      (t.status as string) === 'ended' // 向后兼容
    );
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q));
    }
    return list;
  }, [tasks, tab, searchText]);

  const counts = useMemo(() => ({
    all: tasks.length,
    active: tasks.filter(t => t.status === 'active').length,
    closed: tasks.filter(t =>
      t.status === 'completed' || t.status === 'incomplete' || t.status === 'expired' ||
      (t.status as string) === 'ended'
    ).length,
  }), [tasks]);

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'active', label: '进行中', count: counts.active },
    { key: 'closed', label: '已关闭', count: counts.closed },
  ];

  // 导入文件处理
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log(`[TaskListView] 导入文件: ${file.name}, size=${file.size}`);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const pkg = JSON.parse(evt.target?.result as string) as TaskExportPackage;
        if (pkg.version !== '1.0' || !pkg.task) {
          setImportError('文件格式不正确或版本不支持');
          return;
        }
        setImportPreview(pkg);
        setImportError(null);
      } catch {
        setImportError('文件解析失败，请确认是有效的 .scb.json 文件');
      }
    };
    reader.readAsText(file);
    // 重置 input 以允许重复选择同一文件
    e.target.value = '';
  };

  const handleConfirmImport = () => {
    if (!importPreview) return;
    try {
      taskService.importTask(importPreview);
      setImportPreview(null);
      onTaskImported();
      console.log('[TaskListView] 任务导入成功');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : '导入失败');
    }
  };

  const statusLabels: Record<string, string> = {
    active: '进行中', completed: '已完成', incomplete: '未完成', expired: '已过期', ended: '已结束',
  };

  return (
    <div className="p-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">监测任务列表</h2>
        <div className="flex items-center gap-2">
          {/* 导入按钮 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".scb.json,.json"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Upload size={16} />
            导入任务
          </button>
          {/* 新建按钮 */}
          <button
            onClick={onNewTask}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus size={16} />
            新建任务
          </button>
        </div>
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

      {/* 导入错误提示 */}
      {importError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {importError}
          <button
            onClick={() => setImportError(null)}
            className="ml-2 text-red-400 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      )}

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

      {/* 导入预览对话框 */}
      {importPreview && (
        <ConfirmDialog
          open={true}
          title="导入监测任务"
          description={`确认导入以下任务？\n\n任务名称：${importPreview.task.name}\n产品：${importPreview.task.productCode} ${importPreview.task.productName}\n生产周期：${importPreview.task.productionStart} ~ ${importPreview.task.productionEnd}\n原始状态：${statusLabels[importPreview.task.status] || importPreview.task.status}\n导出时间：${importPreview.exportedAt?.slice(0, 10) || '-'}`}
          confirmLabel="确认导入"
          cancelLabel="取消"
          variant="warning"
          onConfirm={handleConfirmImport}
          onCancel={() => setImportPreview(null)}
        />
      )}
    </div>
  );
}
