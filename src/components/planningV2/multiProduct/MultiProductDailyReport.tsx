// src/components/planningV2/multiProduct/MultiProductDailyReport.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { FileText, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { MultiProductTask, MultiProductGanttResult } from '../../../types/multiProductTask';
import type { DailyReport } from '../DailyMonitoringReport';
import ConfirmDialog from '../ConfirmDialog';
import { aggregateMaterials, isRiskItem, getRiskText, matchesStatusFilter, type AggMaterial, type StatusFilterKey } from './MultiProductMaterialTab';

interface MultiProductDailyReportProps {
  task: MultiProductTask;
  result: MultiProductGanttResult | null;
  scheduledMrpBillnos?: Set<string>;
}

const STORAGE_PREFIX = 'planningV2_dailyReports_multi_';
const MAX_REPORTS = 30;

function loadReports(taskId: string): DailyReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + taskId);
    if (!raw) return [];
    const parsed: DailyReport[] = JSON.parse(raw);
    return parsed.filter(r => r.overview && r.actionItems && r.timeline && r.recommendations);
  } catch { return []; }
}

function saveReports(taskId: string, reports: DailyReport[]) {
  localStorage.setItem(STORAGE_PREFIX + taskId, JSON.stringify(reports.slice(-MAX_REPORTS)));
}

function daysFromToday(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(dateStr); t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - today.getTime()) / 86400000);
}

function fmtDate(d: Date): string { return d.toISOString().slice(0, 10); }

