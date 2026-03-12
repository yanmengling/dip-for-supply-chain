/**
 * 视图3：任务详情
 *
 * PRD v2.8 第 6 章
 *
 * 展示已创建监测任务的完整信息：
 * - 计划概览卡片
 * - 总结报告（仅已结束任务）
 * - 实时倒排甘特图
 * - 关键监测物料清单（含库存信息）
 * - 导出菜单（JSON + Markdown）
 * - 结束任务流程（含入库检查）
 *
 * 数据溯源:
 *   甘特图: ganttService.buildGanttData() → 每次进入实时计算
 *   关键物料: taskService.buildKeyMaterialList() → 含 inventory API
 *   总结报告: task.summaryReport（结束时生成并持久化到 localStorage）
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowLeft, Loader2, AlertTriangle, RefreshCw, FileDown, ChevronDown, ShieldAlert } from 'lucide-react';
import type { PlanningTask, GanttBar, KeyMonitorMaterial } from '../../types/planningV2';
import { ganttService } from '../../services/ganttService';
import type { DegradationInfo } from '../../services/ganttService';
import { taskService } from '../../services/taskService';
import GanttChart from './gantt/GanttChart';
import ShortageList from './ShortageList';
import MatchingStatusCard from './MatchingStatusCard';
import WorkOrderTracker from './WorkOrderTracker';
import AlertBanner from './AlertBanner';
import DailyMonitoringReport from './DailyMonitoringReport';
import TaskSummaryReportView from './TaskSummaryReport';
import ConfirmDialog from './ConfirmDialog';
import DataLineagePanel from './DataLineagePanel';

interface TaskDetailViewProps {
  task: PlanningTask;
  onBack: () => void;
  onTaskUpdated: (task: PlanningTask) => void;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: '进行中', color: 'text-green-600 bg-green-50 border-green-200' },
  completed: { label: '已完成', color: 'text-blue-600 bg-blue-50 border-blue-200' },
  incomplete: { label: '未完成', color: 'text-orange-600 bg-orange-50 border-orange-200' },
  expired: { label: '已过期', color: 'text-red-600 bg-red-50 border-red-200' },
  // 向后兼容
  ended: { label: '已结束', color: 'text-gray-600 bg-gray-50 border-gray-200' },
};

export default function TaskDetailView({ task, onBack, onTaskUpdated }: TaskDetailViewProps) {
  const [ganttBars, setGanttBars] = useState<GanttBar[]>([]);
  const [keyMaterials, setKeyMaterials] = useState<KeyMonitorMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyMaterialsLoading, setKeyMaterialsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [endingTask, setEndingTask] = useState(false);
  const [endCheckMessage, setEndCheckMessage] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [degradation, setDegradation] = useState<DegradationInfo>({ mrp: false, pr: false, po: false });
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // 关闭导出菜单的外部点击处理
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    if (exportMenuOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [exportMenuOpen]);

  const fetchGantt = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // PRD v3.7: 精确查询链（传入 forecastBillnos + demandStart）
      const result = await ganttService.buildGanttData(
        task.productCode,
        task.demandStart,
        task.demandEnd,
        task.relatedForecastBillnos,
        task.demandStart,
      );
      setGanttBars(result.bars);
      setDegradation(result.degradation);
      console.log(`[TaskDetailView] 降级状态: MRP=${result.degradation.mrp}, PR=${result.degradation.pr}, PO=${result.degradation.po}`);

      // 加载关键监测物料清单（含库存）
      setKeyMaterialsLoading(true);
      try {
        const km = await taskService.buildKeyMaterialList(result.bars, task.createdAt, result.inventoryRecords);
        setKeyMaterials(km);
      } catch (err) {
        console.error('[TaskDetailView] 关键物料清单加载失败:', err);
        setKeyMaterials([]);
      } finally {
        setKeyMaterialsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载甘特图数据失败');
    } finally {
      setLoading(false);
    }
  }, [task.productCode, task.demandStart, task.demandEnd, task.createdAt]);

  useEffect(() => {
    fetchGantt();
  }, [fetchGantt]);

  // 结束任务流程
  const handleEndTask = useCallback(async () => {
    setEndingTask(true);
    try {
      // 1. 检查产品入库
      const endResult = await taskService.checkProductInbound(task);
      setEndCheckMessage(endResult.message);

      // 2. 生成总结报告并更新任务
      const updatedTask = await taskService.endTaskWithReport(
        task.id,
        endResult,
        ganttBars,
        keyMaterials,
      );

      if (updatedTask) {
        onTaskUpdated(updatedTask);
      }
    } catch (err) {
      console.error('[TaskDetailView] 结束任务失败:', err);
      setEndCheckMessage('结束任务失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setEndingTask(false);
      setConfirmEndOpen(false);
    }
  }, [task, ganttBars, keyMaterials, onTaskUpdated]);

  // 导出 JSON
  const handleExportJSON = useCallback(() => {
    const pkg = taskService.exportTaskAsJSON(task, ganttBars, keyMaterials);
    const json = JSON.stringify(pkg, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${task.name}_${task.productCode}_${new Date().toISOString().slice(0, 10)}.scb.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMenuOpen(false);
  }, [task, ganttBars, keyMaterials]);

  // 导出 Markdown（增强版，含总结报告和关键物料）
  const handleExportMarkdown = useCallback(() => {
    if (ganttBars.length === 0) return;
    const statusLabels: Record<string, string> = {
      active: '进行中', completed: '已完成', incomplete: '未完成', expired: '已过期',
    };
    const today = new Date().toISOString().slice(0, 10);

    const lines: string[] = [
      `# 供应链监测任务报告`,
      ``,
      `> 导出时间：${today}`,
      `> 任务状态：${statusLabels[task.status] || task.status}`,
      `> 适用场景：供应链智能体分析、采购跟进、风险预警`,
      ``,
      `## 1. 任务基本信息`,
      ``,
      `| 字段 | 值 |`,
      `|------|----|`,
      `| 任务名称 | ${task.name} |`,
      `| 产品编码 | ${task.productCode} |`,
      `| 产品名称 | ${task.productName} |`,
      `| 需求周期 | ${task.demandStart} ~ ${task.demandEnd} |`,
      `| 需求数量 | ${task.demandQuantity.toLocaleString()} 套 |`,
      `| 关联预测单 | ${task.relatedForecastBillnos?.join(', ') || '-'} |`,
      `| 任务状态 | ${statusLabels[task.status] || task.status} |`,
      `| 创建时间 | ${task.createdAt} |`,
      ``,
    ];

    // 总结报告（仅已结束任务）
    if (task.summaryReport) {
      const r = task.summaryReport;
      lines.push(`## 2. 总结报告`);
      lines.push(``);
      lines.push(`### 2.1 计划 vs 实际对比`);
      lines.push(`| 对比项 | 计划值 | 实际值 | 差异 |`);
      lines.push(`|--------|--------|--------|------|`);
      const inboundStr = r.planVsActual.actualInboundDate
        ? `入库时间: ${r.planVsActual.actualInboundDate.slice(0, 10)}`
        : '无入库记录';
      const diffStr = r.planVsActual.timeDiffDays != null
        ? `${r.planVsActual.timeDiffDays > 0 ? '+' : ''}${r.planVsActual.timeDiffDays} 天`
        : '-';
      lines.push(`| 生产周期 | ${r.planVsActual.productionPeriod.start} ~ ${r.planVsActual.productionPeriod.end} | ${inboundStr} | ${diffStr} |`);
      const qtyStr = r.productCompletion.inboundQuantity != null
        ? `入库 ${r.productCompletion.inboundQuantity.toLocaleString()} 套`
        : '-';
      const rateStr = r.productCompletion.completionRate != null
        ? `完成率 ${r.productCompletion.completionRate}%`
        : '-';
      lines.push(`| 生产数量 | ${r.productCompletion.plannedQuantity.toLocaleString()} 套 | ${qtyStr} | ${rateStr} |`);
      lines.push(``);
      lines.push(`### 2.2 物料完成统计`);
      lines.push(`| 指标 | 数值 |`);
      lines.push(`|------|------|`);
      lines.push(`| BOM 物料总数 | ${r.materialCompletion.totalMaterials} |`);
      lines.push(`| 已下PO | ${r.materialCompletion.withPO} |`);
      lines.push(`| 缺口物料 | ${r.materialCompletion.shortageCount} |`);
      lines.push(``);
    }

    // 关键监测物料清单
    lines.push(`## 3. 关键监测物料清单`);
    lines.push(``);
    if (keyMaterials.length > 0) {
      lines.push(`| 物料编码 | 物料名称 | 类型 | 层级 | 缺口 | 当前库存 | 可用库存 | 新入库 | PR | PO | 倒排开始 | 倒排到货 |`);
      lines.push(`|----------|----------|------|------|------|----------|----------|--------|----|----|----------|----------|`);
      for (const m of keyMaterials) {
        const shortage = m.hasShortage ? String(m.shortageQuantity) : '-';
        const invQty = m.inventoryQty != null ? String(m.inventoryQty) : '-';
        const availQty = m.availableInventoryQty != null ? String(m.availableInventoryQty) : '-';
        const newInb = m.newInboundQty != null ? String(m.newInboundQty) : '-';
        const pr = m.prStatus === 'has_pr' ? '✅' : m.prStatus === 'no_pr' ? '❌' : '-';
        const po = m.poStatus === 'has_po' ? '✅' : m.poStatus === 'no_po' ? '❌' : '-';
        lines.push(`| ${m.materialCode} | ${m.materialName} | ${m.materialType} | L${m.bomLevel} | ${shortage} | ${invQty} | ${availQty} | ${newInb} | ${pr} | ${po} | ${m.startDate} | ${m.endDate} |`);
      }
    } else {
      lines.push(`> 无关键监测物料`);
    }
    lines.push(``);

    // 甘特图
    const ganttMd = ganttService.exportGanttAsMarkdown(ganttBars, {
      taskName: task.name,
      productCode: task.productCode,
      productName: task.productName,
      productionStart: task.demandStart,
      productionEnd: task.demandEnd,
      productionQuantity: task.demandQuantity,
      demandStart: task.demandStart,
      demandEnd: task.demandEnd,
      demandQuantity: task.demandQuantity,
    });
    // 提取甘特图第4章内容（跳过标题和前3章）
    const ganttSection = ganttMd.split('## 4.')[1];
    if (ganttSection) {
      lines.push(`## 4.${ganttSection}`);
    }

    lines.push(``);
    lines.push(`---`);
    lines.push(`*本文档由供应链大脑系统自动生成，可直接提供给智能体进行分析和决策支持。*`);

    const md = lines.join('\n');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `监测任务报告_${task.productCode}_${today}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMenuOpen(false);
  }, [ganttBars, keyMaterials, task]);

  // 计算统计信息
  const stats = useMemo(() => {
    const flat = ganttService.flattenGanttBars(ganttBars);
    const materials = flat.filter(b => b.bomLevel > 0);
    // 按唯一物料编码统计，与 MRP 面板和甘特图总结卡片口径一致
    const uniqueCodes = new Set(materials.map(b => b.materialCode));
    const shortageCodesSet = new Set(materials.filter(b => b.hasShortage).map(b => b.materialCode));
    const poCodesSet = new Set(materials.filter(b => b.poStatus === 'has_po').map(b => b.materialCode));
    return {
      totalMaterials: uniqueCodes.size,
      shortageCount: shortageCodesSet.size,
      poCount: poCodesSet.size,
    };
  }, [ganttBars]);

  const sc = statusConfig[task.status] || statusConfig.active;
  const isEnded = task.status === 'completed' || task.status === 'incomplete';

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

          {/* 导出下拉菜单 */}
          {!loading && !error && ganttBars.length > 0 && (
            <div className="relative" ref={exportMenuRef}>
              <button
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"
              >
                <FileDown size={14} />
                导出
                <ChevronDown size={12} />
              </button>
              {exportMenuOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-20">
                  <button
                    onClick={handleExportJSON}
                    className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-t-lg"
                  >
                    导出 JSON（可恢复）
                  </button>
                  <button
                    onClick={handleExportMarkdown}
                    className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-b-lg border-t border-slate-100"
                  >
                    导出 Markdown（报告）
                  </button>
                </div>
              )}
            </div>
          )}

          {task.status === 'active' && (
            <button
              onClick={() => setConfirmEndOpen(true)}
              className="px-3 py-1.5 text-xs text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50"
              disabled={loading || endingTask}
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
            <div className="text-xs text-slate-500 mb-1">关联预测单</div>
            <div className="text-sm text-slate-800">
              <div>{task.relatedForecastBillnos?.length || 0} 单</div>
              <div className="text-xs text-slate-500 mt-0.5 font-mono truncate max-w-[200px]">
                {task.relatedForecastBillnos?.join(', ') || '-'}
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

      {/* 降级模式标识 (PRD C4) */}
      {!loading && (degradation.mrp || degradation.pr || degradation.po) && (
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

      {/* 预警横幅 (PRD 10.3) */}
      {!loading && !error && ganttBars.length > 0 && task.status === 'active' && (
        <AlertBanner ganttBars={ganttBars} demandEnd={task.demandEnd} />
      )}

      {/* 总结报告（仅已结束任务） */}
      {isEnded && task.summaryReport && (
        <TaskSummaryReportView report={task.summaryReport} />
      )}

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
          <GanttChart bars={ganttBars} productionStart={task.demandStart} productionEnd={task.demandEnd} />
        )}
      </div>

      {/* 关键监测物料清单 */}
      {!loading && !error && (
        <ShortageList
          keyMaterials={keyMaterials}
          productCode={task.productCode}
          loading={keyMaterialsLoading}
        />
      )}

      {/* 物料齐套状态 (PRD 6.4) */}
      {!loading && !error && ganttBars.length > 0 && (
        <MatchingStatusCard
          ganttBars={ganttBars}
          demandEnd={task.demandEnd}
          degradation={degradation}
        />
      )}

      {/* 关联生产工单 (PRD 6.5) */}
      {!loading && !error && (
        <WorkOrderTracker
          forecastBillnos={task.relatedForecastBillnos || []}
          productCode={task.productCode}
        />
      )}

      {/* 每日监测报告 (PRD 8.3) */}
      {!loading && !error && ganttBars.length > 0 && (
        <DailyMonitoringReport task={task} ganttBars={ganttBars} />
      )}

      {/* 数据溯源信息板 */}
      <DataLineagePanel
        step="task-detail"
        task={task}
        stats={{
          totalMaterials: stats.totalMaterials,
          shortageCount: stats.shortageCount,
          poCount: stats.poCount,
        }}
      />

      {/* 结束任务确认对话框 */}
      <ConfirmDialog
        open={confirmEndOpen}
        title="结束计划协同任务"
        description={
          endingTask
            ? '正在检查产品入库情况并生成总结报告...'
            : endCheckMessage || '确认结束该计划协同任务？系统将检查产品入库情况并生成总结报告。'
        }
        confirmLabel={endingTask ? '处理中...' : '确认结束'}
        cancelLabel="取消"
        variant="warning"
        onConfirm={handleEndTask}
        onCancel={() => { setConfirmEndOpen(false); setEndCheckMessage(null); }}
      />
    </div>
  );
}
