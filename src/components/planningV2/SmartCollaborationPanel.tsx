/**
 * 步骤④ 智能计划协同 - 甘特图预览 & 创建监测任务
 *
 * 展示倒排甘特图预览、计划协同摘要，并允许用户创建监测任务。
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  Plus,
  Loader2,
  Package,
  Factory,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import { ganttService } from '../../services/ganttService';
import type { Step1Data, Step2Data, GanttBar } from '../../types/planningV2';
import GanttChart from './gantt/GanttChart';

interface SmartCollaborationPanelProps {
  active: boolean;
  step1Data: Step1Data;
  step2Data: Step2Data;
  onCreateTask: (taskName: string) => void;
  onBack: () => void;
}

/** Format current time as YYYYMMDDHHmm */
function formatTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

/** Recursively collect all non-root bars */
function collectBars(bars: GanttBar[]): GanttBar[] {
  const result: GanttBar[] = [];
  function walk(bar: GanttBar, isRoot: boolean) {
    if (!isRoot) result.push(bar);
    bar.children.forEach((child) => walk(child, false));
  }
  bars.forEach((bar) => walk(bar, true));
  return result;
}

const SmartCollaborationPanel = ({
  active,
  step1Data,
  step2Data,
  onCreateTask,
  onBack,
}: SmartCollaborationPanelProps) => {
  const [ganttBars, setGanttBars] = useState<GanttBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskName, setTaskName] = useState('');

  // ---------- Fetch gantt data ----------
  const fetchGantt = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const bars = await ganttService.buildGanttData(
        step1Data.productCode,
        step2Data.productionStart,
        step2Data.productionEnd,
      );
      setGanttBars(bars);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '甘特图数据加载失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [step1Data.productCode, step2Data.productionStart, step2Data.productionEnd]);

  useEffect(() => {
    if (!active) return;
    fetchGantt();
    // Initialise default task name on activation
    setTaskName(
      `${step1Data.productCode}-${step1Data.productName}-${formatTimestamp()}`,
    );
  }, [active, fetchGantt, step1Data.productCode, step1Data.productName]);

  // ---------- Summary stats ----------
  const stats = useMemo(() => {
    const all = collectBars(ganttBars);
    return {
      totalMaterials: all.length,
      shortageCount: all.filter((b) => b.hasShortage).length,
      poPlacedCount: all.filter((b) => b.poStatus === 'has_po').length,
    };
  }, [ganttBars]);

  if (!active) return null;

  // ---------- Loading state ----------
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-500">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
        <p className="text-sm">正在生成倒排甘特图...</p>
      </div>
    );
  }

  // ---------- Error state ----------
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-500">
        <AlertTriangle className="w-10 h-10 text-red-400 mb-4" />
        <p className="text-sm text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchGantt}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ---- (a) Gantt Chart Preview ---- */}
      <section>
        <h3 className="text-base font-semibold text-slate-800 mb-3">
          倒排甘特图预览
        </h3>
        {ganttBars.length > 0 ? (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <GanttChart
              bars={ganttBars}
              productionStart={step2Data.productionStart}
            />
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
            暂无甘特图数据
          </div>
        )}
      </section>

      {/* ---- (b) Summary Card ---- */}
      <section className="bg-gray-50 rounded-lg p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-4">
          计划协同摘要
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {/* Product info */}
          <div className="flex items-start gap-3">
            <Package className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
            <div className="text-sm text-slate-700 leading-relaxed">
              <p className="font-medium">产品</p>
              <p>
                {step1Data.productCode} {step1Data.productName}
              </p>
              <p className="text-slate-500">
                {step1Data.demandStart} ~ {step1Data.demandEnd}
              </p>
            </div>
          </div>

          {/* Production info */}
          <div className="flex items-start gap-3">
            <Factory className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
            <div className="text-sm text-slate-700 leading-relaxed">
              <p className="font-medium">生产</p>
              <p>
                {step2Data.productionStart} ~ {step2Data.productionEnd}
              </p>
              <p className="text-slate-500">
                {step2Data.productionQuantity} 套
              </p>
            </div>
          </div>

          {/* Material info */}
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm text-slate-700 leading-relaxed">
              <p className="font-medium">物料</p>
              <p>{stats.totalMaterials} 种</p>
              <p className="text-orange-600">
                <AlertTriangle className="w-3.5 h-3.5 inline -mt-0.5 mr-0.5" />
                缺料: {stats.shortageCount} 项
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- (c) Task Name Input ---- */}
      <section>
        <label
          htmlFor="task-name"
          className="block text-sm font-medium text-slate-700 mb-2"
        >
          监测任务名称
        </label>
        <input
          id="task-name"
          type="text"
          className="w-full px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          value={taskName}
          onChange={(e) => setTaskName(e.target.value)}
        />
      </section>

      {/* ---- (d) Action Buttons ---- */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          上一步
        </button>

        <button
          onClick={() => onCreateTask(taskName)}
          disabled={!taskName.trim()}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          添加监测任务
        </button>
      </div>
    </div>
  );
};

export default SmartCollaborationPanel;
