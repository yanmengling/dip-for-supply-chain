/**
 * 每日监测报告组件
 *
 * PRD 8.3: 面向业务领导的每日状态快照
 * - 总览: 齐套率、采购完成率、物料分布
 * - 紧急行动项: danger/warning 物料（基于 ShortageList 行状态逻辑）
 * - 倒排时间线摘要: 最早采购日、可推送生产、时间风险
 * - 本周预计到料
 * - 决策建议: 自动生成 1-3 条建议
 * - Markdown / CSV 导出
 * - localStorage 最多 30 份/任务
 */

import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Printer,
} from 'lucide-react';
import type { GanttBar, PlanningTask } from '../../types/planningV2';

// ─── Data structure ───────────────────────────────────────────────────────────

export interface DailyReport {
  reportDate: string;
  generatedAt: string;
  taskId: string;
  productCode: string;
  productName: string;
  forecastBillnos: string[];  // 关联的需求预测单号

  // 一、总览
  overview: {
    totalMaterials: number;
    readyCount: number;      // 就绪（无MRP+有库存）
    shortageCount: number;   // 缺货（有MRP）
    anomalyCount: number;    // 异常（无MRP+无库存）
    orderedCount: number;    // 已下PO
    riskCount: number;       // 时间风险
    matchingRate: number;    // 齐套率 = (ready + ordered) / total
    procurementRate: number; // 采购完成率 = withPO / 外购委外总数
    matchingRateChange: number;
    procurementRateChange: number;
  };

  // 二、紧急行动项
  actionItems: Array<{
    level: 'danger' | 'warning';
    materialCode: string;
    materialName: string;
    materialType: string;
    reason: string;
    suggestedAction: string;
    startDate: string;
  }>;

  // 三、倒排时间线摘要
  timeline: {
    earliestStart: string;
    daysUntilEarliestStart: number;
    productionReadyCount: number;   // 可推送生产的自制件
    timeRiskCount: number;          // 到货晚于父件开工
  };

  // 四、本周预计到料
  upcomingArrivals: Array<{
    materialCode: string;
    materialName: string;
    expectedDate: string;
  }>;

  // 五、决策建议
  recommendations: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'planningV2_dailyReports_';
const MAX_REPORTS = 30;

function loadReports(taskId: string): DailyReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + taskId);
    if (!raw) return [];
    const parsed: DailyReport[] = JSON.parse(raw);
    // Discard old-format reports that lack the new interface fields
    return parsed.filter(r => r.overview && r.actionItems && r.timeline && r.recommendations);
  } catch { return []; }
}

function saveReports(taskId: string, reports: DailyReport[]) {
  localStorage.setItem(STORAGE_PREFIX + taskId, JSON.stringify(reports.slice(-MAX_REPORTS)));
}

/** Flatten non-root bars, deduplicated by materialCode */
function flattenUnique(bars: GanttBar[]): GanttBar[] {
  const map = new Map<string, GanttBar>();
  function walk(b: GanttBar, root: boolean) {
    if (!root && !map.has(b.materialCode)) map.set(b.materialCode, b);
    b.children.forEach(c => walk(c, false));
  }
  bars.forEach(b => walk(b, true));
  return Array.from(map.values());
}

function daysFromToday(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(dateStr); t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - today.getTime()) / 86400000);
}

function fmtDate(d: Date): string { return d.toISOString().slice(0, 10); }

// ─── Report generation ────────────────────────────────────────────────────────