function generateReport(
  task: MultiProductTask,
  result: MultiProductGanttResult,
  previousReport: DailyReport | null,
  scheduledMrpBillnos: Set<string>,
): DailyReport {
  const materials = aggregateMaterials(result);
  const today = fmtDate(new Date());
  const now = new Date().toISOString();

  const externalMats = materials.filter(m => m.materialType === '外购' || m.materialType === '委外');
  const totalMaterials = materials.length;
  const anomalyCount = materials.filter(m => m.supplyStatus === 'anomaly' && m.materialType !== '自制').length;
  const shortageCount = materials.filter(m => m.supplyStatus === 'shortage').length;
  const readyCount = materials.filter(m => m.supplyStatus === 'sufficient' || m.supplyStatus === 'sufficient_no_mrp').length;
  const orderedCount = externalMats.filter(m => m.poStatus === 'has_po').length;
  const riskCount = materials.filter(m => isRiskItem(m)).length;

  const matchingRate = totalMaterials > 0
    ? Math.round(((readyCount + orderedCount) / totalMaterials) * 100)
    : 0;
  const procurementRate = externalMats.length > 0
    ? Math.round((orderedCount / externalMats.length) * 100)
    : 100;

  const matchingRateChange = previousReport ? matchingRate - previousReport.overview.matchingRate : 0;
  const procurementRateChange = previousReport ? procurementRate - previousReport.overview.procurementRate : 0;

  // Helper: extract grossRequirement and mrpQty for action item
  function matQty(m: AggMaterial): { grossRequirement: number; mrpQty?: number } {
    const mrpQty = m.mrpDetails.reduce((s, d) => s + d.demandQty, 0);
    return { grossRequirement: m.grossRequirement, mrpQty: mrpQty > 0 ? mrpQty : undefined };
  }

  // Helper: inventory context string
  function fmtContext(m: AggMaterial): string {
    const shared = result.sharedMaterials.get(m.materialCode);
    const parts: string[] = [];
    if (shared && shared.relatedProducts.length > 1) {
      parts.push(`${shared.relatedProducts.length} 个产品共用`);
    }
    if (m.availableInventoryQty > 0) parts.push(`库存 ${m.availableInventoryQty.toLocaleString()} 件`);
    if (m.inTransitQty > 0) parts.push(`在途 ${m.inTransitQty.toLocaleString()} 件`);
    if (m.availableInventoryQty === 0 && m.inTransitQty === 0) parts.push('零库存');
    return parts.length > 0 ? `（${parts.join('，')}）` : '';
  }

  // ── 行动项生成：基于 matchesStatusFilter 10 种状态精确映射 ──
  const actionItems: DailyReport['actionItems'] = [];

  for (const m of materials) {
    const supply = m.availableInventoryQty + m.inTransitQty;
    const isExternal = m.materialType === '外购' || m.materialType === '委外';
    const isSelfMade = m.materialType === '自制';
    const ctx = fmtContext(m);
    const qty = matQty(m);

    // ⑩ 库存满足 → 不生成
    if (matchesStatusFilter(m, 'sufficient', scheduledMrpBillnos)) continue;

    // ⑦ 齐套已排产 → 不生成
    // ⑥ 子料缺料 → 不生成

    // ── 今日提示项 ──

    // ⑧ 自制件-齐套未排产
    if (matchesStatusFilter(m, 'unscheduled', scheduledMrpBillnos)) {
      actionItems.push({
        level: 'info', category: 'today',
        materialCode: m.materialCode, materialName: m.materialName, materialType: m.materialType,
        reason: `子料已齐套，未下达生产计划${ctx}`,
        suggestedAction: '请在ERP下达生产计划',
        startDate: today, actionButton: 'schedule', ...qty,
      });
      continue;
    }

    // ⑤ PO今日到期 / PO近3天到期（从 po_overdue 中拆分 days===0 归今日提示）
    if (isExternal && m.poStatus === 'has_po' && m.poDeliverDate) {
      const days = daysFromToday(m.poDeliverDate);
      if (days === 0) {
        actionItems.push({
          level: 'info', category: 'today',
          materialCode: m.materialCode, materialName: m.materialName, materialType: m.materialType,
          reason: `PO交期今日到期，请确认到货${ctx}`,
          suggestedAction: '联系供应商确认发货/到货状态',
          startDate: today, actionButton: 'confirm_arrival', ...qty,
        });
        continue;
      }
      if (days >= 1 && days <= 3) {
        actionItems.push({
          level: 'info', category: 'today',
          materialCode: m.materialCode, materialName: m.materialName, materialType: m.materialType,
          reason: `PO交期还剩 ${days} 天，注意到货${ctx}`,
          suggestedAction: `PO交期 ${m.poDeliverDate}，请安排验收`,
          startDate: today, actionButton: 'confirm_arrival', ...qty,
        });
        continue;
      }
    }

    // ── 风险项 ──

    // ② 外购/委外-交期风险
    if (matchesStatusFilter(m, 'deadline_risk', scheduledMrpBillnos)) {
      let reason: string;
      if (m.poStatus === 'has_po' && m.poDeliverDate && m.endDate) {
        reason = `PO交期 ${m.poDeliverDate} 超过需求截止日 ${m.endDate}${ctx}`;
      } else if (m.endDate && m.leadtime > 0) {
        reason = `采购提前期 ${m.leadtime} 天已超截止日 ${m.endDate}，现在下单也来不及${ctx}`;
      } else {
        reason = `交期风险${ctx}`;
      }
      actionItems.push({
        level: 'danger', category: 'risk',
        materialCode: m.materialCode, materialName: m.materialName, materialType: m.materialType,
        reason,
        suggestedAction: '请紧急协调供应商调整交期',
        startDate: today, actionButton: 'expedite_po', ...qty,
      });
      continue;
    }

    // ⑤ 外购/委外-PO已逾期（days < 0）
    if (matchesStatusFilter(m, 'po_overdue', scheduledMrpBillnos)) {
      const days = Math.abs(daysFromToday(m.poDeliverDate!));
      actionItems.push({
        level: 'danger', category: 'risk',
        materialCode: m.materialCode, materialName: m.materialName, materialType: m.materialType,
        reason: `PO交期已过 ${days} 天，物料未到${ctx}`,
        suggestedAction: `PO交期 ${m.poDeliverDate}，请立即催货`,
        startDate: today, actionButton: 'expedite_po', ...qty,
      });
      continue;
    }

    // ③ 外购/委外-未下PR
    if (matchesStatusFilter(m, 'no_pr', scheduledMrpBillnos)) {
      const lt = m.leadtime ?? 0;
      // 判断紧急程度：今天+提前期 > 截止日 → danger
      let level: 'danger' | 'warning' = 'warning';
      if (m.endDate && lt > 0) {
        const arrivalDate = new Date();
        arrivalDate.setDate(arrivalDate.getDate() + lt);
        const deadline = new Date(m.endDate);
        if (arrivalDate > deadline) level = 'danger';
      }
      actionItems.push({
        level, category: 'risk',
        materialCode: m.materialCode, materialName: m.materialName, materialType: m.materialType,
        reason: `有MRP缺口，尚未生成PR${ctx}`,
        suggestedAction: `采购提前期 ${lt} 天，请尽快下达PR`,
        startDate: today, actionButton: 'create_pr', ...qty,
      });
      continue;
    }

    // ④ 外购/委外-未下PO
    if (matchesStatusFilter(m, 'no_po', scheduledMrpBillnos)) {
      const lt = m.leadtime ?? 0;
      actionItems.push({
        level: 'warning', category: 'risk',
        materialCode: m.materialCode, materialName: m.materialName, materialType: m.materialType,
        reason: `PR已生成，尚未下达PO${ctx}`,
        suggestedAction: `采购提前期 ${lt} 天，请尽快下达PO`,
        startDate: today, actionButton: 'create_po', ...qty,
      });
      continue;
    }

    // ⑨ 自制件-有计划但有缺口
    if (matchesStatusFilter(m, 'plan_gap', scheduledMrpBillnos)) {
      const gap = Math.max(0, m.grossRequirement - supply);
      actionItems.push({
        level: 'warning', category: 'risk',
        materialCode: m.materialCode, materialName: m.materialName, materialType: m.materialType,
        reason: `库存缺口 ${gap.toLocaleString()} 件，子料已齐套${ctx}`,
        suggestedAction: '请核验生产进度与数据',
        startDate: today, actionButton: 'verify_data', ...qty,
      });
      continue;
    }

    // ── 异常关注项 ──

    // ① 数据异常-无MRP且库存不足
    if (matchesStatusFilter(m, 'anomaly', scheduledMrpBillnos)) {
      actionItems.push({
        level: 'danger', category: 'anomaly',
        materialCode: m.materialCode, materialName: m.materialName, materialType: m.materialType,
        reason: `无MRP且库存不足${ctx}`,
        suggestedAction: '请在ERP核查BOM及MRP运算，确认数据准确性',
        startDate: today, actionButton: 'verify_data', ...qty,
      });
      continue;
    }
  }

  // 排序：danger → warning → info，同级按物料编码
  const levelOrder = { danger: 0, warning: 1, info: 2 };
  actionItems.sort((a, b) => {
    const lvl = levelOrder[a.level] - levelOrder[b.level];
    return lvl !== 0 ? lvl : a.materialCode.localeCompare(b.materialCode);
  });

  // Timeline — derive from shared materials anchor dates
  const selfMadeMats = materials.filter(m => m.materialType === '自制');
  const productionReadyCount = selfMadeMats.filter(m => !m.hasShortage).length;
  const upcomingArrivals = materials
    .filter(m => {
      if (!m.poDeliverDate) return false;
      const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
      return m.poDeliverDate >= today && m.poDeliverDate <= fmtDate(weekEnd);
    })
    .map(m => ({ materialCode: m.materialCode, materialName: m.materialName, expectedDate: m.poDeliverDate! }))
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));

  // Recommendations
  const recommendations: string[] = [];
  if (anomalyCount > 0) recommendations.push(`${anomalyCount} 种外购/委外物料异常（无MRP且无库存），需优先核查ERP`);
  if (shortageCount > 0 && procurementRate < 60) recommendations.push(`采购完成率仅 ${procurementRate}%，需加快 PR/PO 下达`);
  if (productionReadyCount > 0) recommendations.push(`${productionReadyCount} 个自制件子料已齐套，可安排生产`);
  if (upcomingArrivals.length > 0) recommendations.push(`本周预计 ${upcomingArrivals.length} 批到料，请安排验收`);
  if (recommendations.length === 0) recommendations.push('当前物料状况良好，按计划推进即可');

  return {
    reportDate: today,
    generatedAt: now,
    taskId: task.id,
    productCode: 'multi',
    productName: task.name,
    forecastBillnos: [task.forecastBillno],
    overview: {
      totalMaterials,
      readyCount,
      shortageCount,
      anomalyCount,
      orderedCount,
      riskCount,
      matchingRate,
      procurementRate,
      matchingRateChange,
      procurementRateChange,
    },
    actionItems,
    timeline: { earliestStart: today, daysUntilEarliestStart: 0, productionReadyCount, timeRiskCount: 0 },
    upcomingArrivals,
    recommendations,
  };
}

