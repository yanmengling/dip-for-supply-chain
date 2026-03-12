/**
 * 步骤3 智能计划协同 - 甘特图预览 & 创建监测任务
 *
 * PRD v3.1: 原步骤4，移除生产计划步骤后变为步骤3。
 * 倒排锚点改为 step1Data.demandEnd（而非 step2Data.productionStart）。
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronLeft,
  Plus,
  Loader2,
  Package,
  AlertTriangle,
  Calendar,
  ShieldAlert,
} from 'lucide-react';
import { ganttService } from '../../services/ganttService';
import type { DegradationInfo } from '../../services/ganttService';
import { taskService } from '../../services/taskService';
import type { Step1Data, GanttBar, KeyMonitorMaterial } from '../../types/planningV2';
import GanttChart from './gantt/GanttChart';
import ShortageList from './ShortageList';
import MatchingStatusCard from './MatchingStatusCard';
import WorkOrderTracker from './WorkOrderTracker';

interface SmartCollaborationPanelProps {
  active: boolean;
  step1Data: Step1Data;
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

const SmartCollaborationPanel = ({
  active,
  step1Data,
  onCreateTask,
  onBack,
}: SmartCollaborationPanelProps) => {
  const [ganttBars, setGanttBars] = useState<GanttBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskName, setTaskName] = useState('');
  const [keyMaterials, setKeyMaterials] = useState<KeyMonitorMaterial[]>([]);
  const [keyMaterialsLoading, setKeyMaterialsLoading] = useState(false);
  const [degradation, setDegradation] = useState<DegradationInfo>({ mrp: false, pr: false, po: false });

  // ---------- Fetch gantt data + key materials ----------
  const fetchGantt = useCallback(async () => {
    setLoading(true);
    setError(null);
    setKeyMaterials([]);
    try {
      // PRD v3.7: 精确查询链（传入 forecastBillnos + demandStart）
      const result = await ganttService.buildGanttData(
        step1Data.productCode,
        step1Data.demandStart,
        step1Data.demandEnd,
        step1Data.relatedForecastBillnos,
        step1Data.demandStart,
      );
      setGanttBars(result.bars);
      setDegradation(result.degradation);
      console.log(`[SmartCollaboration] 降级状态: MRP=${result.degradation.mrp}, PR=${result.degradation.pr}, PO=${result.degradation.po}`);

      // 甘特图加载完成后，异步加载关键监测物料清单（含库存）
      setKeyMaterialsLoading(true);
      taskService.buildKeyMaterialList(result.bars, new Date().toISOString(), result.inventoryRecords)
        .then(list => {
          console.log(`[SmartCollaboration] 关键监测物料清单: ${list.length} 条`);
          setKeyMaterials(list);
        })
        .catch(err => {
          console.warn('[SmartCollaboration] 关键监测物料清单加载失败:', err);
        })
        .finally(() => setKeyMaterialsLoading(false));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '甘特图数据加载失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [step1Data.productCode, step1Data.demandStart, step1Data.demandEnd]);

  useEffect(() => {
    if (!active) return;
    fetchGantt();
    // Initialise default task name on activation
    setTaskName(
      `${step1Data.productCode}-${step1Data.productName}-${formatTimestamp()}`,
    );
  }, [active, fetchGantt, step1Data.productCode, step1Data.productName]);

  // ---------- Summary stats (PRD D1: 口径与 TaskDetailView 完全一致) ----------
  const stats = useMemo(() => {
    const flat = ganttService.flattenGanttBars(ganttBars);
    const materials = flat.filter(b => b.bomLevel > 0);
    // 按唯一物料编码统计
    const uniqueCodes = new Set(materials.map(b => b.materialCode));
    const shortageCodesSet = new Set(materials.filter(b => b.hasShortage).map(b => b.materialCode));
    const poCodesSet = new Set(materials.filter(b => b.poStatus === 'has_po').map(b => b.materialCode));
    return {
      totalMaterials: uniqueCodes.size,
      shortageCount: shortageCodesSet.size,
      poPlacedCount: poCodesSet.size,
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
      {/* ---- Degradation badge (PRD C4) ---- */}
      {(degradation.mrp || degradation.pr || degradation.po) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>
            数据精度：兜底模式
            {degradation.mrp && ' [MRP]'}
            {degradation.pr && ' [PR]'}
            {degradation.po && ' [PO]'}
            — 部分环节使用物料编码匹配，数据可能包含非本预测单的记录
          </span>
        </div>
      )}

      {/* ---- (a) Gantt Chart Preview ---- */}
      <section>
        <h3 className="text-base font-semibold text-slate-800 mb-3">
          倒排甘特图预览
        </h3>
        {ganttBars.length > 0 ? (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <GanttChart
              bars={ganttBars}
              productionStart={step1Data.demandStart}
              productionEnd={step1Data.demandEnd}
            />
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-sm">
            暂无甘特图数据
          </div>
        )}
      </section>

      {/* ---- (b) Key Material List ---- */}
      <section>
        <ShortageList
          keyMaterials={keyMaterials}
          productCode={step1Data.productCode}
          loading={keyMaterialsLoading}
        />
      </section>

      {/* ---- (b2) Matching Status Card (PRD 4.5.3) ---- */}
      {ganttBars.length > 0 && (
        <section>
          <MatchingStatusCard
            ganttBars={ganttBars}
            demandEnd={step1Data.demandEnd}
            degradation={degradation}
          />
        </section>
      )}

      {/* ---- (b3) Work Order Tracker (PRD 4.5.4) ---- */}
      {ganttBars.length > 0 && (
        <section>
          <WorkOrderTracker
            forecastBillnos={step1Data.relatedForecastBillnos || []}
            productCode={step1Data.productCode}
          />
        </section>
      )}

      {/* ---- (c) Summary Card ---- */}
      <section className="bg-gray-50 rounded-lg p-5">
        <h3 className="text-base font-semibold text-slate-800 mb-4">
          计划协同摘要
        </h3>
        <div className="grid grid-cols-2 gap-4">
          {/* Product & demand info */}
          <div className="flex items-start gap-3">
            <Package className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
            <div className="text-sm text-slate-700 leading-relaxed">
              <p className="font-medium">产品</p>
              <p>
                {step1Data.productCode} {step1Data.productName}
              </p>
              <p className="text-slate-500">
                预测单 {step1Data.relatedForecastBillnos?.length || 0} 单 | 截止 {step1Data.demandEnd} | 需求 {step1Data.demandQuantity} 套
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