function generateReport(
  task: PlanningTask,
  ganttBars: GanttBar[],
  previousReport: DailyReport | null,
): DailyReport {
  const materials = flattenUnique(ganttBars);
  const today = fmtDate(new Date());

  // Overview counts
  const readyCount = materials.filter(b => b.status === 'ready').length;
  const shortageCount = materials.filter(b => b.supplyStatus === 'shortage').length;
  const anomalyCount = materials.filter(b => b.status === 'anomaly').length;
  const orderedCount = materials.filter(b => b.status === 'ordered').length;
  const riskCount = materials.filter(b => b.status === 'risk').length;

  // Matching rate = (ready + ordered) / total
  const matchingRate = materials.length > 0
    ? Math.round(((readyCount + orderedCount) / materials.length) * 1000) / 10
    : 100;

  // Procurement rate = withPO / external total
  const externalMaterials = materials.filter(b => b.materialType === '外购' || b.materialType === '委外');
  const withPO = materials.filter(b => b.poStatus === 'has_po');
  const procurementRate = externalMaterials.length > 0
    ? Math.round((withPO.length / externalMaterials.length) * 1000) / 10
    : 100;

  const matchingRateChange = previousReport
    ? Math.round((matchingRate - previousReport.overview.matchingRate) * 10) / 10 : 0;
  const procurementRateChange = previousReport
    ? Math.round((procurementRate - previousReport.overview.procurementRate) * 10) / 10 : 0;

  // Action items (danger / warning based on ShortageList logic)
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const actionItems: DailyReport['actionItems'] = [];
  for (const b of materials) {
    const isExternal = b.materialType === '外购' || b.materialType === '委外';
    if (!isExternal || !b.hasMRP) continue;
    const noPO = b.poStatus !== 'has_po';
    if (!noPO) continue;
    const dStart = daysFromToday(fmtDate(b.startDate));
    if (dStart < 0) {
      actionItems.push({
        level: 'danger',
        materialCode: b.materialCode,
        materialName: b.materialName,
        materialType: b.materialType,
        reason: `采购开始日已过期 ${Math.abs(dStart)} 天，未下PO`,
        suggestedAction: b.prStatus === 'has_pr' ? '立即下PO' : '立即下PR并跟进PO',
        startDate: fmtDate(b.startDate),
      });
    } else if (dStart < 2) {
      actionItems.push({
        level: 'warning',
        materialCode: b.materialCode,
        materialName: b.materialName,
        materialType: b.materialType,
        reason: `距采购开始仅 ${dStart} 天，未下PO`,
        suggestedAction: b.prStatus === 'has_pr' ? '尽快下PO' : '尽快下PR',
        startDate: fmtDate(b.startDate),
      });
    }
  }
  // Sort: danger first, then by startDate
  actionItems.sort((a, b) => {
    if (a.level !== b.level) return a.level === 'danger' ? -1 : 1;
    return a.startDate.localeCompare(b.startDate);
  });

  // Timeline summary
  let earliestStart = new Date(task.demandEnd);
  for (const b of materials) {
    if (b.startDate < earliestStart) earliestStart = b.startDate;
  }
  const productionReadyCount = materials.filter(b => {
    const isSelfMade = b.materialType === '自制' || (!['外购', '委外'].includes(b.materialType) && b.bomLevel > 0);
    return isSelfMade && daysFromToday(fmtDate(b.startDate)) <= 2 && !b.hasShortage;
  }).length;

  // Upcoming arrivals (7 days)
  const week = new Date(now.getTime() + 7 * 86400000);
  const upcomingArrivals = materials
    .filter(b => b.poDeliverDate && new Date(b.poDeliverDate) >= now && new Date(b.poDeliverDate) <= week)
    .map(b => ({ materialCode: b.materialCode, materialName: b.materialName, expectedDate: b.poDeliverDate! }));

  // Recommendations
  const recommendations: string[] = [];
  const dangerCount = actionItems.filter(a => a.level === 'danger').length;
  const warningCount = actionItems.filter(a => a.level === 'warning').length;
  if (dangerCount > 0) {
    const topDanger = actionItems.filter(a => a.level === 'danger').slice(0, 3);
    recommendations.push(
      `[紧急] ${topDanger.map(d => d.materialCode).join('、')} 等 ${dangerCount} 项物料已过期未下PO，建议立即启动采购流程`
    );
  }
  if (warningCount > 0) {
    recommendations.push(
      `[关注] ${warningCount} 项物料 2 天内需下PO，请尽快跟进采购进度`
    );
  }
  if (productionReadyCount > 0) {
    recommendations.push(
      `[就绪] ${productionReadyCount} 项自制件可推送生产，建议安排生产计划`
    );
  }
  if (anomalyCount > 0) {
    recommendations.push(
      `[核查] ${anomalyCount} 项物料无MRP且无库存，建议核实BOM准确性或补充采购计划`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push('当前无紧急事项，各物料采购进度正常');
  }

  return {
    reportDate: today,
    generatedAt: new Date().toISOString(),
    taskId: task.id,
    productCode: task.productCode,
    productName: task.productName,
    forecastBillnos: task.relatedForecastBillnos || [],
    overview: {
      totalMaterials: materials.length,
      readyCount, shortageCount, anomalyCount, orderedCount, riskCount,
      matchingRate, procurementRate, matchingRateChange, procurementRateChange,
    },
    actionItems,
    timeline: {
      earliestStart: fmtDate(earliestStart),
      daysUntilEarliestStart: daysFromToday(fmtDate(earliestStart)),
      productionReadyCount,
      timeRiskCount: riskCount,
    },
    upcomingArrivals,
    recommendations,
  };
}

// ─── Markdown export ──────────────────────────────────────────────────────────

function reportToMarkdown(r: DailyReport): string {
  const trend = (v: number) => v >= 0 ? `+${v}%` : `${v}%`;
  const lines = [
    `# 计划协同监测日报`,
    ``,
    `> 产品: ${r.productCode} ${r.productName}`,
    `> 需求预测单: ${r.forecastBillnos.length > 0 ? r.forecastBillnos.join('、') : '无'}`,
    `> 报告日期: ${r.reportDate}`,
    `> 生成时间: ${new Date(r.generatedAt).toLocaleString('zh-CN')}`,
    ``,
    `## 一、总览`,
    ``,
    `| 指标 | 数值 | 趋势 |`,
    `|------|------|------|`,
    `| 齐套率 | ${r.overview.matchingRate}% | ${trend(r.overview.matchingRateChange)} |`,
    `| 采购完成率 | ${r.overview.procurementRate}% | ${trend(r.overview.procurementRateChange)} |`,
    ``,
    `| 分类 | 数量 | 说明 |`,
    `|------|------|------|`,
    `| 物料总数 | ${r.overview.totalMaterials} | BOM 子件（去重） |`,
    `| 就绪 | ${r.overview.readyCount} | 无MRP + 有库存，无需采购 |`,
    `| 已下单 | ${r.overview.orderedCount} | 已有PO，等待到货 |`,
    `| 缺货 | ${r.overview.shortageCount} | 有MRP记录，需采购跟踪 |`,
    `| 异常 | ${r.overview.anomalyCount} | 无MRP + 无库存，需核查 |`,
    `| 时间风险 | ${r.overview.riskCount} | 未下PO且时间紧迫 |`,
    ``,
  ];

  // Action items
  if (r.actionItems.length > 0) {
    lines.push(`## 二、需要关注（紧急行动项）`);
    lines.push(``);
    lines.push(`| 紧急程度 | 物料编码 | 物料名称 | 类型 | 问题 | 建议行动 |`);
    lines.push(`|----------|----------|----------|------|------|----------|`);
    for (const a of r.actionItems) {
      const lvl = a.level === 'danger' ? '🔴 紧急' : '🟡 关注';
      lines.push(`| ${lvl} | ${a.materialCode} | ${a.materialName} | ${a.materialType} | ${a.reason} | ${a.suggestedAction} |`);
    }
    lines.push(``);
  } else {
    lines.push(`## 二、需要关注`);
    lines.push(``);
    lines.push(`> 当前无紧急行动项`);
    lines.push(``);
  }

  // Timeline
  lines.push(`## 三、倒排时间线`);
  lines.push(``);
  lines.push(`| 指标 | 数值 |`);
  lines.push(`|------|------|`);
  const daysLabel = r.timeline.daysUntilEarliestStart < 0
    ? `已过 ${Math.abs(r.timeline.daysUntilEarliestStart)} 天`
    : r.timeline.daysUntilEarliestStart === 0
    ? '今天'
    : `${r.timeline.daysUntilEarliestStart} 天后`;
  lines.push(`| 最早需开始采购 | ${r.timeline.earliestStart}（${daysLabel}）|`);
  lines.push(`| 可推送生产件 | ${r.timeline.productionReadyCount} 项 |`);
  lines.push(`| 时间风险物料 | ${r.timeline.timeRiskCount} 项 |`);
  lines.push(``);

  // Upcoming arrivals
  lines.push(`## 四、本周预计到料`);
  lines.push(``);
  if (r.upcomingArrivals.length > 0) {
    lines.push(`| 物料编码 | 物料名称 | 预计到料日 |`);
    lines.push(`|----------|----------|-----------|`);
    for (const a of r.upcomingArrivals) {
      lines.push(`| ${a.materialCode} | ${a.materialName} | ${a.expectedDate} |`);
    }
  } else {
    lines.push(`> 本周无预计到料`);
  }
  lines.push(``);

  // Recommendations
  lines.push(`## 五、决策建议`);
  lines.push(``);
  for (const rec of r.recommendations) {
    lines.push(`- ${rec}`);
  }
  lines.push(``);

  lines.push(`---`);
  lines.push(`*本报告由供应链大脑系统自动生成，基于倒排甘特图与关键物料监控清单实时数据。*`);

  return lines.join('\n');
}

// ─── Component ────────────────────────────────────────────────────────────────

interface DailyMonitoringReportProps {
  task: PlanningTask;
  ganttBars: GanttBar[];
}

const DailyMonitoringReport = ({ task, ganttBars }: DailyMonitoringReportProps) => {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setReports(loadReports(task.id));
  }, [task.id]);

  const latestReport = reports.length > 0 ? reports[reports.length - 1] : null;

  const handleGenerate = useCallback(() => {
    setGenerating(true);
    try {
      const prev = reports.length > 0 ? reports[reports.length - 1] : null;
      const report = generateReport(task, ganttBars, prev);
      const updated = [...reports, report];
      saveReports(task.id, updated);
      setReports(updated.slice(-MAX_REPORTS));
    } finally {
      setGenerating(false);
    }
  }, [task, ganttBars, reports]);

  const handleExportMD = useCallback(() => {
    if (!latestReport) return;
    const md = reportToMarkdown(latestReport);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `监测日报_${task.productCode}_${latestReport.reportDate}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [latestReport, task]);

  const handleExportCSV = useCallback(() => {
    if (!latestReport) return;
    const r = latestReport;
    const rows = [
      ['报告日期', r.reportDate],
      ['产品', `${r.productCode} ${r.productName}`],
      ['需求预测单', r.forecastBillnos?.join('、') || '无'],
      ['齐套率%', String(r.overview.matchingRate)],
      ['采购完成率%', String(r.overview.procurementRate)],
      ['物料总数', String(r.overview.totalMaterials)],
      ['就绪', String(r.overview.readyCount)],
      ['缺货', String(r.overview.shortageCount)],
      ['异常', String(r.overview.anomalyCount)],
      ['已下单', String(r.overview.orderedCount)],
      ['时间风险', String(r.overview.riskCount)],
      [],
      ['紧急行动项'],
      ['紧急程度', '物料编码', '物料名称', '类型', '问题', '建议行动'],
      ...r.actionItems.map(a => [
        a.level === 'danger' ? '紧急' : '关注',
        a.materialCode, `"${a.materialName}"`, a.materialType, `"${a.reason}"`, `"${a.suggestedAction}"`,
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `监测日报_${task.productCode}_${r.reportDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [latestReport, task]);

  const handlePrintPDF = useCallback(() => {
    if (!latestReport) return;
    const md = reportToMarkdown(latestReport);
    // Open a print-friendly window
    const win = window.open('', '_blank');
    if (!win) return;
    // Convert markdown to HTML with proper table parsing
    const lines = md.split('\n');
    const htmlParts: string[] = [];
    let i = 0;
    let inList = false;
    while (i < lines.length) {
      const line = lines[i];
      // Table: detect header row (starts with |), followed by separator |---|
      if (line.startsWith('|') && i + 1 < lines.length && /^\|[\s-:|]+\|$/.test(lines[i + 1])) {
        const tableRows: string[] = [];
        // Header row
        const headerCells = line.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim());
        tableRows.push('<tr>' + headerCells.map(c => `<td>${c}</td>`).join('') + '</tr>');
        i += 2; // skip header + separator
        // Data rows
        while (i < lines.length && lines[i].startsWith('|')) {
          const cells = lines[i].split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim());
          tableRows.push('<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>');
          i++;
        }
        htmlParts.push('<table>' + tableRows.join('') + '</table>');
        continue;
      }
      // Close list if needed
      if (inList && !line.startsWith('- ')) {
        htmlParts.push('</ul>');
        inList = false;
      }
      if (line.startsWith('# ')) {
        htmlParts.push(`<h1>${line.slice(2)}</h1>`);
      } else if (line.startsWith('## ')) {
        htmlParts.push(`<h2>${line.slice(3)}</h2>`);
      } else if (line.startsWith('> ')) {
        htmlParts.push(`<blockquote>${line.slice(2)}</blockquote>`);
      } else if (line.startsWith('- ')) {
        if (!inList) { htmlParts.push('<ul>'); inList = true; }
        htmlParts.push(`<li>${line.slice(2)}</li>`);
      } else if (line === '---') {
        htmlParts.push('<hr>');
      } else if (line.startsWith('*') && line.endsWith('*')) {
        htmlParts.push(`<p><em>${line.slice(1, -1)}</em></p>`);
      } else if (line.trim() === '') {
        // skip blank lines
      } else {
        htmlParts.push(`<p>${line}</p>`);
      }
      i++;
    }
    if (inList) htmlParts.push('</ul>');
    const html = htmlParts.join('\n');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>监测日报 ${latestReport.reportDate}</title>
      <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:20px;font-size:14px;color:#333}
      h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px}h2{font-size:16px;color:#1e40af;margin-top:24px}
      table{width:100%;border-collapse:collapse;margin:8px 0}td{border:1px solid #e2e8f0;padding:4px 8px;font-size:12px}
      tr:first-child td{font-weight:600;background:#f1f5f9}blockquote{color:#64748b;border-left:3px solid #94a3b8;padding-left:12px;margin:8px 0}
      li{margin:4px 0}hr{border:none;border-top:1px solid #e2e8f0;margin:16px 0}
      @media print{body{padding:0}}</style></head><body>${html}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  }, [latestReport]);

  const TrendIcon = ({ value }: { value: number }) => {
    if (value > 0) return <TrendingUp className="w-3 h-3 text-green-600 inline" />;
    if (value < 0) return <TrendingDown className="w-3 h-3 text-red-600 inline" />;
    return <Minus className="w-3 h-3 text-slate-400 inline" />;
  };

  if (task.status !== 'active') return null;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-500" />
          <h4 className="text-sm font-semibold text-slate-800">每日监测报告</h4>
          {latestReport && (
            <>
              <span className="text-xs text-slate-500">{latestReport.reportDate}</span>
              {latestReport.forecastBillnos?.length > 0 && (
                <span className="text-xs text-slate-400" title={latestReport.forecastBillnos.join('、')}>
                  预测单: {latestReport.forecastBillnos.length <= 2
                    ? latestReport.forecastBillnos.join('、')
                    : `${latestReport.forecastBillnos[0]} 等${latestReport.forecastBillnos.length}单`}
                </span>
              )}
            </>
          )}
          <span className="text-xs text-slate-400">({reports.length}/{MAX_REPORTS})</span>
        </div>
        <div className="flex items-center gap-2">
          {latestReport && (
            <>
              <button
                onClick={handleExportCSV}
                className="text-xs px-2 py-1 text-slate-600 border border-slate-200 rounded hover:bg-slate-100"
              >
                <Download className="w-3 h-3 inline mr-1" />CSV
              </button>
              <button
                onClick={handleExportMD}
                className="text-xs px-2 py-1 text-slate-600 border border-slate-200 rounded hover:bg-slate-100"
              >
                <Download className="w-3 h-3 inline mr-1" />MD
              </button>
              <button
                onClick={handlePrintPDF}
                className="text-xs px-2 py-1 text-slate-600 border border-slate-200 rounded hover:bg-slate-100"
              >
                <Printer className="w-3 h-3 inline mr-1" />PDF
              </button>
            </>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="text-xs px-2.5 py-1 text-indigo-600 border border-indigo-200 rounded hover:bg-indigo-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 inline mr-1 ${generating ? 'animate-spin' : ''}`} />
            生成今日报告
          </button>
        </div>
      </div>

      {!latestReport ? (
        <div className="px-4 py-6 text-center text-sm text-slate-400">
          暂无报告，点击「生成今日报告」生成第一份报告
        </div>
      ) : (
        <>
          {/* Summary row */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors"
          >
            <div className="grid grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-500">物料概况</span>
                <div className="font-medium text-slate-700 mt-0.5">
                  总 {latestReport.overview.totalMaterials} |
                  就绪 <span className="text-green-600">{latestReport.overview.readyCount}</span> |
                  缺货 <span className="text-red-600">{latestReport.overview.shortageCount}</span> |
                  异常 <span className="text-amber-600">{latestReport.overview.anomalyCount}</span>
                </div>
              </div>
              <div>
                <span className="text-slate-500">行动项</span>
                <div className="font-medium text-slate-700 mt-0.5">
                  {latestReport.actionItems.length > 0 ? (
                    <>
                      紧急 <span className="text-red-600">{latestReport.actionItems.filter(a => a.level === 'danger').length}</span> |
                      关注 <span className="text-amber-600">{latestReport.actionItems.filter(a => a.level === 'warning').length}</span>
                    </>
                  ) : (
                    <span className="text-green-600">无紧急事项</span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-slate-500">趋势指标</span>
                <div className="font-medium text-slate-700 mt-0.5">
                  齐套 {latestReport.overview.matchingRate}%
                  <TrendIcon value={latestReport.overview.matchingRateChange} />
                  <span className="mx-1">|</span>
                  采购 {latestReport.overview.procurementRate}%
                  <TrendIcon value={latestReport.overview.procurementRateChange} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-slate-500">时间线</span>
                  <div className="font-medium text-slate-700 mt-0.5">
                    可生产 <span className="text-green-600">{latestReport.timeline.productionReadyCount}</span> |
                    风险 <span className="text-red-600">{latestReport.timeline.timeRiskCount}</span>
                  </div>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>
            </div>
          </button>

          {/* Expanded detail */}
          {expanded && (
            <div className="border-t border-slate-200 px-4 py-3 space-y-4">
              {/* Decision recommendations */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5">
                <h5 className="text-xs font-semibold text-indigo-800 mb-1.5">决策建议</h5>
                <ul className="space-y-1">
                  {latestReport.recommendations.map((rec, i) => (
                    <li key={i} className="text-xs text-indigo-700">{rec}</li>
                  ))}
                </ul>
              </div>

              {/* Action items table */}
              {latestReport.actionItems.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-slate-600 mb-2">紧急行动项 ({latestReport.actionItems.length} 项)</h5>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-100">
                        <th className="text-left py-1 font-medium">紧急程度</th>
                        <th className="text-left py-1 font-medium">物料</th>
                        <th className="text-left py-1 font-medium">类型</th>
                        <th className="text-left py-1 font-medium">问题</th>
                        <th className="text-left py-1 font-medium">建议</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestReport.actionItems.map(a => (
                        <tr key={a.materialCode} className={`border-b border-slate-50 ${a.level === 'danger' ? 'bg-red-50/50' : 'bg-amber-50/30'}`}>
                          <td className="py-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${a.level === 'danger' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                              {a.level === 'danger' ? '紧急' : '关注'}
                            </span>
                          </td>
                          <td className="py-1">
                            <div className="font-mono">{a.materialCode}</div>
                            <div className="text-slate-500 text-[10px] truncate max-w-[120px]">{a.materialName}</div>
                          </td>
                          <td className="py-1">{a.materialType}</td>
                          <td className="py-1 text-slate-700">{a.reason}</td>
                          <td className="py-1 font-medium text-indigo-600">{a.suggestedAction}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Timeline summary */}
              <div>
                <h5 className="text-xs font-medium text-slate-600 mb-2">倒排时间线</h5>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 rounded px-3 py-2">
                    <div className="text-[10px] text-slate-400">最早需开始采购</div>
                    <div className={`text-xs font-semibold mt-0.5 ${latestReport.timeline.daysUntilEarliestStart < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                      {latestReport.timeline.earliestStart}
                      <span className="text-[10px] font-normal text-slate-500 ml-1">
                        ({latestReport.timeline.daysUntilEarliestStart < 0
                          ? `已过 ${Math.abs(latestReport.timeline.daysUntilEarliestStart)} 天`
                          : latestReport.timeline.daysUntilEarliestStart === 0
                          ? '今天'
                          : `${latestReport.timeline.daysUntilEarliestStart} 天后`})
                      </span>
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded px-3 py-2">
                    <div className="text-[10px] text-slate-400">可推送生产</div>
                    <div className="text-xs font-semibold text-green-600 mt-0.5">{latestReport.timeline.productionReadyCount} 项</div>
                  </div>
                  <div className="bg-slate-50 rounded px-3 py-2">
                    <div className="text-[10px] text-slate-400">时间风险物料</div>
                    <div className={`text-xs font-semibold mt-0.5 ${latestReport.timeline.timeRiskCount > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                      {latestReport.timeline.timeRiskCount} 项
                    </div>
                  </div>
                </div>
              </div>

              {/* Upcoming arrivals */}
              {latestReport.upcomingArrivals.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-slate-600 mb-2">
                    本周预计到料 ({latestReport.upcomingArrivals.length} 项)
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {latestReport.upcomingArrivals.map(a => (
                      <span key={a.materialCode} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded" title={a.materialName}>
                        {a.materialCode} → {a.expectedDate}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Historical reports count */}
              {reports.length > 1 && (
                <div className="text-xs text-slate-400">
                  历史报告: {reports.length} 份（最早: {reports[0].reportDate}）
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DailyMonitoringReport;
