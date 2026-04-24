import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BarChart3, ChevronDown, ChevronRight, ClipboardList, Filter } from 'lucide-react';
import {
  analyzeBatchDemandFulfillment,
  analyzeProductCapacity,
  buildCapacityMarkdownReport,
  buildFulfillmentMarkdownReport,
} from '../../../services/demandFulfillmentService';
import { checkForecastExists, loadProducts } from '../../../services/planningV2DataService';
import type { CapacityAnalysisResult } from '../../../services/demandFulfillmentService';
import type { BatchFulfillmentResult, MaterialPeggingResult, PlanningTask } from '../../../types/planningV2';

export type DemandFulfillmentSubTab = 'capacity' | 'fulfillment';

interface DemandFulfillmentSectionProps {
  findMonitoringTaskByProduct?: (productCode: string) => PlanningTask | undefined;
  onNavigateToMonitoringTask?: (taskId: string) => void;
  onOpenNewMonitoringTask: (productCode: string) => void;
  onOpenTaskList: () => void;
}

interface DemandInputRow {
  id: string;
  productCode: string;
  productName: string;
  quantity: string;
  priority: string;
}

interface DemandDraftInput {
  query: string;
  productCode: string;
  productName: string;
  quantity: string;
  priority: string;
}

type LevelFilter = 'all' | '0' | '1' | '2' | '3' | '4' | '5';
type TypeFilter = 'all' | '自制' | '委外' | '外购';
type SatisfactionFilter = 'all' | 'satisfied' | 'shortage';
type SharedFilter = 'all' | 'shared' | 'non_shared';
type SubstitutePresenceFilter = 'all' | 'with_substitute' | 'without_substitute';

const PAGE_SIZE = 20;

const subTabs: { id: DemandFulfillmentSubTab; label: string; icon: typeof BarChart3 }[] = [
  { id: 'capacity', label: '可售能力分析', icon: BarChart3 },
  { id: 'fulfillment', label: '新需求满足分析', icon: ClipboardList },
];

const monitoringWarningText = (productCode: string) =>
  `产品 ${productCode} 尚未下发需求预测单（Forecast）。请先在 ERP/PMC 流程中下发预测单，再回来创建监测任务。`;

const statusText: Record<'idle' | 'ok' | 'error', string> = {
  idle: '等待输入并执行分析',
  ok: '结果已生成，可用于前置评估',
  error: '分析失败，请修正输入或稍后重试',
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
}

/** BOM 第 0 层为分析产品本体，界面展示为「产品」 */
function formatCapacityBomLevelLabel(level: number | undefined): string {
  return (level ?? 0) === 0 ? '产品' : String(level);
}

function createDemandDraft(): DemandDraftInput {
  return {
    query: '',
    productCode: '',
    productName: '',
    quantity: '1',
    priority: '0',
  };
}

function downloadTextFile(filename: string, content: string, mimeType: string): void {
  if (!content.trim()) return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markdownToPrintableHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const parts: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.startsWith('### ')) {
      parts.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      i += 1;
      continue;
    }
    if (line.startsWith('## ')) {
      parts.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      i += 1;
      continue;
    }
    if (line.startsWith('# ')) {
      parts.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      i += 1;
      continue;
    }
    if (line.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.push(`<li>${escapeHtml(lines[i].trim().slice(2))}</li>`);
        i += 1;
      }
      parts.push(`<ul>${items.join('')}</ul>`);
      continue;
    }
    if (line.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i += 1;
      }
      const header = tableLines[0];
      const body = tableLines.slice(2);
      const headCells = header.split('|').slice(1, -1).map(cell => `<th>${escapeHtml(cell.trim())}</th>`).join('');
      const bodyRows = body.map(row => {
        const cols = row.split('|').slice(1, -1).map(cell => `<td>${escapeHtml(cell.trim())}</td>`).join('');
        return `<tr>${cols}</tr>`;
      }).join('');
      parts.push(`<table><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>`);
      continue;
    }
    parts.push(`<p>${escapeHtml(line)}</p>`);
    i += 1;
  }
  return parts.join('\n');
}

