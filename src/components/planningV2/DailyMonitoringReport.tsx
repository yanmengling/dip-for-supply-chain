/**
 * 每日监测报告组件
 *
 * PRD 8.3: 手动生成每日维度的状态快照报告
 * - 5 大板块: PR/PO 下达、物料到料、缺料进度、工单执行、预警异常
 * - 趋势指标: 齐套率、采购完成率
 * - CSV/Markdown 导出
 * - localStorage 最多 30 份/任务
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import type { GanttBar, PlanningTask, KeyMonitorMaterial } from '../../types/planningV2';

/** 每日报告数据结构（简化版，覆盖 PRD 8.3.2 核心板块） */
export interface DailyReport {
  reportDate: string;
  generatedAt: string;
  taskId: string;
  productCode: string;

  // 一、物料概况
  materialSummary: {
    totalMaterials: number;
    shortageCount: number;
    anomalyCount: number;
    withPOCount: number;
    withPRCount: number;
  };

  // 二、缺料进度
  shortageProgress: {
    totalShortageItems: number;
    resolvedFromLast: number;
    shortageList: Array<{
      materialCode: string;
      materialName: string;
      materialType: string;
      shortageQty: number;
      poStatus: string;
      poDeliverDate: string | null;
    }>;
  };

  // 三、趋势指标
  trendIndicators: {
    matchingRate: number;
    procurementRate: number;
    matchingRateChange: number;
    procurementRateChange: number;
  };

  // 四、预警
  alertSummary: {
    highRiskCount: number;
    mediumRiskCount: number;
  };

  // 五、未来 7 天预计到料
  upcomingArrivals: Array<{
    materialCode: string;
    materialName: string;
    expectedDate: string;
  }>;
}

const STORAGE_PREFIX = 'planningV2_dailyReports_';
const MAX_REPORTS = 30;

/** Load stored reports for a task */
function loadReports(taskId: string): DailyReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + taskId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Save reports for a task (max 30) */
function saveReports(taskId: string, reports: DailyReport[]) {
  const trimmed = reports.slice(-MAX_REPORTS);
  localStorage.setItem(STORAGE_PREFIX + taskId, JSON.stringify(trimmed));
}

/** Flatten non-root bars, deduplicated */
function flattenUnique(bars: GanttBar[]): GanttBar[] {
  const map = new Map<string, GanttBar>();
  function walk(b: GanttBar, root: boolean) {
    if (!root && !map.has(b.materialCode)) map.set(b.materialCode, b);
    b.children.forEach(c => walk(c, false));
  }
  bars.forEach(b => walk(b, true));
  return Array.from(map.values());
}

