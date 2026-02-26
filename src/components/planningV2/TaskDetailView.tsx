/**
 * 视图3：任务详情
 *
 * 展示已创建监测任务的完整信息：
 * - 计划概览卡片
 * - 实时倒排甘特图
 * - 缺料清单
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import type { PlanningTask, GanttBar } from '../../types/planningV2';
import { ganttService } from '../../services/ganttService';
import GanttChart from './gantt/GanttChart';
import ShortageList from './ShortageList';
import ConfirmDialog from './ConfirmDialog';

interface TaskDetailViewProps {
  task: PlanningTask;
  onBack: () => void;
  onEndTask: (id: string) => void;
}

export default function TaskDetailView({ task, onBack, onEndTask }: TaskDetailViewProps) {
  const [ganttBars, setGanttBars] = useState<GanttBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);

  const fetchGantt = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bars = await ganttService.buildGanttData(
        task.productCode,
        task.productionStart,
        task.productionEnd,
      );
      setGanttBars(bars);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载甘特图数据失败');
    } finally {
      setLoading(false);
    }
  }, [task.productCode, task.productionStart, task.productionEnd]);

  useEffect(() => {
    fetchGantt();
  }, [fetchGantt]);

  // 计算统计信息
  const stats = useMemo(() => {
    const flat = ganttService.flattenGanttBars(ganttBars);
    const materials = flat.filter(b => b.bomLevel > 0);
    return {
      totalMaterials: materials.length,
      shortageCount: materials.filter(b => b.hasShortage).length,
      poCount: materials.filter(b => b.poStatus === 'has_po').length,
    };
  }, [ganttBars]);

  const statusConfig = {
    active: { label: '进行中', color: 'text-green-600 bg-green-50 border-green-200' },
    ended: { label: '已结束', color: 'text-gray-600 bg-gray-50 border-gray-200' },
    expired: { label: '已过期', color: 'text-red-600 bg-red-50 border-red-200' },
  };
  const sc = statusConfig[task.status];

  return (
    <div className="p-6 space-y-4">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title="返回任务列表"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              {task.productCode} {task.productName}
            </h2>
            <p className="text-xs text-gray-500">{task.name}</p>
          </div>
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${sc.color}`}>
            {sc.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchGantt}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            刷新数据
          </button>
          {task.status === 'active' && (
            <button
              onClick={() => setConfirmEndOpen(true)}
              className="px-3 py-1.5 text-xs text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50"
            >
              结束任务
            </button>
          )}
        </div>
      </div>

      {/* 计划概览 */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">计划概览</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs text-slate-500 mb-1">产品需求</div>
            <div className="text-sm text-slate-800">
              <div>{task.productCode} {task.productName}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {task.demandStart} ~ {task.demandEnd} | {task.demandQuantity.toLocaleString()} 套
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">生产计划</div>
            <div className="text-sm text-slate-800">
              <div>{task.productionStart} ~ {task.productionEnd}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {task.productionQuantity.toLocaleString()} 套
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-1">物料概况</div>
            {loading ? (
              <div className="text-xs text-slate-400">加载中...</div>
            ) : (
              <div className="text-sm text-slate-800">
                <span>物料 {stats.totalMaterials} 种</span>
                {stats.shortageCount > 0 && (
                  <span className="text-red-600 ml-2">缺料 {stats.shortageCount} 项</span>
                )}
                <div className="text-xs text-slate-500 mt-0.5">
                  已下PO {stats.poCount} 项
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 倒排甘特图 */}
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-2">倒排甘特图</h3>
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-lg p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-2" />
            <p className="text-sm text-slate-500">正在加载甘特图数据...</p>
          </div>
        ) : error ? (
          <div className="bg-white border border-red-200 rounded-lg p-8 text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-600 mb-2">{error}</p>
            <button onClick={fetchGantt} className="text-xs text-indigo-600 hover:underline">
              重试
            </button>
          </div>
        ) : (
          <GanttChart bars={ganttBars} productionStart={task.productionStart} />
        )}
      </div>

      {/* 缺料清单 */}
      {!loading && !error && (
        <ShortageList bars={ganttBars} />
      )}

      <ConfirmDialog
        open={confirmEndOpen}
        title="结束计划协同任务"
        description="确认结束该计划协同任务？结束后任务将变为只读，无法继续监测。"
        confirmLabel="结束任务"
        cancelLabel="取消"
        variant="warning"
        onConfirm={() => { setConfirmEndOpen(false); onEndTask(task.id); }}
        onCancel={() => setConfirmEndOpen(false)}
      />
    </div>
  );
}