function printMarkdownAsPdf(filename: string, markdown: string): void {
  if (!markdown.trim()) return;
  const printableHtml = markdownToPrintableHtml(markdown);
  const win = window.open('', '_blank');
  if (!win) return;
  const docTitle = filename.replace(/\.pdf$/i, '');
  win.document.open();
  win.document.write(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(docTitle)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; margin: 24px; color: #1f2937; line-height: 1.45; }
    h1 { font-size: 24px; margin: 0 0 16px; }
    h2 { font-size: 18px; margin: 22px 0 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
    h3 { font-size: 15px; margin: 16px 0 8px; }
    p, li { font-size: 12px; margin: 6px 0; }
    ul { margin: 0 0 10px 18px; padding: 0; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 11px; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; vertical-align: top; word-break: break-word; }
    th { background: #f3f4f6; font-weight: 600; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>${printableHtml}</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 200);
}

function LogicStatement({
  status,
  warehouseFilter,
  substituteEnabled,
  analysisTimestamp,
  extra,
}: {
  status: 'idle' | 'ok' | 'error';
  warehouseFilter?: string[] | null;
  substituteEnabled?: boolean;
  analysisTimestamp?: string;
  extra?: string;
}) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${
      status === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-slate-200 bg-slate-50 text-slate-700'
    }`}>
      <p className="font-medium">业务逻辑声明条：静态供给预分析（非锁量、非承诺）</p>
      <p className="mt-1 text-xs">
        当前状态：{statusText[status]}
        {warehouseFilter ? ` ｜ 有效仓库：${warehouseFilter.join('、') || '全部'}` : ''}
        {substituteEnabled !== undefined ? ` ｜ 替代料：${substituteEnabled ? '开启' : '关闭'}` : ''}
        {analysisTimestamp ? ` ｜ 分析时间：${analysisTimestamp}` : ''}
      </p>
      {extra ? <p className="mt-1 text-xs">{extra}</p> : null}
    </div>
  );
}

export default function DemandFulfillmentSection({
  findMonitoringTaskByProduct,
  onNavigateToMonitoringTask,
  onOpenNewMonitoringTask,
  onOpenTaskList,
}: DemandFulfillmentSectionProps) {
  const [subTab, setSubTab] = useState<DemandFulfillmentSubTab>('capacity');

  const [capacityProductCode, setCapacityProductCode] = useState('');
  const [capacityProductName, setCapacityProductName] = useState('');
  const [capacityProductQuery, setCapacityProductQuery] = useState('');
  const [capacityProductQueryOpen, setCapacityProductQueryOpen] = useState(false);
  const [capacitySubstituteEnabled, setCapacitySubstituteEnabled] = useState(false);
  const [capacityResult, setCapacityResult] = useState<CapacityAnalysisResult | null>(null);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [capacityError, setCapacityError] = useState('');
  const [capacityLevelFilter, setCapacityLevelFilter] = useState<LevelFilter>('all');
  const [capacityTypeFilter, setCapacityTypeFilter] = useState<TypeFilter>('all');
  const [capacitySatisfactionFilter, setCapacitySatisfactionFilter] = useState<SatisfactionFilter>('all');
  const [capacitySubstitutePresenceFilter, setCapacitySubstitutePresenceFilter] = useState<SubstitutePresenceFilter>('all');
  const [capacityKeyword, setCapacityKeyword] = useState('');
  const [capacityPage, setCapacityPage] = useState(1);
  const [capacityExpandedGroups, setCapacityExpandedGroups] = useState<Record<string, boolean>>({});
  const capacityProductDropdownRef = useRef<HTMLLabelElement | null>(null);

  const [demandRows, setDemandRows] = useState<DemandInputRow[]>([]);
  const [demandDraft, setDemandDraft] = useState<DemandDraftInput>(createDemandDraft());
  const [productOptions, setProductOptions] = useState<Array<{ code: string; name: string }>>([]);
  const [productQueryOpen, setProductQueryOpen] = useState(false);
  const [fulfillmentSubstituteEnabled, setFulfillmentSubstituteEnabled] = useState(false);
  const [fulfillmentResult, setFulfillmentResult] = useState<BatchFulfillmentResult | null>(null);
  const [fulfillmentLoading, setFulfillmentLoading] = useState(false);
  const [fulfillmentError, setFulfillmentError] = useState('');
  const [pageByDemand, setPageByDemand] = useState<Record<string, number>>({});
  const [fulfillmentLevelFilter, setFulfillmentLevelFilter] = useState<LevelFilter>('all');
  const [fulfillmentTypeFilter, setFulfillmentTypeFilter] = useState<TypeFilter>('all');
  const [fulfillmentSatisfactionFilter, setFulfillmentSatisfactionFilter] = useState<SatisfactionFilter>('all');
  const [fulfillmentSharedFilter, setFulfillmentSharedFilter] = useState<SharedFilter>('all');
  const [fulfillmentSubstitutePresenceFilter, setFulfillmentSubstitutePresenceFilter] = useState<SubstitutePresenceFilter>('all');
  const [fulfillmentKeyword, setFulfillmentKeyword] = useState('');
  const [fulfillmentExpandedGroups, setFulfillmentExpandedGroups] = useState<Record<string, boolean>>({});
  const fulfillmentProductDropdownRef = useRef<HTMLLabelElement | null>(null);

  const [monitoringProductCode, setMonitoringProductCode] = useState('');
  const [monitoringWarning, setMonitoringWarning] = useState('');

  const capacityStatus: 'idle' | 'ok' | 'error' = capacityError ? 'error' : capacityResult ? 'ok' : 'idle';
  const fulfillmentStatus: 'idle' | 'ok' | 'error' = fulfillmentError ? 'error' : fulfillmentResult ? 'ok' : 'idle';

  const capacityReportTitle = useMemo(() => {
    if (!capacityResult) return '产品可售能力分析报告';
    const code = capacityResult.productCode;
    const name = (capacityResult.productName || '').trim() || code;
    return `${code} / ${name} 可售能力分析报告`;
  }, [capacityResult]);

  const handleCapacityAnalyze = useCallback(async () => {
    const productCode = capacityProductCode.trim();
    const productName = capacityProductName.trim() || productCode;
    if (!productCode) {
      setCapacityError('请输入产品编码后再执行可售能力分析。');
      setCapacityResult(null);
      return;
    }
    setCapacityProductQueryOpen(false);
    setCapacityLoading(true);
    setCapacityError('');
    try {
      const result = await analyzeProductCapacity(productCode, productName, capacitySubstituteEnabled);
      setCapacityResult(result);
      setCapacityExpandedGroups({});
    } catch (error) {
      console.error('[DemandFulfillmentSection] 可售能力分析失败:', error);
      setCapacityResult(null);
      setCapacityError(`产品 ${productCode} 的可售能力分析失败。请稍后重试。`);
    } finally {
      setCapacityLoading(false);
    }
  }, [capacityProductCode, capacityProductName, capacitySubstituteEnabled]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const products = await loadProducts();
        if (!active) return;
        setProductOptions(products.map(item => ({
          code: item.material_number,
          name: item.material_name || item.material_number,
        })));
      } catch (error) {
        console.error('[DemandFulfillmentSection] 加载产品候选失败:', error);
        if (!active) return;
        setProductOptions([]);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (capacityProductDropdownRef.current && !capacityProductDropdownRef.current.contains(target)) {
        setCapacityProductQueryOpen(false);
      }
      if (fulfillmentProductDropdownRef.current && !fulfillmentProductDropdownRef.current.contains(target)) {
        setProductQueryOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const filteredProductOptions = useMemo(() => {
    const keyword = demandDraft.query.trim().toLowerCase();
    if (!keyword) return productOptions.slice(0, 20);
    return productOptions.filter(item =>
      item.code.toLowerCase().includes(keyword) || item.name.toLowerCase().includes(keyword),
    ).slice(0, 20);
  }, [demandDraft.query, productOptions]);

  const filteredCapacityProductOptions = useMemo(() => {
    const keyword = capacityProductQuery.trim().toLowerCase();
    if (!keyword) return productOptions.slice(0, 20);
    return productOptions.filter(item =>
      item.code.toLowerCase().includes(keyword) || item.name.toLowerCase().includes(keyword),
    ).slice(0, 20);
  }, [capacityProductQuery, productOptions]);

  const handleSelectCapacityProductOption = useCallback((option: { code: string; name: string }) => {
    setCapacityProductQuery(`${option.code} / ${option.name}`);
    setCapacityProductCode(option.code);
    setCapacityProductName(option.name);
    setCapacityProductQueryOpen(false);
  }, []);

  const handleSelectProductOption = useCallback((option: { code: string; name: string }) => {
    setDemandDraft(prev => ({
      ...prev,
      query: `${option.code} / ${option.name}`,
      productCode: option.code,
      productName: option.name,
    }));
    setProductQueryOpen(false);
  }, []);

  const handleAddDemand = useCallback(() => {
    const productCode = demandDraft.productCode.trim();
    const productName = demandDraft.productName.trim() || productCode;
    const quantity = Number(demandDraft.quantity);
    const priority = Number(demandDraft.priority);
    if (!productCode) {
      setFulfillmentError('请先选择需求产品。');
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setFulfillmentError('需求数量必须大于 0。');
      return;
    }
    if (!Number.isFinite(priority)) {
      setFulfillmentError('优先级必须是数字。');
      return;
    }
    setFulfillmentError('');
    setDemandRows(rows => [...rows, {
      id: `demand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      productCode,
      productName,
      quantity: String(quantity),
      priority: String(priority),
    }]);
    setDemandDraft(createDemandDraft());
    setProductQueryOpen(false);
  }, [demandDraft]);

  const removeDemandRow = useCallback((id: string) => {
    setDemandRows(rows => rows.filter(row => row.id !== id));
  }, []);

  const handleFulfillmentAnalyze = useCallback(async () => {
    if (demandRows.length === 0) {
      setFulfillmentError('请至少添加一条需求后再执行分析。');
      setFulfillmentResult(null);
      return;
    }
    const normalizedDemands = demandRows.map(row => ({
      productCode: row.productCode.trim(),
      productName: row.productName.trim() || row.productCode.trim(),
      quantity: Number(row.quantity),
      priority: Number(row.priority),
    }));

    if (normalizedDemands.some(row => !row.productCode)) {
      setFulfillmentError('每一条需求都必须填写产品编码。');
      setFulfillmentResult(null);
      return;
    }
    if (normalizedDemands.some(row => !Number.isFinite(row.quantity) || row.quantity <= 0)) {
      setFulfillmentError('每一条需求的数量都必须大于 0。');
      setFulfillmentResult(null);
      return;
    }
    if (normalizedDemands.some(row => !Number.isFinite(row.priority))) {
      setFulfillmentError('每一条需求的优先级都必须是数字。');
      setFulfillmentResult(null);
      return;
    }

    setFulfillmentLoading(true);
    setFulfillmentError('');
    try {
      const result = await analyzeBatchDemandFulfillment(normalizedDemands, fulfillmentSubstituteEnabled);
      setFulfillmentResult(result);
      setFulfillmentExpandedGroups({});
      setMonitoringProductCode(normalizedDemands[0]?.productCode || '');
      const initPage: Record<string, number> = {};
      result.demands.forEach(demand => { initPage[demand.productCode] = 1; });
      setPageByDemand(initPage);
    } catch (error) {
      console.error('[DemandFulfillmentSection] 需求承接分析失败:', error);
      setFulfillmentResult(null);
      setFulfillmentError('需求承接分析失败。请稍后重试。');
    } finally {
      setFulfillmentLoading(false);
    }
  }, [demandRows, fulfillmentSubstituteEnabled]);

  const handleJumpToMonitoring = useCallback(async () => {
    const productCode = monitoringProductCode.trim();
    if (!productCode) return;
    const existingTask = findMonitoringTaskByProduct?.(productCode);
    if (existingTask) {
      setMonitoringWarning('');
      onNavigateToMonitoringTask?.(existingTask.id);
      return;
    }
    try {
      const hasForecast = await checkForecastExists(productCode);
      if (!hasForecast) {
        setMonitoringWarning(monitoringWarningText(productCode));
        return;
      }
      setMonitoringWarning('');
      onOpenNewMonitoringTask(productCode);
    } catch (error) {
      console.error('[DemandFulfillmentSection] 检查 Forecast 失败:', error);
      setMonitoringWarning(monitoringWarningText(productCode));
    }
  }, [findMonitoringTaskByProduct, monitoringProductCode, onNavigateToMonitoringTask, onOpenNewMonitoringTask]);

  const handleExportCapacity = useCallback(() => {
    if (!capacityResult) return;
    const report = buildCapacityMarkdownReport(capacityResult);
    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile(`需求承接分析_可售能力_${capacityResult.productCode}_${date}.md`, report, 'text/markdown;charset=utf-8;');
  }, [capacityResult]);
  const handleExportCapacityPdf = useCallback(() => {
    if (!capacityResult) return;
    const report = buildCapacityMarkdownReport(capacityResult);
    const date = new Date().toISOString().slice(0, 10);
    printMarkdownAsPdf(`需求承接分析_可售能力_${capacityResult.productCode}_${date}.pdf`, report);
  }, [capacityResult]);

  const handleExportFulfillment = useCallback(() => {
    if (!fulfillmentResult) return;
    const report = buildFulfillmentMarkdownReport(fulfillmentResult);
    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile(`需求承接分析_需求满足_${date}.md`, report, 'text/markdown;charset=utf-8;');
  }, [fulfillmentResult]);
  const handleExportFulfillmentPdf = useCallback(() => {
    if (!fulfillmentResult) return;
    const report = buildFulfillmentMarkdownReport(fulfillmentResult);
    const date = new Date().toISOString().slice(0, 10);
    printMarkdownAsPdf(`需求承接分析_需求满足_${date}.pdf`, report);
  }, [fulfillmentResult]);

  const fulfillmentSummary = useMemo(() => {
    if (!fulfillmentResult) return null;
    const satisfiedDemandCount = fulfillmentResult.demands.filter(demand => demand.totalSellableQty >= demand.demandQty).length;
    const demandCount = fulfillmentResult.demands.length;
    return {
      demandCount,
      satisfiedDemandCount,
      fulfillmentRate: demandCount > 0 ? (satisfiedDemandCount / demandCount) : 0,
      demandQtyTotal: fulfillmentResult.demands.reduce((sum, demand) => sum + demand.demandQty, 0),
      sellableQtyTotal: fulfillmentResult.demands.reduce((sum, demand) => sum + demand.totalSellableQty, 0),
      producibleQtyTotal: fulfillmentResult.demands.reduce((sum, demand) => sum + demand.theoreticalBuildQty, 0),
      materialCount: fulfillmentResult.demands.reduce((sum, demand) => sum + (demand.hierarchyResults?.length || demand.materialResults.length), 0),
      shortageExists: fulfillmentResult.demands.some(demand => demand.totalSellableQty < demand.demandQty),
    };
  }, [fulfillmentResult]);

  const matchLevel = (level: number | undefined, filter: LevelFilter): boolean =>
    filter === 'all' || String(level ?? 0) === filter;
  const matchType = (type: string | undefined, filter: TypeFilter): boolean =>
    filter === 'all' || (type || '') === filter;
  const matchSatisfaction = (shortage: number, filter: SatisfactionFilter): boolean => {
    if (filter === 'all') return true;
    if (filter === 'satisfied') return shortage <= 0;
    return shortage > 0;
  };
  const matchShared = (row: MaterialPeggingResult, filter: SharedFilter): boolean => {
    if (filter === 'all') return true;
    if (filter === 'shared') return !!row.isSharedMaterial;
    return !row.isSharedMaterial;
  };
  const matchSubstitutePresence = (
    row: { substituteGroup?: { members: Array<{ altPriority: number }> } },
    filter: SubstitutePresenceFilter,
  ): boolean => {
    if (filter === 'all') return true;
    const hasSubstitute = !!row.substituteGroup && row.substituteGroup.members.some(member => member.altPriority > 0);
    if (filter === 'with_substitute') return hasSubstitute;
    return !hasSubstitute;
  };

  const getMainAndGroupSatisfaction = useCallback((members: Array<{
    altPriority: number;
    availableQty: number;
    inTransitQty?: number;
  }>, requiredQty: number) => {
    const main = members.find(member => member.altPriority === 0);
    const mainCoverage = (main?.availableQty || 0) + (main?.inTransitQty || 0);
    const groupCoverage = members.reduce((sum, member) => sum + member.availableQty + (member.inTransitQty || 0), 0);
    const mainSatisfied = requiredQty <= 0 || mainCoverage >= requiredQty;
    const groupSatisfied = requiredQty <= 0 || groupCoverage >= requiredQty;
    return { mainSatisfied, groupSatisfied };
  }, []);

  const capacityRows = useMemo(() => {
    if (!capacityResult) return [] as CapacityAnalysisResult['materialDetails'];
    const keyword = capacityKeyword.trim().toLowerCase();
    return capacityResult.materialDetails.filter(row =>
      matchLevel(row.bomLevel, capacityLevelFilter)
      && matchType(row.materialType, capacityTypeFilter)
      && matchSatisfaction((row.maxProducibleQty ?? 0) <= 0 ? 1 : 0, capacitySatisfactionFilter)
      && matchSubstitutePresence(row, capacitySubstitutePresenceFilter)
      && (!keyword || row.materialCode.toLowerCase().includes(keyword) || row.materialName.toLowerCase().includes(keyword)),
    );
  }, [capacityResult, capacityKeyword, capacityLevelFilter, capacityTypeFilter, capacitySatisfactionFilter, capacitySubstitutePresenceFilter]);

  const capacityTotalPages = Math.max(1, Math.ceil(capacityRows.length / PAGE_SIZE));
  const capacitySafePage = Math.min(capacityPage, capacityTotalPages);
  const capacityPagedRows = capacityRows.slice((capacitySafePage - 1) * PAGE_SIZE, capacitySafePage * PAGE_SIZE);
  const toggleCapacityGroup = useCallback((key: string) => {
    setCapacityExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const toggleFulfillmentGroup = useCallback((key: string) => {
    setFulfillmentExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <h1 className="text-lg font-semibold text-slate-800">需求承接分析</h1>
        <p className="text-xs text-slate-500 mt-1">副标题：可售能力核算 · 新需求物料分层匹配</p>
        <div className="flex gap-2 mt-4">
          {subTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                subTab === id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {subTab === 'capacity' && (
          <>
            <section className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold text-slate-800">输入与操作</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <label ref={capacityProductDropdownRef} className="block relative">
                  <span className="mb-2 block text-xs font-medium text-slate-500">产品（编码/名称）</span>
                  <input
                    value={capacityProductQuery}
                    onChange={event => {
                      const query = event.target.value;
                      setCapacityProductQuery(query);
                      setCapacityProductCode(query.trim());
                      setCapacityProductName(query.trim());
                      setCapacityProductQueryOpen(true);
                    }}
                    onFocus={() => setCapacityProductQueryOpen(true)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="输入产品编码或名称搜索"
                  />
                  <button
                    type="button"
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => setCapacityProductQueryOpen(prev => !prev)}
                    className="absolute right-2 top-[34px] rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
                    aria-label={capacityProductQueryOpen ? '收起产品下拉' : '展开产品下拉'}
                  >
                    {capacityProductQueryOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  {capacityProductQueryOpen && filteredCapacityProductOptions.length > 0 ? (
                    <div className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow">
                      {filteredCapacityProductOptions.map(option => (
                        <button
                          key={option.code}
                          type="button"
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => handleSelectCapacityProductOption(option)}
                          className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <div className="font-medium">{option.code}</div>
                          <div className="text-xs text-slate-500">{option.name}</div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </label>
                <div />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={capacitySubstituteEnabled}
                    onChange={event => setCapacitySubstituteEnabled(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  启用替代料核算
                </label>
                <button
                  type="button"
                  onClick={() => void handleCapacityAnalyze()}
                  disabled={capacityLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  执行可售能力分析
                </button>
              </div>
              <LogicStatement
                status={capacityStatus}
                warehouseFilter={capacityResult?.analysisNote.warehouseFilter}
                substituteEnabled={capacityResult?.analysisNote.substituteEnabled}
                analysisTimestamp={capacityResult?.analysisNote.analysisTimestamp}
                extra={capacityError || (
                  capacityResult
                    ? `BOM记录总数：${capacityResult.analysisNote.bomRecordCount ?? '-'} ｜ 主料记录（alt_priority=0）：${capacityResult.analysisNote.mainBomRecordCount ?? '-'}`
                    : undefined
                )}
              />
            </section>

            <section className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">{capacityReportTitle}</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportCapacity}
                    disabled={!capacityResult}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    导出报告（Markdown）
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCapacityPdf}
                    disabled={!capacityResult}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    导出报告（PDF）
                  </button>
                </div>
              </div>
              {capacityLoading ? (
                <p className="text-sm text-slate-500">正在计算可售能力...</p>
              ) : !capacityResult ? (
                <p className="text-sm text-slate-500">输入产品后执行分析以查看层级物料明细。</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                      <p className="text-xs text-slate-500">产成品库存</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(capacityResult.finishedGoodsStock)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                      <p className="text-xs text-slate-500">理论可生产数</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(capacityResult.theoreticalBuildQty)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                      <p className="text-xs text-slate-500">合计可售</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">{formatNumber(capacityResult.totalSellableQty)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Filter size={14} className="text-slate-400" />
                      <select
                        value={capacityLevelFilter}
                        onChange={event => { setCapacityLevelFilter(event.target.value as LevelFilter); setCapacityPage(1); }}
                        className="border border-slate-200 rounded px-2 py-1 bg-white"
                      >
                        <option value="all">层级</option>
                        <option value="0">产品</option>
                        <option value="1">L1</option>
                        <option value="2">L2</option>
                        <option value="3">L3</option>
                        <option value="4">L4</option>
                        <option value="5">L5</option>
                      </select>
                      <select
                        value={capacityTypeFilter}
                        onChange={event => { setCapacityTypeFilter(event.target.value as TypeFilter); setCapacityPage(1); }}
                        className="border border-slate-200 rounded px-2 py-1 bg-white"
                      >
                        <option value="all">类型</option>
                        <option value="自制">自制</option>
                        <option value="委外">委外</option>
                        <option value="外购">外购</option>
                      </select>
                      <select
                        value={capacitySatisfactionFilter}
                        onChange={event => { setCapacitySatisfactionFilter(event.target.value as SatisfactionFilter); setCapacityPage(1); }}
                        className="border border-slate-200 rounded px-2 py-1 bg-white"
                      >
                        <option value="all">库存状态</option>
                        <option value="satisfied">可生产</option>
                        <option value="shortage">缺料</option>
                      </select>
                      <select
                        value={capacitySubstitutePresenceFilter}
                        onChange={event => { setCapacitySubstitutePresenceFilter(event.target.value as SubstitutePresenceFilter); setCapacityPage(1); }}
                        className="border border-slate-200 rounded px-2 py-1 bg-white"
                      >
                        <option value="all">替代料状态</option>
                        <option value="with_substitute">有替代料</option>
                        <option value="without_substitute">无替代料</option>
                      </select>
                      <input
                        value={capacityKeyword}
                        onChange={event => { setCapacityKeyword(event.target.value); setCapacityPage(1); }}
                        className="border border-slate-200 rounded px-2 py-1 bg-white min-w-52"
                        placeholder="搜索物料代码/名称"
                      />
                    </div>
                    <div className="text-slate-500">过滤后 {capacityRows.length} 条</div>
                  </div>
                  <div className="flex items-center justify-end gap-2 text-xs text-slate-600">
                    <button
                      type="button"
                      onClick={() => setCapacityPage(Math.max(1, capacitySafePage - 1))}
                      disabled={capacitySafePage <= 1}
                      className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40"
                    >
                      上一页
                    </button>
                    <span>{capacitySafePage}/{capacityTotalPages}</span>
                    <button
                      type="button"
                      onClick={() => setCapacityPage(Math.min(capacityTotalPages, capacitySafePage + 1))}
                      disabled={capacitySafePage >= capacityTotalPages}
                      className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40"
                    >
                      下一页
                    </button>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-slate-600">BOM Level</th>
                          <th className="px-4 py-3 text-left font-medium text-slate-600">物料</th>
                          <th className="px-4 py-3 text-left font-medium text-slate-600">类型</th>
                          <th className="px-4 py-3 text-left font-medium text-slate-600">单位需求</th>
                          <th className="px-4 py-3 text-left font-medium text-slate-600">可用库存</th>
                          <th className="px-4 py-3 text-left font-medium text-slate-600">在途</th>
                          <th className="px-4 py-3 text-left font-medium text-slate-600">最大可生产数</th>
                          <th className="px-4 py-3 text-left font-medium text-slate-600">替代料</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white">
                        {capacityPagedRows.map(row => {
                          const groupKey = row.bomPathKey || row.materialCode;
                          const expanded = !!capacityExpandedGroups[groupKey];
                          const members = row.substituteGroup?.members || [];
                          const requiredQty = row.requiredQtyPerUnit;
                          const substituteMembers = members.filter(member => member.altPriority > 0);
                          const mainMaxProducible = requiredQty > 0 ? Math.floor(row.availableQty / requiredQty) : 0;
                          const substituteMaxProducible = substituteMembers.length > 0
                            ? Math.max(...substituteMembers.map(member => (requiredQty > 0 ? Math.floor(member.availableQty / requiredQty) : 0)))
                            : 0;
                          const mainProducible = mainMaxProducible > 0;
                          const substituteProducible = substituteMaxProducible > 0;
                          const maxProducibleQty = row.maxProducibleQty ?? 0;
                          const hasShortage = maxProducibleQty <= 0;
                          return (
                            <Fragment key={groupKey}>
                              <tr key={groupKey} className={hasShortage ? 'bg-rose-50/50' : ''}>
                                <td className="px-4 py-3 text-slate-700">{formatCapacityBomLevelLabel(row.bomLevel)}</td>
                                <td className="px-4 py-3 text-slate-700">
                                  <div className="font-medium">{row.materialCode}</div>
                                  <div className="text-xs text-slate-500">{row.materialName}</div>
                                </td>
                                <td className="px-4 py-3 text-slate-700">{row.materialType || '-'}</td>
                                <td className="px-4 py-3 text-slate-700">{formatNumber(row.requiredQtyPerUnit)}</td>
                                <td className="px-4 py-3 text-slate-700">{formatNumber(row.availableQty)}</td>
                                <td className="px-4 py-3 text-slate-700">{formatNumber(row.inTransitQty)}</td>
                                <td className="px-4 py-3 text-slate-700">{hasShortage ? `⚠️ ${formatNumber(maxProducibleQty)}` : formatNumber(maxProducibleQty)}</td>
                                <td className="px-4 py-3 text-slate-700 text-xs space-y-1">
                                  {row.substituteGroup ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => toggleCapacityGroup(groupKey)}
                                        className="inline-flex items-center gap-1 text-indigo-700 font-medium hover:text-indigo-800"
                                      >
                                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        组 {row.substituteGroup.altGroupNo}（{substituteMembers.length}）
                                      </button>
                                      {mainProducible ? (
                                        <span className="inline-flex rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">主料可生产</span>
                                      ) : substituteProducible ? (
                                        <span className="inline-flex rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-indigo-700">替代料可生产</span>
                                      ) : (
                                        <span className="inline-flex rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">缺料</span>
                                      )}
                                    </>
                                  ) : (
                                    <span className={`inline-flex rounded border px-2 py-0.5 ${
                                      mainProducible
                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        : 'border-rose-200 bg-rose-50 text-rose-700'
                                    }`}>
                                      {mainProducible ? '可生产' : '缺料'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                              {row.substituteGroup && expanded ? substituteMembers.map(member => {
                                const memberMaxProducible = requiredQty > 0 ? Math.floor(member.availableQty / requiredQty) : 0;
                                const memberSatisfied = memberMaxProducible > 0;
                                return (
                                  <tr key={`${groupKey}-${member.materialCode}`} className={memberMaxProducible <= 0 ? 'bg-rose-50/50' : 'bg-indigo-50/40'}>
                                    <td className="px-4 py-3 text-slate-600">{formatCapacityBomLevelLabel(row.bomLevel)}</td>
                                    <td className="px-4 py-3 text-slate-700">
                                      <div className="pl-4 font-medium">P{member.altPriority} {member.materialCode}</div>
                                      <div className="pl-4 text-xs text-slate-500">{member.materialName}</div>
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">{member.materialType || row.materialType || '-'}</td>
                                    <td className="px-4 py-3 text-slate-700">{formatNumber(requiredQty)}</td>
                                    <td className="px-4 py-3 text-slate-700">{formatNumber(member.availableQty)}</td>
                                    <td className="px-4 py-3 text-slate-700">{formatNumber(member.inTransitQty || 0)}</td>
                                    <td className="px-4 py-3 text-slate-700">{memberMaxProducible <= 0 ? `⚠️ ${formatNumber(memberMaxProducible)}` : formatNumber(memberMaxProducible)}</td>
                                    <td className="px-4 py-3 text-xs">
                                      {memberSatisfied ? (
                                        <span className="inline-flex rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">替代料可生产</span>
                                      ) : (
                                        <span className="inline-flex rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">缺料</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              }) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {subTab === 'fulfillment' && (
          <>
            <section className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold text-slate-800">输入与操作</h2>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label ref={fulfillmentProductDropdownRef} className="block relative">
                    <span className="mb-2 block text-xs font-medium text-slate-500">需求产品（编码/名称）</span>
                    <input
                      value={demandDraft.query}
                      onChange={event => {
                        const query = event.target.value;
                        setDemandDraft(prev => ({ ...prev, query, productCode: '', productName: '' }));
                        setProductQueryOpen(true);
                      }}
                      onFocus={() => setProductQueryOpen(true)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      placeholder="输入产品编码或名称搜索"
                    />
                    <button
                      type="button"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => setProductQueryOpen(prev => !prev)}
                      className="absolute right-2 top-[34px] rounded px-2 py-1 text-slate-500 hover:bg-slate-100"
                      aria-label={productQueryOpen ? '收起产品下拉' : '展开产品下拉'}
                    >
                      {productQueryOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {productQueryOpen && filteredProductOptions.length > 0 ? (
                      <div className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow">
                        {filteredProductOptions.map(option => (
                          <button
                            key={option.code}
                            type="button"
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => handleSelectProductOption(option)}
                            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <div className="font-medium">{option.code}</div>
                            <div className="text-xs text-slate-500">{option.name}</div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </label>
                  <div />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-500">需求数量</span>
                    <input
                      value={demandDraft.quantity}
                      onChange={event => setDemandDraft(prev => ({ ...prev, quantity: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      placeholder="输入需求数量"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-xs font-medium text-slate-500">优先级</span>
                    <input
                      value={demandDraft.priority}
                      onChange={event => setDemandDraft(prev => ({ ...prev, priority: event.target.value }))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                      placeholder="输入优先级"
                    />
                  </label>
                </div>
                <div className="flex">
                  <button
                    type="button"
                    onClick={handleAddDemand}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    添加需求
                  </button>
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">产品编码</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">产品名称</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">需求数量</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">优先级</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-600">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {demandRows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-3 text-slate-500" colSpan={5}>尚未添加需求</td>
                      </tr>
                    ) : demandRows.map(row => (
                      <tr key={row.id}>
                        <td className="px-4 py-3 text-slate-700">{row.productCode}</td>
                        <td className="px-4 py-3 text-slate-700">{row.productName}</td>
                        <td className="px-4 py-3 text-slate-700">{row.quantity}</td>
                        <td className="px-4 py-3 text-slate-700">{row.priority}</td>
                        <td className="px-4 py-3 text-slate-700">
                          <button type="button" onClick={() => removeDemandRow(row.id)} className="text-xs text-slate-500 hover:text-slate-700">删除</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={fulfillmentSubstituteEnabled}
                    onChange={event => setFulfillmentSubstituteEnabled(event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  启用替代料核算
                </label>
                <button
                  type="button"
                  onClick={() => void handleFulfillmentAnalyze()}
                  disabled={fulfillmentLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  执行需求承接分析
                </button>
              </div>
              <LogicStatement
                status={fulfillmentStatus}
                warehouseFilter={fulfillmentResult?.demands[0]?.analysisNote.warehouseFilter}
                substituteEnabled={fulfillmentResult?.demands[0]?.analysisNote.substituteEnabled}
                analysisTimestamp={fulfillmentResult?.demands[0]?.analysisNote.analysisTimestamp}
                extra={fulfillmentError || undefined}
              />
            </section>

            <section className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">结果区</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportFulfillment}
                    disabled={!fulfillmentResult}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    导出报告（Markdown）
                  </button>
                  <button
                    type="button"
                    onClick={handleExportFulfillmentPdf}
                    disabled={!fulfillmentResult}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    导出报告（PDF）
                  </button>
                </div>
              </div>
              {fulfillmentLoading ? (
                <p className="text-sm text-slate-500">正在执行需求承接分析...</p>
              ) : !fulfillmentResult || !fulfillmentSummary ? (
                <p className="text-sm text-slate-500">输入需求后执行分析，查看按 BOM 全层级展开的结果。</p>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                      <p className="text-xs text-slate-500">需求数量</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{formatNumber(fulfillmentSummary.demandQtyTotal)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                      <p className="text-xs text-slate-500">可售数量</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{formatNumber(fulfillmentSummary.sellableQtyTotal)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                      <p className="text-xs text-slate-500">可生产数量</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{formatNumber(fulfillmentSummary.producibleQtyTotal)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span className="text-slate-600">需求满足度</span>
                    <span className="font-medium text-slate-900">
                      {formatNumber(fulfillmentSummary.satisfiedDemandCount)} / {formatNumber(fulfillmentSummary.demandCount)}
                      {' '}({(fulfillmentSummary.fulfillmentRate * 100).toFixed(1)}%)
                      {' '}· {fulfillmentSummary.shortageExists ? '存在缺口' : '已满足'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Filter size={14} className="text-slate-400" />
                      <select
                        value={fulfillmentLevelFilter}
                        onChange={event => {
                          setFulfillmentLevelFilter(event.target.value as LevelFilter);
                          setPageByDemand({});
                        }}
                        className="border border-slate-200 rounded px-2 py-1 bg-white"
                      >
                        <option value="all">层级</option>
                        <option value="0">L0</option>
                        <option value="1">L1</option>
                        <option value="2">L2</option>
                        <option value="3">L3</option>
                        <option value="4">L4</option>
                        <option value="5">L5</option>
                      </select>
                      <select
                        value={fulfillmentTypeFilter}
                        onChange={event => {
                          setFulfillmentTypeFilter(event.target.value as TypeFilter);
                          setPageByDemand({});
                        }}
                        className="border border-slate-200 rounded px-2 py-1 bg-white"
                      >
                        <option value="all">类型</option>
                        <option value="自制">自制</option>
                        <option value="委外">委外</option>
                        <option value="外购">外购</option>
                      </select>
                      <select
                        value={fulfillmentSatisfactionFilter}
                        onChange={event => {
                          setFulfillmentSatisfactionFilter(event.target.value as SatisfactionFilter);
                          setPageByDemand({});
                        }}
                        className="border border-slate-200 rounded px-2 py-1 bg-white"
                      >
                        <option value="all">满足状态</option>
                        <option value="satisfied">已满足</option>
                        <option value="shortage">缺口</option>
                      </select>
                      <select
                        value={fulfillmentSharedFilter}
                        onChange={event => {
                          setFulfillmentSharedFilter(event.target.value as SharedFilter);
                          setPageByDemand({});
                        }}
                        className="border border-slate-200 rounded px-2 py-1 bg-white"
                      >
                        <option value="all">共享物料</option>
                        <option value="shared">仅共享</option>
                        <option value="non_shared">仅非共享</option>
                      </select>
                      <select
                        value={fulfillmentSubstitutePresenceFilter}
                        onChange={event => {
                          setFulfillmentSubstitutePresenceFilter(event.target.value as SubstitutePresenceFilter);
                          setPageByDemand({});
                        }}
                        className="border border-slate-200 rounded px-2 py-1 bg-white"
                      >
                        <option value="all">替代料状态</option>
                        <option value="with_substitute">有替代料</option>
                        <option value="without_substitute">无替代料</option>
                      </select>
                      <input
                        value={fulfillmentKeyword}
                        onChange={event => {
                          setFulfillmentKeyword(event.target.value);
                          setPageByDemand({});
                        }}
                        className="border border-slate-200 rounded px-2 py-1 bg-white min-w-52"
                        placeholder="搜索物料代码/名称"
                      />
                    </div>
                    <div className="text-slate-500">过滤后展示按产品分组分页（20条/页）</div>
                  </div>

                  <div className="space-y-4">
                    {fulfillmentResult.demands.map((demand, index) => {
                      const keyword = fulfillmentKeyword.trim().toLowerCase();
                      const rows = (demand.hierarchyResults || demand.materialResults).filter(row =>
                        matchLevel(row.bomLevel, fulfillmentLevelFilter)
                        && matchType(row.materialType, fulfillmentTypeFilter)
                        && matchSatisfaction(row.layers.layer5_shortage, fulfillmentSatisfactionFilter)
                        && matchShared(row, fulfillmentSharedFilter)
                        && matchSubstitutePresence(row, fulfillmentSubstitutePresenceFilter)
                        && (!keyword || row.materialCode.toLowerCase().includes(keyword) || row.materialName.toLowerCase().includes(keyword)),
                      ).slice().sort((a, b) =>
                        (a.bomLevel ?? 0) - (b.bomLevel ?? 0) || (a.bomPathKey || '').localeCompare(b.bomPathKey || ''),
                      );
                      const key = demand.productCode;
                      const currentPage = pageByDemand[key] || 1;
                      const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
                      const start = (currentPage - 1) * PAGE_SIZE;
                      const pageRows = rows.slice(start, start + PAGE_SIZE);
                      return (
                        <div key={`${demand.productCode}-${index}`} className="overflow-hidden rounded-lg border border-slate-200">
                          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between">
                            <p className="text-sm font-medium text-slate-800">
                              {demand.productCode} / 需求 {formatNumber(demand.demandQty)} / 可售 {formatNumber(demand.totalSellableQty)} / 优先级 {demand.priority}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-slate-600">
                              <button
                                type="button"
                                onClick={() => setPageByDemand(prev => ({ ...prev, [key]: Math.max(1, currentPage - 1) }))}
                                disabled={currentPage <= 1}
                                className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40"
                              >
                                上一页
                              </button>
                              <span>{currentPage}/{totalPages}</span>
                              <button
                                type="button"
                                onClick={() => setPageByDemand(prev => ({ ...prev, [key]: Math.min(totalPages, currentPage + 1) }))}
                                disabled={currentPage >= totalPages}
                                className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40"
                              >
                                下一页
                              </button>
                            </div>
                          </div>
                          <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-4 py-3 text-left font-medium text-slate-600">BOM Level</th>
                                <th className="px-4 py-3 text-left font-medium text-slate-600">物料</th>
                                <th className="px-4 py-3 text-left font-medium text-slate-600">类型</th>
                                <th className="px-4 py-3 text-left font-medium text-slate-600">毛需求</th>
                                <th className="px-4 py-3 text-left font-medium text-slate-600">可用库存</th>
                                <th className="px-4 py-3 text-left font-medium text-slate-600">在途PO</th>
                                <th className="px-4 py-3 text-left font-medium text-slate-600">缺口</th>
                                <th className="px-4 py-3 text-left font-medium text-slate-600">共享标记</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white">
                              {pageRows.map(row => {
                                const rowKey = `${demand.productCode}-${row.bomPathKey || row.bomPositionKey || row.materialCode}`;
                                const groupKey = `${demand.productCode}:${row.bomPathKey || row.bomPositionKey || row.materialCode}`;
                                const expanded = !!fulfillmentExpandedGroups[groupKey];
                                const members = row.substituteGroup?.members || [];
                                const requiredQty = Math.max(0, row.grossRequirement - row.layers.layer1_semiFinished);
                                const { mainSatisfied, groupSatisfied } = getMainAndGroupSatisfaction(members, requiredQty);
                                const substituteMembers = members.filter(member => member.altPriority > 0);
                                const baseAvailableQty = fulfillmentResult.poolSnapshot.totalAvailableInv.get(row.materialCode) ?? 0;
                                const baseInTransitQty = fulfillmentResult.poolSnapshot.totalInTransitPO.get(row.materialCode) ?? 0;
                                const hasShortage = row.layers.layer5_shortage > 0;
                                return (
                                  <Fragment key={rowKey}>
                                    <tr className={hasShortage ? 'bg-rose-50/50' : ''}>
                                      <td className="px-4 py-3 text-slate-700">{row.bomLevel ?? '-'}</td>
                                      <td className="px-4 py-3 text-slate-700">
                                        <div className="font-medium">{row.materialCode}</div>
                                        <div className="text-xs text-slate-500">{row.materialName}</div>
                                        {row.substituteGroup ? (
                                          <div className="mt-1 space-y-1 text-xs">
                                            {substituteMembers.length > 0 ? (
                                              <button
                                                type="button"
                                                onClick={() => toggleFulfillmentGroup(groupKey)}
                                                className="inline-flex items-center gap-1 text-indigo-600 font-medium hover:text-indigo-700"
                                              >
                                                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                替代组 {row.substituteGroup.altGroupNo}（{substituteMembers.length}）
                                              </button>
                                            ) : (
                                              <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-500">无替代料</span>
                                            )}
                                          </div>
                                        ) : null}
                                      </td>
                                      <td className="px-4 py-3 text-slate-700">{row.materialType || '-'}</td>
                                      <td className="px-4 py-3 text-slate-700">{formatNumber(row.grossRequirement)}</td>
                                      <td className="px-4 py-3 text-slate-700">{formatNumber(baseAvailableQty)}</td>
                                      <td className="px-4 py-3 text-slate-700">{formatNumber(baseInTransitQty)}</td>
                                      <td className="px-4 py-3 text-slate-700">
                                        {hasShortage ? `⚠️ ${formatNumber(row.layers.layer5_shortage)}` : formatNumber(row.layers.layer5_shortage)}
                                        <div className="mt-1">
                                          {substituteMembers.length > 0 && mainSatisfied ? (
                                            <span className="inline-flex rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">主料满足</span>
                                          ) : substituteMembers.length > 0 && groupSatisfied ? (
                                            <span className="inline-flex rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">替代料可满足</span>
                                          ) : null}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-slate-700 text-xs">
                                        {row.isSharedMaterial ? (
                                          <div>
                                            <div className="text-amber-700 font-medium">共享</div>
                                            <div className="text-slate-500">
                                              {(row.sharedConsumers || []).map(item => `${item.productCode}:${formatNumber(item.consumedQty)}`).join(' | ')}
                                            </div>
                                          </div>
                                        ) : '—'}
                                      </td>
                                    </tr>
                                    {row.substituteGroup && expanded ? substituteMembers.map(member => {
                                      const memberCoverage = member.availableQty + (member.inTransitQty || 0);
                                      const memberShortage = Math.max(0, requiredQty - memberCoverage);
                                      return (
                                        <tr key={`${rowKey}-${member.materialCode}`} className={memberShortage > 0 ? 'bg-rose-50/50' : 'bg-indigo-50/40'}>
                                          <td className="px-4 py-3 text-slate-600">{row.bomLevel ?? '-'}</td>
                                          <td className="px-4 py-3 text-slate-700">
                                            <div className="pl-4 font-medium">P{member.altPriority} {member.materialCode}</div>
                                            <div className="pl-4 text-xs text-slate-500">{member.materialName}</div>
                                          </td>
                                          <td className="px-4 py-3 text-slate-700">{member.materialType || row.materialType || '-'}</td>
                                          <td className="px-4 py-3 text-slate-700">{formatNumber(requiredQty)}</td>
                                          <td className="px-4 py-3 text-slate-700">{formatNumber(member.availableQty)}</td>
                                          <td className="px-4 py-3 text-slate-700">{formatNumber(member.inTransitQty || 0)}</td>
                                          <td className="px-4 py-3 text-slate-700">
                                            {memberShortage > 0 ? `⚠️ ${formatNumber(memberShortage)}` : formatNumber(memberShortage)}
                                            {memberShortage <= 0 ? (
                                              <div className="mt-1">
                                                <span className="inline-flex rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">替代可满足</span>
                                              </div>
                                            ) : null}
                                          </td>
                                          <td className="px-4 py-3 text-slate-500 text-xs">—</td>
                                        </tr>
                                      );
                                    }) : null}
                                  </Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>

            <section className="bg-white rounded-lg border border-slate-200 p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-semibold text-slate-800">监测入口</h2>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <label className="block">
                  <span className="mb-2 block text-xs font-medium text-slate-500">产品编码</span>
                  <input
                    value={monitoringProductCode}
                    onChange={event => {
                      setMonitoringProductCode(event.target.value);
                      setMonitoringWarning('');
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    placeholder="输入产品编码"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleJumpToMonitoring()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
                >
                  跳转监测
                  <ArrowRight size={16} />
                </button>
              </div>
              {monitoringWarning ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
                  {monitoringWarning}
                </div>
              ) : null}
              <div className="flex">
                <button
                  type="button"
                  onClick={onOpenTaskList}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50"
                >
                  前往齐套监测 — 任务列表
                  <ArrowRight size={16} />
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