/** Generate a daily report from current data */
function generateReport(
  task: PlanningTask,
  ganttBars: GanttBar[],
  previousReport: DailyReport | null,
): DailyReport {
  const materials = flattenUnique(ganttBars);
  const today = new Date().toISOString().slice(0, 10);

  const shortageItems = materials.filter(b => b.supplyStatus === 'shortage');
  const anomalyItems = materials.filter(b => b.supplyStatus === 'anomaly');
  const withPO = materials.filter(b => b.poStatus === 'has_po');
  const withPR = materials.filter(b => b.prStatus === 'has_pr');
  const sufficientItems = materials.filter(
    b => b.supplyStatus === 'sufficient' || b.supplyStatus === 'sufficient_no_mrp'
  );

  // Matching rate = (total - shortage - anomaly) / total
  const matchingRate = materials.length > 0
    ? Math.round((sufficientItems.length / materials.length) * 1000) / 10
    : 100;

  // Procurement rate = withPO / total external materials (approximation)
  const externalMaterials = materials.filter(b =>
    b.materialType === '外购' || b.materialType === '委外'
  );
  const procurementRate = externalMaterials.length > 0
    ? Math.round((withPO.length / externalMaterials.length) * 1000) / 10
    : 100;

  // Trend changes (PRD 8.3.3: first report = 0)
  const matchingRateChange = previousReport
    ? Math.round((matchingRate - previousReport.trendIndicators.matchingRate) * 10) / 10
    : 0;
  const procurementRateChange = previousReport
    ? Math.round((procurementRate - previousReport.trendIndicators.procurementRate) * 10) / 10
    : 0;

  // Resolved from last
  const resolvedFromLast = previousReport
    ? Math.max(0, previousReport.shortageProgress.totalShortageItems - shortageItems.length)
    : 0;

  // Upcoming arrivals (PO deliverdate within 7 days)
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcoming = materials
    .filter(b => b.poDeliverDate && new Date(b.poDeliverDate) >= now && new Date(b.poDeliverDate) <= week)
    .map(b => ({
      materialCode: b.materialCode,
      materialName: b.materialName,
      expectedDate: b.poDeliverDate!,
    }));

  // Alert counts
  const highRiskCount = shortageItems.filter(b => b.poStatus !== 'has_po').length
    + materials.filter(b => b.poDeliverDate && new Date(b.poDeliverDate) < now && b.supplyStatus === 'shortage').length;
  const mediumRiskCount = anomalyItems.length;

  return {
    reportDate: today,
    generatedAt: new Date().toISOString(),
    taskId: task.id,
    productCode: task.productCode,
    materialSummary: {
      totalMaterials: materials.length,
      shortageCount: shortageItems.length,
      anomalyCount: anomalyItems.length,
      withPOCount: withPO.length,
      withPRCount: withPR.length,
    },
    shortageProgress: {
      totalShortageItems: shortageItems.length,
      resolvedFromLast,
      shortageList: shortageItems.map(b => ({
        materialCode: b.materialCode,
        materialName: b.materialName,
        materialType: b.materialType,
        shortageQty: Math.abs(b.shortageQuantity),
        poStatus: b.poStatus,
        poDeliverDate: b.poDeliverDate || null,
      })),
    },
    trendIndicators: {
      matchingRate,
      procurementRate,
      matchingRateChange,
      procurementRateChange,
    },
    alertSummary: { highRiskCount, mediumRiskCount },
    upcomingArrivals: upcoming,
  };
}

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

  // Export Markdown
  const handleExportMD = useCallback(() => {
    if (!latestReport) return;
    const r = latestReport;
    const lines = [
      `# 每日监测报告`,
      ``,
      `> 产品: ${task.productCode} ${task.productName}`,
      `> 报告日期: ${r.reportDate}`,
      `> 生成时间: ${r.generatedAt}`,
      ``,
      `## 物料概况`,
      `| 指标 | 数值 |`,
      `|------|------|`,
      `| 物料总数 | ${r.materialSummary.totalMaterials} |`,
      `| 缺口物料 | ${r.materialSummary.shortageCount} |`,
      `| 异常物料 | ${r.materialSummary.anomalyCount} |`,
      `| 已下PO | ${r.materialSummary.withPOCount} |`,
      `| 已下PR | ${r.materialSummary.withPRCount} |`,
      ``,
      `## 缺料进度`,
      `- 当前缺料: ${r.shortageProgress.totalShortageItems} 项`,
      `- 较上次解决: ${r.shortageProgress.resolvedFromLast} 项`,
      ``,
      `| 物料编码 | 物料名称 | 类型 | 缺口 | PO状态 | PO交期 |`,
      `|----------|----------|------|------|--------|--------|`,
      ...r.shortageProgress.shortageList.map(s =>
        `| ${s.materialCode} | ${s.materialName} | ${s.materialType} | ${s.shortageQty} | ${s.poStatus === 'has_po' ? '已下PO' : '未下PO'} | ${s.poDeliverDate || '-'} |`
      ),
      ``,
      `## 趋势指标`,
      `- 齐套率: ${r.trendIndicators.matchingRate}% (${r.trendIndicators.matchingRateChange >= 0 ? '+' : ''}${r.trendIndicators.matchingRateChange}%)`,
      `- 采购完成率: ${r.trendIndicators.procurementRate}% (${r.trendIndicators.procurementRateChange >= 0 ? '+' : ''}${r.trendIndicators.procurementRateChange}%)`,
      ``,
      `## 预警`,
      `- 高风险: ${r.alertSummary.highRiskCount} 项`,
      `- 中风险: ${r.alertSummary.mediumRiskCount} 项`,
      ``,
      `## 本周预计到料`,
      ...(r.upcomingArrivals.length > 0
        ? [`| 物料编码 | 物料名称 | 预计到料日 |`,
           `|----------|----------|-----------|`,
           ...r.upcomingArrivals.map(a => `| ${a.materialCode} | ${a.materialName} | ${a.expectedDate} |`)]
        : [`> 本周无预计到料`]),
      ``,
      `---`,
      `*本报告由供应链大脑系统自动生成*`,
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `每日监测报告_${task.productCode}_${r.reportDate}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [latestReport, task]);

  // Export CSV
  const handleExportCSV = useCallback(() => {
    if (!latestReport) return;
    const r = latestReport;
    const rows = [
      ['报告日期', r.reportDate],
      ['产品编码', r.productCode],
      ['物料总数', String(r.materialSummary.totalMaterials)],
      ['缺口物料', String(r.materialSummary.shortageCount)],
      ['异常物料', String(r.materialSummary.anomalyCount)],
      ['已下PO', String(r.materialSummary.withPOCount)],
      ['齐套率%', String(r.trendIndicators.matchingRate)],
      ['采购完成率%', String(r.trendIndicators.procurementRate)],
      ['高风险', String(r.alertSummary.highRiskCount)],
      ['中风险', String(r.alertSummary.mediumRiskCount)],
      [],
      ['缺料物料清单'],
      ['物料编码', '物料名称', '类型', '缺口', 'PO状态', 'PO交期'],
      ...r.shortageProgress.shortageList.map(s => [
        s.materialCode, s.materialName, s.materialType,
        String(s.shortageQty), s.poStatus === 'has_po' ? '已下PO' : '未下PO', s.poDeliverDate || '',
      ]),
    ];

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `每日监测报告_${task.productCode}_${r.reportDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [latestReport, task]);

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
            <span className="text-xs text-slate-500">{latestReport.reportDate}</span>
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
                <Download className="w-3 h-3 inline mr-1" />
                CSV
              </button>
              <button
                onClick={handleExportMD}
                className="text-xs px-2 py-1 text-slate-600 border border-slate-200 rounded hover:bg-slate-100"
              >
                <Download className="w-3 h-3 inline mr-1" />
                MD
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
                  总 {latestReport.materialSummary.totalMaterials} |
                  缺口 <span className="text-red-600">{latestReport.materialSummary.shortageCount}</span> |
                  异常 <span className="text-amber-600">{latestReport.materialSummary.anomalyCount}</span>
                </div>
              </div>
              <div>
                <span className="text-slate-500">缺料进度</span>
                <div className="font-medium text-slate-700 mt-0.5">
                  剩余 {latestReport.shortageProgress.totalShortageItems} 项
                  {latestReport.shortageProgress.resolvedFromLast > 0 && (
                    <span className="text-green-600 ml-1">
                      (解决 {latestReport.shortageProgress.resolvedFromLast} 项)
                    </span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-slate-500">趋势指标</span>
                <div className="font-medium text-slate-700 mt-0.5">
                  齐套 {latestReport.trendIndicators.matchingRate}%
                  <TrendIcon value={latestReport.trendIndicators.matchingRateChange} />
                  <span className="mx-1">|</span>
                  采购 {latestReport.trendIndicators.procurementRate}%
                  <TrendIcon value={latestReport.trendIndicators.procurementRateChange} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-slate-500">预警</span>
                  <div className="font-medium text-slate-700 mt-0.5">
                    高 <span className="text-red-600">{latestReport.alertSummary.highRiskCount}</span> |
                    中 <span className="text-amber-600">{latestReport.alertSummary.mediumRiskCount}</span>
                  </div>
                </div>
                {expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </div>
            </div>
          </button>

          {/* Expanded detail */}
          {expanded && (
            <div className="border-t border-slate-200 px-4 py-3 space-y-4">
              {/* Shortage list */}
              {latestReport.shortageProgress.shortageList.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-slate-600 mb-2">缺料物料清单</h5>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-500 border-b border-slate-100">
                        <th className="text-left py-1 font-medium">物料编码</th>
                        <th className="text-left py-1 font-medium">名称</th>
                        <th className="text-left py-1 font-medium">类型</th>
                        <th className="text-right py-1 font-medium">缺口</th>
                        <th className="text-center py-1 font-medium">PO</th>
                        <th className="text-left py-1 font-medium">PO交期</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestReport.shortageProgress.shortageList.map(s => (
                        <tr key={s.materialCode} className="border-b border-slate-50">
                          <td className="py-1 font-mono">{s.materialCode}</td>
                          <td className="py-1 max-w-[120px] truncate" title={s.materialName}>{s.materialName}</td>
                          <td className="py-1">{s.materialType}</td>
                          <td className="py-1 text-right text-red-600">{s.shortageQty}</td>
                          <td className="py-1 text-center">{s.poStatus === 'has_po' ? '✅' : '❌'}</td>
                          <td className="py-1">{s.poDeliverDate || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Upcoming arrivals */}
              {latestReport.upcomingArrivals.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-slate-600 mb-2">
                    未来 7 天预计到料 ({latestReport.upcomingArrivals.length} 项)
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {latestReport.upcomingArrivals.map(a => (
                      <span
                        key={a.materialCode}
                        className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded"
                        title={a.materialName}
                      >
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
