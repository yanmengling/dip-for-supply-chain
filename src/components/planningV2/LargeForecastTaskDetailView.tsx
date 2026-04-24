import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Tooltip } from 'antd';
import { Loader2, ChevronLeft, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, RefreshCw, Layers } from 'lucide-react';
import {
  loadForecastByBillno,
  loadMRPByBillnos,
  loadInventoryByMaterials,
  loadPRByMRPBillnos,
  loadPOByPRBillnos,
  loadMaterialsByCode,
} from '../../services/planningV2DataService';
import type { ForecastRecordAPI, MRPPlanOrderAPI } from '../../services/planningV2DataService';
import LargeForecastMaterialList from './LargeForecastMaterialList';
import { taskService } from '../../services/taskService';
import { pushFormDataToDIP } from '../../services/monitoringTaskApiService';
import ConfirmDialog from './ConfirmDialog';
import { isLargeForecastTask } from '../../types/planningV2';
import type { LargeForecastTask, PlanningTask, AnyPlanningTask, GanttBar, PRRecord, PORecord, InventoryRecord } from '../../types/planningV2';
import { ganttService } from '../../services/ganttService';
import DailyMonitoringReport from './DailyMonitoringReport';

interface MrpEntry {
  bizdropqty: number;
  bizorderqty: number;
  adviseorderqty: number;
}
type QtyLoadPhase = 'idle' | 'loading' | 'loaded' | 'error';

type TabFilter = 'all' | 'buildable' | 'no-mrp' | 'existing';
/** 四元状态 */
type RowState = 'no-mrp' | 'mrp-computed' | 'mrp-dropped' | 'existing';
type LoadPhase = 'loading' | 'loaded' | 'error';

interface LargeForecastTaskDetailViewProps {
  task: LargeForecastTask;
  allTasks: AnyPlanningTask[];
  onBack: () => void;
  onViewSmallTask: (taskId: string) => void;
  onStartNewTaskFromForecast: (record: ForecastRecordAPI, parentBillno: string) => void;
  onBatchCreated: (count: number) => void;
}

const QtyCell = ({ value, isLoading }: { value: number | null | undefined; isLoading: boolean }) => {
  if (isLoading) {
    return <td className="px-3 py-2 text-right"><span className="inline-block w-8 h-3 bg-slate-200 rounded animate-pulse" /></td>;
  }
  return <td className="px-3 py-2 text-right text-slate-600 text-xs">{(value == null || value === 0) ? '—' : value.toLocaleString()}</td>;
};

