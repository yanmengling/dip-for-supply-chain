/**
 * 采购工作台 - 视图 B：任务列表
 *
 * 展示所有采购跟单任务，支持搜索/状态筛选/管理操作（归档/删除）。
 * 风格：#f4f7fb 背景，白色卡片 + 3px 顶部色条，#2f6bff 主色。
 */

import { useState } from 'react';
import { Search, Plus, Archive, Trash2, ArrowRight, Calendar, Tag } from 'lucide-react';
import type { ProcurementTask } from '../../types/procurementWorkbench';

type FilterTab = 'all' | 'active' | 'archived';

interface ProcurementTaskListViewProps {
  tasks: ProcurementTask[];
  onTaskSelect: (id: string) => void;
  onNewTask: () => void;
  onArchive: (id: string) => void;
  onRemove: (id: string) => void;
}

export default function ProcurementTaskListView({
  tasks,
  onTaskSelect,
  onNewTask,
  onArchive,
  onRemove,
}: ProcurementTaskListViewProps) {
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = tasks.filter((t) => {
    const matchStatus =
      filterTab === 'all' ||
      (filterTab === 'active' && t.status === 'active') ||
      (filterTab === 'archived' && t.status === 'archived');
    const matchSearch =
      !search.trim() || t.name.toLowerCase().includes(search.trim().toLowerCase());
    return matchStatus && matchSearch;
  });

  const tabCounts = {
    all: tasks.length,
    active: tasks.filter((t) => t.status === 'active').length,
    archived: tasks.filter((t) => t.status === 'archived').length,
  };

  const tabs: Array<{ id: FilterTab; label: string }> = [
    { id: 'all', label: '全部' },
    { id: 'active', label: '进行中' },
    { id: 'archived', label: '已归档' },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#f4f7fb]">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-3 mb-5">
        <h2 className="text-base font-bold text-[#1f2d3d] mr-1">任务列表</h2>

        {/* 搜索框 */}
        <div className="relative flex-1 max-w-72">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6c7a90] pointer-events-none"
          />
          <input
            type="text"
            placeholder="搜索任务名称..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-xs rounded-xl border border-[#e5ebf3] bg-white text-slate-700 placeholder-[#6c7a90] focus:outline-none focus:ring-2 focus:ring-[#2f6bff]/30 focus:border-[#2f6bff] transition-colors"
          />
        </div>

        {/* 状态筛选 Tab */}
        <div className="flex items-center bg-[#f4f7fb] border border-[#e5ebf3] rounded-xl p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 ${
                filterTab === tab.id
                  ? 'bg-[#2f6bff] text-white shadow-sm'
                  : 'text-[#6c7a90] hover:text-[#2f6bff]'
              }`}
            >
              {tab.label}
              <span
                className={`ml-1.5 text-[10px] font-bold ${
                  filterTab === tab.id ? 'text-blue-100' : 'text-[#6c7a90]'
                }`}
              >
                {tabCounts[tab.id]}
              </span>
            </button>
          ))}
        </div>

        {/* 新建按钮 */}
        <button
          onClick={onNewTask}
          className="ml-auto flex items-center gap-1.5 h-8 px-4 text-xs font-semibold text-white bg-[#2f6bff] hover:bg-[#2558e0] rounded-xl transition-colors shadow-sm"
        >
          <Plus size={14} />
          新建任务
        </button>
      </div>

      {/* 任务卡片网格 */}
      {filtered.length === 0 ? (
        <EmptyTaskList onNewTask={onNewTask} hasSearch={!!search.trim()} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onSelect={() => onTaskSelect(task.id)}
              onArchive={() => onArchive(task.id)}
              onRemove={() => setConfirmDelete(task.id)}
            />
          ))}
        </div>
      )}

      {/* 删除二次确认 */}
      {confirmDelete && (
        <DeleteConfirmModal
          taskName={tasks.find((t) => t.id === confirmDelete)?.name ?? ''}
          onConfirm={() => {
            onRemove(confirmDelete);
            setConfirmDelete(null);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

/* ---------- 任务卡片 ---------- */
function TaskCard({
  task,
  onSelect,
  onArchive,
  onRemove,
}: {
  task: ProcurementTask;
  onSelect: () => void;
  onArchive: () => void;
  onRemove: () => void;
}) {
  const f = task.filter;
  const filterItems = [
    { label: 'PR单号', count: f.prBillnos.length },
    { label: '项目号', count: f.projectIds.length },
    { label: '物料编码', count: f.materialNumbers.length },
    { label: '物料名称', count: f.materialNames.length },
  ].filter((it) => it.count > 0);

  const demandDateCount = Object.keys(task.prDemandDates).length;
  const isActive = task.status === 'active';

  const createdDate = new Date(task.createdAt).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  });

  return (
    <div className="bg-white rounded-2xl border border-[#e5ebf3] shadow-[0_8px_24px_rgba(26,48,92,0.07)] overflow-hidden group hover:-translate-y-0.5 transition-all duration-200">
      {/* 3px 顶部色条 */}
      <div className={`h-[3px] ${isActive ? 'bg-[#2f6bff]' : 'bg-[#6c7a90]'}`} />

      <div className="p-5">
        {/* 头部：状态 + 类型 + 日期 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                isActive
                  ? 'bg-[#ebfff2] text-[#2fb36d]'
                  : 'bg-slate-100 text-[#6c7a90]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-[#2fb36d]' : 'bg-[#6c7a90]'}`}
              />
              {isActive ? '进行中' : '已归档'}
            </span>
            <span className="text-[10px] text-[#6c7a90] flex items-center gap-1">
              <Tag size={10} />
              采购跟单任务
            </span>
          </div>
          <span className="text-[10px] text-[#6c7a90] flex items-center gap-1">
            <Calendar size={10} />
            {createdDate}
          </span>
        </div>

        {/* 任务名 */}
        <h3 className="text-sm font-bold text-[#1f2d3d] mb-3 leading-snug">{task.name}</h3>

        {/* 过滤维度 */}
        {filterItems.length > 0 ? (
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            {filterItems.map((it) => (
              <span
                key={it.label}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#f4f7fb] border border-[#e5ebf3] rounded-lg text-[10px] text-[#6c7a90]"
              >
                <span className="font-medium text-[#1f2d3d]">{it.label}</span>
                <span className="text-[#2f6bff] font-bold">{it.count} 项</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-[#6c7a90] mb-3">未设置过滤条件</p>
        )}

        {/* 摘要数据 */}
        <div className="flex items-center gap-3 text-[10px] text-[#6c7a90] mb-4">
          <span>
            需求日期{' '}
            <span className="font-semibold text-[#1f2d3d]">{demandDateCount}</span> 条
          </span>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-between">
          <button
            onClick={onSelect}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#2f6bff] bg-[#eef4ff] hover:bg-[#dbeafe] rounded-xl transition-colors"
          >
            进入跟单
            <ArrowRight size={12} />
          </button>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {isActive && (
              <button
                onClick={(e) => { e.stopPropagation(); onArchive(); }}
                title="归档"
                className="p-1.5 text-[#6c7a90] hover:text-[#ff9f43] hover:bg-[#fff6eb] rounded-lg transition-colors"
              >
                <Archive size={13} />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              title="删除"
              className="p-1.5 text-[#6c7a90] hover:text-[#f25f5c] hover:bg-[#fff2f1] rounded-lg transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- 空状态 ---------- */
function EmptyTaskList({
  onNewTask,
  hasSearch,
}: {
  onNewTask: () => void;
  hasSearch: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[320px] text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#eef4ff] text-[#2f6bff] flex items-center justify-center mb-4">
        <Search size={24} />
      </div>
      <h3 className="text-sm font-bold text-[#1f2d3d] mb-1">
        {hasSearch ? '未找到匹配任务' : '暂无任务'}
      </h3>
      <p className="text-xs text-[#6c7a90] mb-4 max-w-xs">
        {hasSearch
          ? '尝试修改搜索关键词'
          : '新建任务以确定本次跟单范围，开始采购跟单。'}
      </p>
      {!hasSearch && (
        <button
          onClick={onNewTask}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2f6bff] hover:bg-[#2558e0] rounded-xl transition-colors"
        >
          <Plus size={13} />
          新建任务
        </button>
      )}
    </div>
  );
}

/* ---------- 删除确认模态框 ---------- */
function DeleteConfirmModal({
  taskName,
  onConfirm,
  onCancel,
}: {
  taskName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl border border-[#e5ebf3] p-6 w-80 max-w-[90vw]">
        <h4 className="text-sm font-bold text-[#1f2d3d] mb-2">确认删除任务</h4>
        <p className="text-xs text-[#6c7a90] mb-5 leading-relaxed">
          确定要删除任务「<span className="font-semibold text-[#1f2d3d]">{taskName}</span>
          」吗？删除后数据不可恢复，包含已维护的需求日期。
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 text-xs font-medium text-[#6c7a90] bg-[#f4f7fb] hover:bg-slate-100 rounded-xl transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-[#f25f5c] hover:bg-red-600 rounded-xl transition-colors"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}
