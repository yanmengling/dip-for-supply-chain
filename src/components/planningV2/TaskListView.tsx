/**
 * 视图1：监测任务列表
 *
 * PRD v2.8 第 3 章 + 第 9.3 节（导入功能）
 *
 * 数据溯源:
 *   单产品任务: monitoring_task 对象类（远端）
 *   导入: .scb.json 文件 → taskService.importTask()
 */

import React, { useState, useMemo, useRef } from 'react';
import { Plus, Search, Upload, Layers, RotateCcw, X } from 'lucide-react';
import type { PlanningTask, TaskExportPackage, AnyPlanningTask } from '../../types/planningV2';
import { isLargeForecastTask } from '../../types/planningV2';
import { taskService } from '../../services/taskService';
import { multiProductTaskService } from '../../services/multiProductTaskService';
import type { MultiProductTask } from '../../types/multiProductTask';
import TaskCard from './TaskCard';
import ConfirmDialog from './ConfirmDialog';

type TabFilter = 'all' | 'active' | 'closed';

interface TaskListViewProps {
  tasks: AnyPlanningTask[];
  shortageCountMap: Record<string, number>;
  onViewDetail: (taskId: string) => void;
  onEndTask?: (taskId: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onNewTask: () => void;
  onTaskImported: () => void;
  onViewMultiProductTask?: (task: MultiProductTask) => void;
}

export default function TaskListView({
  tasks,
  shortageCountMap,
  onViewDetail,
  onEndTask,
  onDeleteTask,
  onNewTask,
  onTaskImported,
  onViewMultiProductTask,
}: TaskListViewProps) {
  const [tab, setTab] = useState<TabFilter>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'small' | 'large'>('all');
  const [searchText, setSearchText] = useState('');
  const [importPreview, setImportPreview] = useState<TaskExportPackage | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0); // 0=关闭 1=第一次确认 2=第二次确认
  const [mpConfirm, setMpConfirm] = useState<{ type: 'close' | 'delete'; taskId: string; taskName: string } | null>(null);
  const [mpTaskVersion, setMpTaskVersion] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReset = () => {
    localStorage.removeItem('planning_v2_tasks');
    localStorage.removeItem('planning_multi_product_tasks');
    // 清理每日报告
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('planningV2_dailyReports')) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    setResetStep(0);
    window.location.reload();
  };

  const filteredByType = useMemo(() => {
    let list = tasks;
    if (tab === 'active') list = list.filter(t => t.status === 'active');
    if (tab === 'closed') list = list.filter(t =>
      t.status === 'completed' || t.status === 'incomplete' || t.status === 'expired' ||
      (t.status as string) === 'ended' // 向后兼容
    );
    if (typeFilter === 'large') list = [];  // 预测单监测任务（多产品）单独渲染，此处隐藏单产品任务
    if (typeFilter === 'small') list = list.filter(t => !isLargeForecastTask(t));
    return list;
  }, [tasks, tab, typeFilter]);

  const displayedTasks = useMemo(() => {
    if (!searchText.trim()) return filteredByType;
    const q = searchText.trim().toLowerCase();
    return filteredByType.filter(t => t.name.toLowerCase().includes(q));
  }, [filteredByType, searchText]);

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

  const allMultiProductTasks = useMemo(() => multiProductTaskService.getTasks(), [mpTaskVersion]);

  const counts = useMemo(() => ({
    all: tasks.length + allMultiProductTasks.length,
    active: tasks.filter(t => t.status === 'active').length + allMultiProductTasks.filter(t => t.status === 'active').length,
    closed: tasks.filter(t =>
      t.status === 'completed' || t.status === 'incomplete' || t.status === 'expired' ||
      (t.status as string) === 'ended'
    ).length + allMultiProductTasks.filter(t => t.status !== 'active').length,
  }), [tasks, allMultiProductTasks]);

  const tabs: { key: TabFilter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'active', label: '进行中', count: counts.active },
    { key: 'closed', label: '已关闭', count: counts.closed },
  ];

  const multiProductTasks = useMemo(() => {
    let list = allMultiProductTasks;
    if (tab === 'active') list = list.filter(t => t.status === 'active');
    if (tab === 'closed') list = list.filter(t => t.status !== 'active');
    if (typeFilter === 'small') return [];  // 多产品任务不属于"产品监测任务"
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.forecastBillno.toLowerCase().includes(q));
    }
    return list;
  }, [allMultiProductTasks, tab, typeFilter, searchText]);

  return (
    <div className="p-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">监测任务列表</h2>
        <div className="flex items-center gap-2">
          {/* Reset 按钮 */}
          <button
            onClick={() => setResetStep(1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
          >
            <RotateCcw size={15} />
            Reset
          </button>
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

      {/* 类型筛选 */}
      <div className="flex gap-1 mb-3">
        {([
          { key: 'all',   label: '全部' },
          { key: 'large', label: '预测单监测任务' },
          { key: 'small', label: '产品监测任务' },
        ] as const).map(typeTab => (
          <button
            key={typeTab.key}
            onClick={() => setTypeFilter(typeTab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              typeFilter === typeTab.key
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {typeTab.label}
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
      {(displayedTasks.length > 0 || multiProductTasks.length > 0) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayedTasks.filter(t => !isLargeForecastTask(t)).map(task => (
            <TaskCard
              key={task.id}
              task={task as PlanningTask}
              shortageCount={shortageCountMap[task.id]}
              onViewDetail={onViewDetail}
              onEndTask={onEndTask}
              onDeleteTask={onDeleteTask}
            />
          ))}
          {/* MultiProductTask 卡片 */}
          {multiProductTasks.map(task => {
            const isEnded = task.status !== 'active';
            const d = new Date(task.createdAt);
            const dateStr = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
              active:     { label: '进行中', color: 'bg-green-100 text-green-700',   dot: 'bg-green-500' },
              ended:      { label: '已关闭', color: 'bg-gray-100 text-gray-600',     dot: 'bg-gray-400' },
              completed:  { label: '已完成', color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500' },
              incomplete: { label: '未完成', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
              expired:    { label: '已过期', color: 'bg-red-100 text-red-700',       dot: 'bg-red-500' },
            };
            const sc = statusConfig[task.status] ?? statusConfig.active;
            return (
              <div
                key={task.id}
                onClick={() => onViewMultiProductTask?.(task)}
                className="bg-violet-50 rounded-lg border border-violet-200 p-4 hover:border-violet-400 hover:shadow-md transition-all cursor-pointer relative group"
              >
                {/* 顶部：状态 + 任务类型 + 日期 + 删除 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                      {sc.label}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-full">预测单监测任务（多产品）</span>
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <span className="text-xs text-gray-400">{dateStr}</span>
                    {isEnded && (
                      <button
                        type="button"
                        title="删除任务"
                        onClick={() => setMpConfirm({ type: 'delete', taskId: task.id, taskName: task.forecastBillno })}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* 预测单号 */}
                <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  {task.forecastBillno}
                </h3>

                {/* 信息字段 */}
                <div className="space-y-1.5 text-xs text-gray-500">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 w-10 flex-shrink-0">产品</span>
                    <span className="text-gray-700">
                      {task.products[0]?.productCode} {task.products[0]?.productName}
                      {task.products.length > 1 && <span className="text-gray-400 ml-1">等 {task.products.length} 个</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 w-10 flex-shrink-0">需求</span>
                    <span className="text-gray-700">
                      {task.products.reduce((min, p) => p.startDate < min ? p.startDate : min, task.products[0]?.startDate ?? '').slice(5)} ~ {task.products.reduce((max, p) => p.endDate > max ? p.endDate : max, '').slice(5)}
                    </span>
                  </div>
                </div>

                {/* 底部操作 */}
                <div className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => onViewMultiProductTask?.(task)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    查看详情
                  </button>
                  {!isEnded && (
                    <button
                      type="button"
                      onClick={() => setMpConfirm({ type: 'close', taskId: task.id, taskName: task.forecastBillno })}
                      className="text-xs text-gray-500 hover:text-orange-600 font-medium ml-auto"
                    >
                      关闭任务
                    </button>
                  )}
                  {isEnded && (
                    <button
                      type="button"
                      onClick={() => setMpConfirm({ type: 'delete', taskId: task.id, taskName: task.forecastBillno })}
                      className="text-xs text-gray-400 hover:text-red-500 font-medium ml-auto"
                    >
                      删除任务
                    </button>
                  )}
                </div>
              </div>
            );
          })}
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
          description={`确认导入以下任务？\n\n任务名称：${importPreview.task.name}\n产品：${importPreview.task.productCode} ${importPreview.task.productName}\n需求周期：${importPreview.task.demandStart} ~ ${importPreview.task.demandEnd}\n原始状态：${statusLabels[importPreview.task.status] || importPreview.task.status}\n导出时间：${importPreview.exportedAt?.slice(0, 10) || '-'}`}
          confirmLabel="确认导入"
          cancelLabel="取消"
          variant="warning"
          onConfirm={handleConfirmImport}
          onCancel={() => setImportPreview(null)}
        />
      )}

      {/* Reset 第一次确认 */}
      <ConfirmDialog
        open={resetStep === 1}
        variant="warning"
        title="清空任务列表"
        description={`将清除全部 ${tasks.length} 个监测任务及所有每日监测报告记录，此操作不可撤销。\n\n确认继续？`}
        confirmLabel="继续"
        cancelLabel="取消"
        onConfirm={() => setResetStep(2)}
        onCancel={() => setResetStep(0)}
      />

      {/* Reset 第二次确认 */}
      <ConfirmDialog
        open={resetStep === 2}
        variant="danger"
        title="最终确认：清空所有数据"
        description={"数据清空后无法恢复，页面将自动刷新。\n\n确定要清空吗？"}
        confirmLabel="确定清空"
        cancelLabel="取消"
        onConfirm={handleReset}
        onCancel={() => setResetStep(0)}
      />

      {/* 多产品任务关闭/删除确认 */}
      <ConfirmDialog
        open={!!mpConfirm}
        variant={mpConfirm?.type === 'delete' ? 'danger' : 'warning'}
        title={mpConfirm?.type === 'delete' ? '删除多产品任务' : '关闭多产品任务'}
        description={mpConfirm?.type === 'delete'
          ? `确认删除任务「${mpConfirm?.taskName}」？\n\n删除后无法恢复。`
          : `确认关闭任务「${mpConfirm?.taskName}」？\n\n关闭后任务保留但不再进行中，可以重新查看。`
        }
        confirmLabel={mpConfirm?.type === 'delete' ? '确认删除' : '确认关闭'}
        cancelLabel="取消"
        onConfirm={() => {
          if (!mpConfirm) return;
          if (mpConfirm.type === 'delete') {
            multiProductTaskService.deleteTask(mpConfirm.taskId);
          } else {
            multiProductTaskService.closeTask(mpConfirm.taskId);
          }
          setMpConfirm(null);
          setMpTaskVersion(v => v + 1);
        }}
        onCancel={() => setMpConfirm(null)}
      />
    </div>
  );
}