export const LargeForecastTaskDetailView: React.FC<LargeForecastTaskDetailViewProps> = ({
  task,
  allTasks,
  onBack,
  onViewSmallTask,
  onStartNewTaskFromForecast,
  onBatchCreated,
}) => {
  const [loadPhase, setLoadPhase] = useState<LoadPhase>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const [records, setRecords] = useState<ForecastRecordAPI[]>([]);
  const [mrpByMaterialMap, setMrpByMaterialMap] = useState<Map<string, MrpEntry>>(new Map());
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [mrpFilterState, setMrpFilterState] = useState<RowState | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;
  const [qtyLoadPhase, setQtyLoadPhase] = useState<QtyLoadPhase>('idle');
  const [inventoryMap, setInventoryMap] = useState<Map<string, InventoryRecord>>(new Map());
  const [prRecords, setPrRecords] = useState<PRRecord[]>([]);
  const [poRecords, setPoRecords] = useState<PORecord[]>([]);
  const [mrpRawRecords, setMrpRawRecords] = useState<MRPPlanOrderAPI[]>([]);
  const [materialLeadtimeMap, setMaterialLeadtimeMap] = useState<Map<string, { purchaseLeadtime: number; productLeadtime: number }>>(new Map());
  const loadGenRef = useRef(0);
  const ganttGenRef = useRef(0);
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);
  const [productListCollapsed, setProductListCollapsed] = useState(false);
  const [ganttBarsCache, setGanttBarsCache] = useState<Map<string, GanttBar[]>>(new Map());
  const [ganttLoadingKey, setGanttLoadingKey] = useState<string | null>(null);

  // Reset expand state when viewing a different large forecast task
  useEffect(() => {
    ganttGenRef.current += 1; // invalidate any in-flight gantt fetch from previous task
    setExpandedRowKey(null);
    setGanttBarsCache(new Map());
    setGanttLoadingKey(null);
  }, [task.id]);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [pendingRecords, setPendingRecords] = useState<ForecastRecordAPI[]>([]);
  const [creating, setCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState({ done: 0, total: 0 });
  const [createDone, setCreateDone] = useState(false);

  const getKey = (r: ForecastRecordAPI) => `${r.billno}_${r.material_number}_${r.startdate}`;

  // ── Data loading ──────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const gen = ++loadGenRef.current;
    setLoadPhase('loading');
    setQtyLoadPhase('idle');
    setMrpRawRecords([]);
    setMaterialLeadtimeMap(new Map());
    Promise.all([
      loadForecastByBillno(task.forecastBillno),
      loadMRPByBillnos([task.forecastBillno], ''),
    ])
      .then(async ([forecastData, mrpResult]) => {
        if (cancelled) return;
        const mrpMap = new Map<string, MrpEntry>();
        (mrpResult.data ?? []).forEach((m: any) => {
          const prev = mrpMap.get(m.materialplanid_number);
          mrpMap.set(m.materialplanid_number, {
            bizdropqty: Math.max(prev?.bizdropqty ?? 0, m.bizdropqty ?? 0),
            bizorderqty: (prev?.bizorderqty ?? 0) + (m.bizorderqty ?? 0),
            adviseorderqty: (prev?.adviseorderqty ?? 0) + (m.adviseorderqty ?? 0),
          });
        });
        setRecords(forecastData);
        setMrpByMaterialMap(mrpMap);
        setMrpRawRecords(mrpResult.allMrpRecords ?? mrpResult.data ?? []);
        setLoadPhase('loaded');

        // Qty columns: load independently
        if (cancelled) return;
        setQtyLoadPhase('loading');
        const productCodes = forecastData.map(r => r.material_number);
        const subMaterialCodes = [...new Set((mrpResult.data ?? [])
          .map((m: any) => (m.materialplanid_number as string)?.trim())
          .filter(Boolean))];
        const allMaterialCodes = [...new Set([...productCodes, ...subMaterialCodes])];
        const mrpBillnos = (mrpResult.data ?? []).map((m: any) => m.billno as string).filter(Boolean);
        const demandStart = forecastData.find(r => r.startdate)?.startdate ?? '';
        try {
          const [invResult, prResult, matResult] = await Promise.all([
            loadInventoryByMaterials(allMaterialCodes),
            loadPRByMRPBillnos(mrpBillnos, demandStart),
            loadMaterialsByCode(subMaterialCodes),
          ]);
          if (loadGenRef.current !== gen) return;
          const invMap = new Map<string, InventoryRecord>();
          invResult.forEach(r => {
            const prev = invMap.get(r.material_code);
            invMap.set(r.material_code, prev
              ? { ...prev, available_inventory_qty: prev.available_inventory_qty + r.available_inventory_qty }
              : r
            );
          });
          setInventoryMap(invMap);
          setPrRecords(prResult.data ?? []);
          const prBillnos = (prResult.data ?? []).map(p => p.billno).filter(Boolean);
          const poResult = await loadPOByPRBillnos(prBillnos, demandStart);
          if (loadGenRef.current !== gen) return;
          setPoRecords(poResult.data ?? []);
          const ltMap = new Map<string, { purchaseLeadtime: number; productLeadtime: number }>();
          for (const mat of matResult) {
            const code = mat.material_code?.trim();
            if (!code) continue;
            ltMap.set(code, {
              purchaseLeadtime: parseFloat(mat.purchase_fixedleadtime) || 0,
              productLeadtime: parseFloat(mat.product_fixedleadtime) || 0,
            });
          }
          const missingCodes = subMaterialCodes.filter(c => !ltMap.has(c));
          if (missingCodes.length > 0) {
            console.warn('[LargeForecastTaskDetailView] 以下子物料在主数据中未找到，标准交期将显示为空:', missingCodes);
          }
          setMaterialLeadtimeMap(ltMap);
          setQtyLoadPhase('loaded');
        } catch {
          if (loadGenRef.current !== gen) return;
          setQtyLoadPhase('error');
        }
      })
      .catch(e => {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : '加载失败');
        setLoadPhase('error');
      });
    return () => { cancelled = true; };
  }, [task.forecastBillno, retryCount]);

  // ── Row state ──────────────────────────────────────

  const existingKeySet = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    allTasks.forEach(t => {
      const pt = t as PlanningTask;
      if (pt.productCode && pt.demandStart) {
        (pt.relatedForecastBillnos ?? []).forEach(billno => {
          s.add(`${billno}_${pt.productCode}_${pt.demandStart}`);
        });
      }
    });
    return s;
  }, [allTasks]);

  /** Map existing row key → PlanningTask, for expand-row DailyMonitoringReport */
  const existingKeyToTask = useMemo<Map<string, PlanningTask>>(() => {
    const map = new Map<string, PlanningTask>();
    for (const t of allTasks) {
      if (isLargeForecastTask(t)) continue;
      const pt = t as PlanningTask;
      for (const billno of pt.relatedForecastBillnos ?? []) {
        const key = `${billno}_${pt.productCode}_${pt.demandStart}`;
        map.set(key, pt);
      }
    }
    return map;
  }, [allTasks]);

  const getRowState = useCallback((r: ForecastRecordAPI): RowState => {
    if (existingKeySet.has(`${r.billno}_${r.material_number}_${r.startdate}`)) return 'existing';
    if (!mrpByMaterialMap.has(r.material_number)) return 'no-mrp';
    const bizdropqty = mrpByMaterialMap.get(r.material_number)?.bizdropqty ?? 0;
    return bizdropqty > 0 ? 'mrp-dropped' : 'mrp-computed';
  }, [existingKeySet, mrpByMaterialMap]);

  const findSmallTask = useCallback((r: ForecastRecordAPI): PlanningTask | undefined =>
    allTasks.find(t => {
      const pt = t as PlanningTask;
      return pt.productCode === r.material_number &&
        pt.demandStart === r.startdate &&
        pt.relatedForecastBillnos?.includes(r.billno);
    }) as PlanningTask | undefined,
  [allTasks]);

  const stats = useMemo(() => {
    const rowStates = records.map(r => getRowState(r));
    return {
      total: records.length,
      droppedCount:   rowStates.filter(s => s === 'mrp-dropped').length,
      computedCount:  rowStates.filter(s => s === 'mrp-computed').length,
      noMrpCount:     rowStates.filter(s => s === 'no-mrp').length,
      existingCount:  rowStates.filter(s => s === 'existing').length,
      buildableCount: rowStates.filter(s => s === 'mrp-computed' || s === 'mrp-dropped').length,
    };
  }, [records, getRowState]);

  // ── Batch create ──────────────────────────────────────

  const buildableRecords = useMemo(() =>
    records.filter(r => { const s = getRowState(r); return s === 'mrp-computed' || s === 'mrp-dropped'; }),
    [records, getRowState]);

  const executeBatchCreate = useCallback(async (selectedRecords: ForecastRecordAPI[]) => {
    setCreating(true);
    setCreateProgress({ done: 0, total: selectedRecords.length });
    let createdCount = 0;
    for (let i = 0; i < selectedRecords.length; i++) {
      const r = selectedRecords[i];
      const taskName = `${r.material_name} - ${r.billno.slice(-8)}`;
      taskService.createTask({
        name: taskName,
        productCode: r.material_number,
        productName: r.material_name,
        demandStart: r.startdate,
        demandEnd: r.enddate,
        demandQuantity: r.qty,
        relatedForecastBillnos: [r.billno],
        parentForecastBillno: r.billno,
      });
      void pushFormDataToDIP({
        task_name: taskName,
        product_code: r.material_number,
        product_name: r.material_name,
        demand_start: r.startdate,
        demand_end: r.enddate,
        demand_quantity: r.qty,
        production_start: r.startdate,
        production_end: r.enddate,
        production_quantity: r.qty,
      });
      createdCount++;
      setCreateProgress({ done: i + 1, total: selectedRecords.length });
      if (i % 8 === 7) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    setCreating(false);
    setCreateDone(true);
    setSelectedKeys(new Set());
    onBatchCreated(createdCount);
    setTimeout(() => setCreateDone(false), 2000);
  }, [onBatchCreated]);

  const handleToggleExpand = useCallback(async (rowKey: string) => {
    // Collapse if already expanded
    if (expandedRowKey === rowKey) {
      setExpandedRowKey(null);
      return;
    }
    // If ganttBars already cached, expand immediately
    if (ganttBarsCache.has(rowKey)) {
      setExpandedRowKey(rowKey);
      return;
    }
    // Lazy-load ganttBars for this task
    const planningTask = existingKeyToTask.get(rowKey);
    if (!planningTask) return;
    const gen = ++ganttGenRef.current;
    setExpandedRowKey(rowKey);
    setGanttLoadingKey(rowKey);
    try {
      const result = await ganttService.buildGanttData(
        planningTask.productCode,
        planningTask.demandStart,
        planningTask.demandEnd,
        planningTask.relatedForecastBillnos ?? [],
        planningTask.demandStart,
        planningTask.demandQuantity,
      );
      if (ganttGenRef.current !== gen) return;
      setGanttBarsCache(prev => new Map(prev).set(rowKey, result.bars));
    } catch {
      if (ganttGenRef.current !== gen) return;
      // On error keep row expanded; DailyMonitoringReport handles empty bars gracefully
      setGanttBarsCache(prev => new Map(prev).set(rowKey, []));
    } finally {
      if (ganttGenRef.current === gen) setGanttLoadingKey(null);
    }
  }, [expandedRowKey, ganttBarsCache, existingKeyToTask]);

  const handleBatchCreateClick = useCallback(() => {
    const selected = buildableRecords.filter(r => selectedKeys.has(getKey(r)));
    if (selected.length === 0) return;
    if (selected.length >= 5) { setPendingRecords(selected); setShowBatchConfirm(true); }
    else void executeBatchCreate(selected);
  }, [buildableRecords, selectedKeys, executeBatchCreate]);

  // ── Auto-complete monitoring task ──────────────────────

  useEffect(() => {
    if (loadPhase !== 'loaded') return;
    // Only auto-complete if there's evidence of actual work done:
    // - buildableCount === 0 means no more tasks can be built
    // - existingCount > 0 means at least one task was built (excluding the all-no-mrp case)
    if (stats.buildableCount === 0 && stats.existingCount > 0 && task.status === 'active') {
      taskService.updateLargeForecastTaskStatus(task.id, 'completed');
    }
  }, [stats.buildableCount, stats.existingCount, loadPhase, task.id, task.status]);

  // ── Qty by material ───────────────────────────────────

  const qtyByMaterial = useMemo(() => {
    const result = new Map<string, { prQty: number; poQty: number }>();
    const prBillnoToMaterial = new Map<string, string>();
    prRecords.forEach(p => {
      result.set(p.material_number, {
        prQty: (result.get(p.material_number)?.prQty ?? 0) + (p.qty ?? 0),
        poQty: result.get(p.material_number)?.poQty ?? 0,
      });
      prBillnoToMaterial.set(p.billno, p.material_number);
    });
    poRecords.forEach(po => {
      const mat = prBillnoToMaterial.get(po.srcbillnumber);
      if (!mat) return;
      const prev = result.get(mat);
      if (prev) {
        result.set(mat, { ...prev, poQty: prev.poQty + (po.actqty ?? po.qty ?? 0) });
      }
    });
    return result;
  }, [prRecords, poRecords]);

  // ── Filtered records for current tab + search + mrp filter ──────────────────

  const filteredRecords = useMemo(() => {
    let result = records;
    // Tab filter
    switch (activeTab) {
      case 'buildable': result = result.filter(r => { const s = getRowState(r); return s === 'mrp-computed' || s === 'mrp-dropped'; }); break;
      case 'no-mrp':    result = result.filter(r => getRowState(r) === 'no-mrp'); break;
      case 'existing':  result = result.filter(r => getRowState(r) === 'existing'); break;
    }
    // Text search
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(r =>
        r.material_number.toLowerCase().includes(q) ||
        r.material_name.toLowerCase().includes(q)
      );
    }
    // MRP state filter
    if (mrpFilterState !== 'all') {
      result = result.filter(r => getRowState(r) === mrpFilterState);
    }
    return result;
  }, [records, activeTab, getRowState, searchText, mrpFilterState]);

  // ── Pagination ────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const pagedRecords = filteredRecords.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [searchText, mrpFilterState, activeTab]);

  // ── Status label ──────────────────────────────────────

  const statusLabel = task.status === 'active' ? '进行中' : task.status === 'completed' ? '已完成' : '已结束';
  const statusColor = task.status === 'active' ? 'text-emerald-600 bg-emerald-50' : task.status === 'completed' ? 'text-blue-600 bg-blue-50' : 'text-slate-500 bg-slate-50';

  // ── Render ────────────────────────────────────────────

  if (loadPhase === 'loading') {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 text-slate-500">
        <Loader2 size={28} className="animate-spin text-indigo-400" />
        <p className="text-sm">正在加载产品列表和MRP状态...</p>
      </div>
    );
  }

  if (loadPhase === 'error') {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3">
        <AlertTriangle size={28} className="text-red-400" />
        <p className="text-sm text-red-600">{errorMsg}</p>
        <button
          onClick={() => { setErrorMsg(''); setRetryCount(c => c + 1); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-700"
        >
          <RefreshCw size={13} /> 重试
        </button>
      </div>
    );
  }

  const selectedBuildable = buildableRecords.filter(r => selectedKeys.has(getKey(r)));

  return (
    <div className="flex flex-col h-full p-6 gap-4 overflow-hidden">
      {/* 标题行 */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <button onClick={onBack} className="p-1 hover:bg-slate-100 rounded-lg">
          <ChevronLeft size={18} className="text-slate-500" />
        </button>
        <Layers size={18} className="text-indigo-500 flex-shrink-0" />
        <h2 className="text-base font-semibold text-slate-800 truncate flex-1">
          大预测单 {task.forecastBillno}
        </h2>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${statusColor}`}>
          ● {statusLabel}
        </span>
      </div>
      <p className="text-xs text-slate-400 flex-shrink-0">
        单据日期 {task.forecastMeta.bizdate?.slice(0, 10)} · 审核人 {task.forecastMeta.auditorName} · 建立于 {task.createdAt?.slice(0, 10)}
      </p>

      {/* 汇总卡片（六格）*/}
      <div className="grid grid-cols-6 gap-3 flex-shrink-0">
        {[
          { label: '总产品',   value: stats.total },
          { label: '已投放',   value: stats.droppedCount,  color: 'text-emerald-600' },
          { label: '已排产',   value: stats.computedCount, color: 'text-indigo-600' },
          { label: '待排产',   value: stats.noMrpCount,    color: 'text-amber-600' },
          { label: '已建任务', value: stats.existingCount, color: 'text-blue-600' },
          { label: '可建任务', value: stats.buildableCount, color: 'text-violet-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-lg border border-slate-200 p-3 text-center">
            <p className={`text-2xl font-bold ${color ?? 'text-slate-700'}`}>{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* 滚动区域：整体产品监控清单 + 物料监控清单 */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">

      {/* 整体产品监控清单（可收缩） */}
      <div className="bg-white border border-slate-200 rounded-lg flex-shrink-0">
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-slate-200 cursor-pointer select-none"
          onClick={() => setProductListCollapsed(c => !c)}
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800">整体产品监控清单</h3>
            <span className="text-xs text-slate-400">{filteredRecords.length} 条</span>
          </div>
          {productListCollapsed
            ? <ChevronRight size={14} className="text-slate-400" />
            : <ChevronDown size={14} className="text-slate-400" />
          }
        </div>

        {!productListCollapsed && (
          <div className="flex flex-col gap-3 p-4">
            {/* Tab 筛选 + 批量操作 */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {([
                  { key: 'all',      label: `全部 ${stats.total}` },
                  { key: 'buildable', label: `可建 ${stats.buildableCount}` },
                  { key: 'no-mrp',   label: `待排产 ${stats.noMrpCount}` },
                  { key: 'existing', label: `已建 ${stats.existingCount}` },
                ] as const).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      activeTab === tab.key
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {stats.buildableCount > 0 && (
                <button
                  onClick={handleBatchCreateClick}
                  disabled={selectedBuildable.length === 0 || creating}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating
                    ? <><Loader2 size={12} className="animate-spin" />{createProgress.done}/{createProgress.total}</>
                    : createDone
                    ? <><CheckCircle2 size={12} />已完成</>
                    : `批量建任务 (${selectedBuildable.length})`
                  }
                </button>
              )}
            </div>

            {/* 搜索和筛选 */}
            <div className="flex gap-2">
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="搜索产品编码 / 名称"
          className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
        />
        <select
          value={mrpFilterState}
          onChange={e => setMrpFilterState(e.target.value as RowState | 'all')}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 bg-white"
        >
          <option value="all">全部状态</option>
          <option value="no-mrp">待排产</option>
          <option value="mrp-computed">已排产</option>
          <option value="mrp-dropped">已投放</option>
          <option value="existing">已建任务</option>
        </select>
      </div>

            {/* 产品列表 */}
            <div className="overflow-auto border border-slate-200 rounded-lg max-h-[420px]">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 w-8">
                <input
                  type="checkbox"
                  checked={buildableRecords.length > 0 && buildableRecords.every(r => selectedKeys.has(getKey(r)))}
                  onChange={e => {
                    if (e.target.checked) {
                      setSelectedKeys(new Set(buildableRecords.map(getKey)));
                    } else {
                      setSelectedKeys(new Set());
                    }
                  }}
                  className="rounded"
                />
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">产品编码</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">产品名称</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">预测数量</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">预测月份</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">MRP状态</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">可用库存</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">MRP数量</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">投放物料数</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">PR数量</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">PO数量</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">操作</th>
              <th className="px-2 py-2 w-9" />
            </tr>
          </thead>
          <tbody>
            {pagedRecords.map(r => {
              const rowState = getRowState(r);
              const key = getKey(r);
              const isBuildable = rowState === 'mrp-computed' || rowState === 'mrp-dropped';
              const isDimmed = rowState === 'no-mrp';
              const isSelected = selectedKeys.has(key);

              return (
                <React.Fragment key={key}>
                  <tr
                    className={`border-t border-slate-100 ${
                      isSelected ? 'bg-indigo-50' : isDimmed ? 'bg-slate-50' : 'bg-white'
                    }`}
                  >
                    <td className="px-3 py-2 w-8">
                      {isBuildable ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            const next = new Set(selectedKeys);
                            if (e.target.checked) next.add(key); else next.delete(key);
                            setSelectedKeys(next);
                          }}
                          className="rounded"
                        />
                      ) : null}
                    </td>
                    <td className={`px-3 py-2 font-mono text-xs ${isDimmed ? 'text-slate-400' : 'text-slate-700'}`}>
                      {r.material_number}
                    </td>
                    <td className={`px-3 py-2 ${isDimmed ? 'text-slate-400' : 'text-slate-800'}`}>
                      {r.material_name}
                    </td>
                    <td className={`px-3 py-2 text-right ${isDimmed ? 'text-slate-400' : 'text-slate-800'}`}>
                      {r.qty?.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 ${isDimmed ? 'text-slate-400' : 'text-slate-600'}`}>
                      {r.startdate?.slice(0, 7)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {rowState === 'no-mrp' && (
                        <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full">待排产</span>
                      )}
                      {rowState === 'mrp-computed' && (
                        <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">已排产</span>
                      )}
                      {(rowState === 'mrp-dropped' || rowState === 'existing') && (
                        <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">已投放</span>
                      )}
                    </td>
                    <QtyCell value={inventoryMap.get(r.material_number)?.available_inventory_qty} isLoading={qtyLoadPhase === 'loading'} />
                    <QtyCell value={(() => {
                      const e = mrpByMaterialMap.get(r.material_number);
                      if (!e) return null;
                      return e.bizorderqty > 0 ? e.bizorderqty : e.adviseorderqty;
                    })()} isLoading={qtyLoadPhase === 'loading'} />
                    <QtyCell value={mrpByMaterialMap.get(r.material_number)?.bizdropqty} isLoading={qtyLoadPhase === 'loading'} />
                    <QtyCell value={qtyByMaterial.get(r.material_number)?.prQty} isLoading={qtyLoadPhase === 'loading'} />
                    <QtyCell value={qtyByMaterial.get(r.material_number)?.poQty} isLoading={qtyLoadPhase === 'loading'} />
                    <td className="px-3 py-2 text-center">
                      {rowState === 'existing' ? (
                        <button
                          onClick={() => {
                            const smallTask = findSmallTask(r);
                            if (smallTask) onViewSmallTask(smallTask.id);
                          }}
                          className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                        >
                          查看
                        </button>
                      ) : isBuildable ? (
                        <button
                          onClick={() => onStartNewTaskFromForecast(r, task.forecastBillno)}
                          className="text-xs px-2 py-1 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100"
                        >
                          建任务
                        </button>
                      ) : (
                        <Tooltip title="等待ERP运算MRP后可建任务" placement="left">
                          <span className="text-xs text-slate-300 px-2 py-1">—</span>
                        </Tooltip>
                      )}
                    </td>
                    {/* Expand icon cell */}
                    <td className="px-2 py-2 text-center w-9">
                      {rowState === 'existing' && (
                        <button
                          onClick={() => handleToggleExpand(key)}
                          className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        >
                          {expandedRowKey === key
                            ? <ChevronDown size={14} />
                            : <ChevronRight size={14} />
                          }
                        </button>
                      )}
                    </td>
                  </tr>
                  {/* Expansion row */}
                  {expandedRowKey === key && rowState === 'existing' && (() => {
                    const pt = existingKeyToTask.get(key);
                    if (!pt) return null;
                    return (
                      <tr>
                        <td
                          colSpan={13}
                          className="p-0 border-l-2 border-indigo-300 bg-slate-50 border-t border-indigo-100"
                        >
                          {ganttLoadingKey === key ? (
                            <div className="flex items-center justify-center gap-2 py-6 text-slate-500 text-sm">
                              <Loader2 size={16} className="animate-spin text-indigo-400" />
                              正在加载监测数据...
                            </div>
                          ) : (
                            <div className="px-4 py-2">
                              <DailyMonitoringReport
                                task={pt}
                                ganttBars={ganttBarsCache.get(key) ?? []}
                              />
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })()}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
            </div>

            {/* 分页 */}
            {filteredRecords.length > 0 && (
              <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                <span className="text-xs text-slate-500">
                  第 {currentPage} 页 / 共 {totalPages} 页（{filteredRecords.length} 条）
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-xs rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-xs rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 大预测单整体物料监控清单 */}
      {loadPhase === 'loaded' && (
        <div className="bg-white border border-slate-200 rounded-lg flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">整体物料监控清单</h3>
              <span className="text-xs text-slate-400 font-mono">{task.forecastBillno}</span>
              {qtyLoadPhase === 'loaded' && (
                <span className="text-xs text-slate-400">
                  目标交期：{records.map(r => r.startdate).filter(Boolean).sort()[0] ?? '—'}
                </span>
              )}
            </div>
          </div>
          <div className="p-4">
            {qtyLoadPhase === 'error' ? (
              <p className="text-xs text-slate-400">数据加载失败，数量列刷新后重试</p>
            ) : (
              <LargeForecastMaterialList
                mrpRecords={mrpRawRecords}
                prRecords={prRecords}
                poRecords={poRecords}
                materialLeadtimeMap={materialLeadtimeMap}
                forecastDeadline={records.map(r => r.startdate).filter(Boolean).sort()[0] ?? ''}
                isLoading={qtyLoadPhase === 'loading'}
              />
            )}
          </div>
        </div>
      )}

      </div>{/* end scrollable area */}

      {/* 批量确认对话框 */}
      <ConfirmDialog
        open={showBatchConfirm}
        title={`批量建任务 (${pendingRecords.length} 条)`}
        description={`即将为 ${pendingRecords.length} 个产品创建小预测单任务，确认继续？`}
        confirmLabel="确认创建"
        cancelLabel="取消"
        variant="warning"
        onConfirm={() => { setShowBatchConfirm(false); void executeBatchCreate(pendingRecords); }}
        onCancel={() => setShowBatchConfirm(false)}
      />
    </div>
  );
};

export default LargeForecastTaskDetailView;