const ACTION_PAGE_SIZE = 10;

type ActionCategoryFilter = 'all' | 'today' | 'risk' | 'anomaly';

const ACTION_BUTTON_LABELS: Record<string, string> = {
  create_pr: '下达 PR',
  create_po: '下达 PO',
  expedite_po: '催货',
  schedule: '排产',
  confirm_arrival: '确认到货',
  verify_data: '核验数据',
};

const ACTION_DIALOG_TITLES: Record<string, string> = {
  create_pr: '下达采购申请（PR）',
  create_po: '下达采购订单（PO）',
  expedite_po: '催货',
  schedule: '排产',
  confirm_arrival: '确认到货',
  verify_data: '核验数据',
};

const MultiProductDailyReport: React.FC<MultiProductDailyReportProps> = ({ task, result, scheduledMrpBillnos }) => {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [actionPage, setActionPage] = useState(1);
  const [actionCategoryFilter, setActionCategoryFilter] = useState<ActionCategoryFilter>('all');
  const [pendingAction, setPendingAction] = useState<{ type: DailyReport['actionItems'][0]['actionButton']; materialCode: string; materialName: string } | null>(null);
  useEffect(() => {
    setReports(loadReports(task.id));
    setSelectedIdx(0);
    setActionPage(1);
    setActionCategoryFilter('all');
  }, [task.id]);

  const latestReport = reports.length > 0 ? reports[reports.length - 1 - selectedIdx] : null;

  const handleGenerate = useCallback(() => {
    if (!result) return;
    const previousReport = reports.length > 0 ? reports[reports.length - 1] : null;
    const report = generateReport(task, result, previousReport, scheduledMrpBillnos ?? new Set());
    const updated = [...reports, report].slice(-MAX_REPORTS);
    saveReports(task.id, updated);
    setReports(updated);
    setSelectedIdx(0);
    setActionPage(1);
    setActionCategoryFilter('all');
  }, [task, result, reports, scheduledMrpBillnos]);

  if (!result) {
    return <div className="text-center py-12 text-slate-400 text-sm">数据加载中...</div>;
  }

  return (
    <>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-medium text-slate-700">每日监测报告</span>
          {reports.length > 0 && (
            <select
              value={selectedIdx}
              onChange={e => { setSelectedIdx(Number(e.target.value)); setActionPage(1); }}
              className="text-xs border border-slate-200 rounded px-1.5 py-0.5 text-slate-600"
            >
              {[...reports].reverse().map((r, i) => (
                <option key={r.generatedAt} value={i}>
                  {r.reportDate} {r.generatedAt.slice(11, 16)}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={handleGenerate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
        >
          <RefreshCw className="w-3 h-3" />
          生成今日报告
        </button>
      </div>

      {!latestReport ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          点击"生成今日报告"生成首份报告
        </div>
      ) : (
        <div className="space-y-4">
          {/* Overview */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-700">总览</h4>
              <span className="text-xs text-slate-400">{latestReport.reportDate}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              {[
                { label: '齐套率', value: `${latestReport.overview.matchingRate}%`, change: latestReport.overview.matchingRateChange },
                { label: '采购完成率', value: `${latestReport.overview.procurementRate}%`, change: latestReport.overview.procurementRateChange },
                { label: '风险物料', value: String(latestReport.overview.riskCount), change: 0, danger: latestReport.overview.riskCount > 0 },
              ].map(({ label, value, change, danger }) => (
                <div key={label} className="text-center">
                  <div className={`text-xl font-bold ${danger ? 'text-red-600' : 'text-slate-800'}`}>{value}</div>
                  <div className="text-xs text-slate-400">{label}</div>
                  {change !== 0 && (
                    <div className={`text-xs flex items-center justify-center gap-0.5 ${change > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {change > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {change > 0 ? '+' : ''}{change}%
                    </div>
                  )}
                  {change === 0 && label !== '风险物料' && (
                    <div className="text-xs flex items-center justify-center gap-0.5 text-slate-400">
                      <Minus className="w-3 h-3" />0%
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-1 text-center text-xs">
              {([
                ['总物料', latestReport.overview.totalMaterials, 'text-slate-700'],
                ['就绪', latestReport.overview.readyCount, 'text-green-600'],
                ['缺货', latestReport.overview.shortageCount, 'text-red-600'],
                ['异常', latestReport.overview.anomalyCount, 'text-amber-600'],
                ['已PO', latestReport.overview.orderedCount, 'text-indigo-600'],
              ] as [string, number, string][]).map(([label, value, cls]) => (
                <div key={label} className="bg-slate-50 rounded p-1.5">
                  <div className={`font-semibold ${cls}`}>{value}</div>
                  <div className="text-slate-400">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Action items */}
          {latestReport.actionItems.length > 0 && (() => {
            const allItems = latestReport.actionItems;
            const todayCount = allItems.filter(a => a.category === 'today').length;
            const riskCount = allItems.filter(a => a.category === 'risk').length;
            const anomalyCount = allItems.filter(a => a.category === 'anomaly').length;
            const filtered = actionCategoryFilter === 'all'
              ? allItems
              : allItems.filter(a => a.category === actionCategoryFilter);
            const totalActionPages = Math.max(1, Math.ceil(filtered.length / ACTION_PAGE_SIZE));
            const safeActionPage = Math.min(actionPage, totalActionPages);
            const pagedActions = filtered.slice(
              (safeActionPage - 1) * ACTION_PAGE_SIZE,
              safeActionPage * ACTION_PAGE_SIZE,
            );

            const categoryTabs: { key: ActionCategoryFilter; label: string; count: number }[] = [
              { key: 'all', label: '全部', count: allItems.length },
              { key: 'today', label: '今日提示', count: todayCount },
              { key: 'risk', label: '风险项', count: riskCount },
              { key: 'anomaly', label: '异常关注', count: anomalyCount },
            ];

            return (
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                {/* 标题 + 分页 */}
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-slate-700">
                    今日提醒及行动项 ({allItems.length})
                  </h4>
                  {totalActionPages > 1 && (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <button onClick={() => setActionPage(1)} disabled={safeActionPage === 1}
                        className="px-1.5 py-0.5 rounded hover:bg-slate-100 disabled:opacity-40">«</button>
                      <button onClick={() => setActionPage(p => Math.max(1, p - 1))} disabled={safeActionPage === 1}
                        className="px-2 py-0.5 rounded hover:bg-slate-100 disabled:opacity-40">上一页</button>
                      <span>第 {safeActionPage}/{totalActionPages} 页</span>
                      <button onClick={() => setActionPage(p => Math.min(totalActionPages, p + 1))} disabled={safeActionPage === totalActionPages}
                        className="px-2 py-0.5 rounded hover:bg-slate-100 disabled:opacity-40">下一页</button>
                      <button onClick={() => setActionPage(totalActionPages)} disabled={safeActionPage === totalActionPages}
                        className="px-1.5 py-0.5 rounded hover:bg-slate-100 disabled:opacity-40">»</button>
                    </div>
                  )}
                </div>

                {/* 分类过滤 Tab */}
                <div className="flex items-center gap-1.5 mb-3">
                  {categoryTabs.map(tab => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => { setActionCategoryFilter(tab.key); setActionPage(1); }}
                      className={`px-2.5 py-1 rounded text-xs transition-colors ${
                        actionCategoryFilter === tab.key
                          ? 'bg-indigo-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {tab.label} ({tab.count})
                    </button>
                  ))}
                </div>

                {/* 行动项卡片列表 */}
                {filtered.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-400">该分类下暂无行动项</div>
                ) : (
                  <div className="space-y-2">
                    {pagedActions.map((item, i) => {
                      const cardBg = item.level === 'danger'
                        ? 'bg-red-50 border border-red-100'
                        : item.level === 'warning'
                          ? 'bg-amber-50 border border-amber-100'
                          : 'bg-blue-50 border border-blue-100';
                      const badgeCls = item.level === 'danger'
                        ? 'bg-red-100 text-red-700'
                        : item.level === 'warning'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700';
                      const badgeLabel = item.level === 'danger' ? '紧急'
                        : item.level === 'warning' ? '警告' : '提示';
                      const actionTextCls = item.level === 'danger'
                        ? 'text-red-600 font-medium'
                        : item.level === 'warning'
                          ? 'text-amber-700 font-medium'
                          : 'text-blue-700 font-medium';

                      return (
                        <div key={i} className={`p-2.5 rounded text-xs ${cardBg}`}>
                          {/* Row 1: badge + 物料标识 */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${badgeCls}`}>
                                {badgeLabel}
                              </span>
                              <span className="font-medium text-slate-700">{item.materialCode}</span>
                              <span className="text-slate-500 truncate">{item.materialName}</span>
                              <span className="text-slate-400 flex-shrink-0">({item.materialType})</span>
                              {item.grossRequirement != null && item.grossRequirement > 0 && (
                                <span className="flex-shrink-0 text-slate-500">
                                  需求 <span className="font-medium text-slate-700">{item.grossRequirement.toLocaleString()}</span>
                                  {item.mrpQty != null && (
                                    <> / 计划 <span className="font-medium text-blue-600">{item.mrpQty.toLocaleString()}</span></>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Row 2: 现状 */}
                          <div className="mt-1 text-slate-600">
                            <span className="text-slate-400">现状：</span>{item.reason}
                          </div>
                          {/* Row 3: 行动 + 按钮 */}
                          <div className="mt-0.5 flex items-center justify-between gap-2">
                            <div className="text-slate-500">
                              <span className="text-slate-400">行动：</span>
                              <span className={actionTextCls}>{item.suggestedAction}</span>
                            </div>
                            {item.actionButton && (
                              <button
                                type="button"
                                onClick={() => setPendingAction({ type: item.actionButton, materialCode: item.materialCode, materialName: item.materialName })}
                                className="flex-shrink-0 px-2.5 py-1 rounded text-[11px] font-medium bg-indigo-500 text-white hover:bg-indigo-600"
                              >
                                {ACTION_BUTTON_LABELS[item.actionButton] || item.actionButton}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 底部分类注释表 */}
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-slate-600 select-none">
                    行动项分类说明
                  </summary>
                  <table className="w-full text-[11px] mt-2 border-collapse">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-200">
                        <th className="py-1 pr-3 font-medium">分类</th>
                        <th className="py-1 pr-3 font-medium">说明</th>
                        <th className="py-1 font-medium">包含状态</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-600">
                      <tr className="border-b border-slate-100">
                        <td className="py-1 pr-3"><span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-medium">今日提示</span></td>
                        <td className="py-1 pr-3">今天需要关注或决策的事项，流程正常但需及时跟进</td>
                        <td className="py-1">齐套未排产、PO今日到期、PO近3天到期</td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="py-1 pr-3"><span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium">风险项</span></td>
                        <td className="py-1 pr-3">库存不足且采购或生产流程存在缺口或延迟</td>
                        <td className="py-1">交期风险、未下PR、未下PO、PO已逾期、有计划但有缺口</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-3"><span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-medium">异常关注</span></td>
                        <td className="py-1 pr-3">数据层面异常，需ERP核查确认</td>
                        <td className="py-1">无MRP且库存不足</td>
                      </tr>
                    </tbody>
                  </table>
                </details>
              </div>
            );
          })()}

          {/* Recommendations */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">决策建议</h4>
            <ul className="space-y-1.5">
              {latestReport.recommendations.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                  <span className="flex-shrink-0 text-indigo-500 font-bold">{i + 1}.</span>
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {/* Upcoming arrivals */}
          {latestReport.upcomingArrivals.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-3">
                本周预计到料 ({latestReport.upcomingArrivals.length})
              </h4>
              <div className="space-y-1">
                {latestReport.upcomingArrivals.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-b-0">
                    <span className="text-slate-600">{a.materialCode} {a.materialName}</span>
                    <span className="text-slate-500">{a.expectedDate}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>

    <ConfirmDialog
      open={!!pendingAction}
      variant="warning"
      title={pendingAction?.type ? (ACTION_DIALOG_TITLES[pendingAction.type] ?? pendingAction.type) : ''}
      description={`${pendingAction?.materialCode} ${pendingAction?.materialName}\n\n此功能正在开发中，后续将直接连接 ERP 系统完成操作。`}
      confirmLabel="知道了"
      cancelLabel=""
      onConfirm={() => setPendingAction(null)}
      onCancel={() => setPendingAction(null)}
    />
    </>
  );
};

export default MultiProductDailyReport;
