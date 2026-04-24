import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Tooltip } from 'antd';
import { Loader2, Layers, ChevronLeft, RefreshCw, AlertCircle } from 'lucide-react';
import { loadForecastByBillno, loadMRPByBillnos, loadInventoryByMaterials, loadPRByMRPBillnos, loadPOByPRBillnos } from '../../services/planningV2DataService';
import { multiProductTaskService } from '../../services/multiProductTaskService';
import type { ForecastRecordAPI } from '../../services/planningV2DataService';
import type { AnyPlanningTask, PlanningTask, PRRecord, PORecord, InventoryRecord } from '../../types/planningV2';
import ConfirmDialog from './ConfirmDialog';

type PanelPhase = 'idle' | 'loading' | 'results' | 'empty' | 'error';
type QtyLoadPhase = 'idle' | 'loading' | 'loaded' | 'error';

interface MrpEntry {
  bizdropqty: number;
  bizorderqty: number;
  adviseorderqty: number;
}

/** 四元状态：无MRP / 已排产未投放 / 已投放 / 已建任务 */
type RowState = 'no-mrp' | 'mrp-computed' | 'mrp-dropped' | 'existing';

interface LargeForecastBrowsePanelProps {
  /** 现有任务（AnyPlanningTask[]），用于检测已有小预测单和重复监控任务 */
  existingTasks: AnyPlanningTask[];
  /** 创建监控任务完成后的回调（触发父组件刷新 + 导航） */
  onMonitoringTaskCreated: (payload: { billno: string; forecastRecords: ForecastRecordAPI[] }) => void;
  /** 返回任务列表 */
  onBack: () => void;
}

const QtyCell = ({ value, isLoading }: { value: number | null | undefined; isLoading: boolean }) => {
  if (isLoading) {
    return <td className="px-3 py-2 text-right"><span className="inline-block w-8 h-3 bg-slate-200 rounded animate-pulse" /></td>;
  }
  return <td className="px-3 py-2 text-right text-slate-600 text-xs">{(value == null || value === 0) ? '—' : value.toLocaleString()}</td>;
};

export const LargeForecastBrowsePanel: React.FC<LargeForecastBrowsePanelProps> = ({
  existingTasks,
  onMonitoringTaskCreated,
  onBack,
}) => {
  const [billnoInput, setBillnoInput] = useState('');
  const [queriedBillno, setQueriedBillno] = useState('');
  const [phase, setPhase] = useState<PanelPhase>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [records, setRecords] = useState<ForecastRecordAPI[]>([]);
  /** materialplanid_number → MrpEntry */
  const [mrpByMaterialMap, setMrpByMaterialMap] = useState<Map<string, MrpEntry>>(new Map());
  const [showDedupWarning, setShowDedupWarning] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [mrpFilterState, setMrpFilterState] = useState<RowState | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;
  const searchGenRef = useRef(0);

  const [qtyLoadPhase, setQtyLoadPhase] = useState<QtyLoadPhase>('idle');
  const [inventoryMap, setInventoryMap] = useState<Map<string, InventoryRecord>>(new Map());
  const [prRecords, setPrRecords] = useState<PRRecord[]>([]);
  const [poRecords, setPoRecords] = useState<PORecord[]>([]);

  const getKey = (r: ForecastRecordAPI) =>
    `${r.billno}_${r.material_number}_${r.startdate}`;

  /** 已建小预测单的 matchKey 集合（billno+productCode+demandStart 三元 key）*/
  const existingKeySet = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    existingTasks.forEach(t => {
      const pt = t as PlanningTask;
      if (pt.productCode && pt.demandStart) {
        (pt.relatedForecastBillnos ?? []).forEach(billno => {
          s.add(`${billno}_${pt.productCode}_${pt.demandStart}`);
        });
      }
    });
    return s;
  }, [existingTasks]);

  const getRowState = useCallback((r: ForecastRecordAPI): RowState => {
    if (existingKeySet.has(`${r.billno}_${r.material_number}_${r.startdate}`)) return 'existing';
    if (!mrpByMaterialMap.has(r.material_number)) return 'no-mrp';
    const bizdropqty = mrpByMaterialMap.get(r.material_number)?.bizdropqty ?? 0;
    return bizdropqty > 0 ? 'mrp-dropped' : 'mrp-computed';
  }, [existingKeySet, mrpByMaterialMap]);

  // ── 查询（并行两个API）─────────────────────────────────

  const handleSearch = useCallback(async (overrideBillno?: string) => {
    const trimmed = (overrideBillno ?? billnoInput).trim();
    const gen = ++searchGenRef.current;
    if (!trimmed) return;
    setPhase('loading');
    setErrorMsg('');
    setRecords([]);
    setMrpByMaterialMap(new Map());
    setQueriedBillno(trimmed);
    setQtyLoadPhase('idle');

    let forecastData: ForecastRecordAPI[] = [];
    let mrpResult: { data?: any[] } = { data: [] };

    try {
      [forecastData, mrpResult] = await Promise.all([
        loadForecastByBillno(trimmed),
        loadMRPByBillnos([trimmed], ''),
      ]);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '网络异常，请重试');
      setPhase('error');
      return;
    }

    if (forecastData.length === 0) {
      setPhase('empty');
      return;
    }

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
    setSearchText('');
    setMrpFilterState('all');
    setCurrentPage(1);
    setPhase('results');

    // Qty columns: load independently, do not block main table rendering
    setQtyLoadPhase('loading');
    setInventoryMap(new Map());
    setPrRecords([]);
    setPoRecords([]);

    const materialCodes = forecastData.map(r => r.material_number);
    const mrpBillnos = (mrpResult.data ?? []).map((m: any) => m.billno as string).filter(Boolean);
    const demandStart = forecastData.find(r => r.startdate)?.startdate ?? '';

    try {
      const [invResult, prResult] = await Promise.all([
        loadInventoryByMaterials(materialCodes),
        loadPRByMRPBillnos(mrpBillnos, demandStart),
      ]);
      if (searchGenRef.current !== gen) return;
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
      if (searchGenRef.current !== gen) return;
      setPoRecords(poResult.data ?? []);
      setQtyLoadPhase('loaded');
    } catch {
      if (searchGenRef.current !== gen) return;
      setQtyLoadPhase('error');
    }
  }, [billnoInput]);

  const handleRetry = useCallback(() => {
    setBillnoInput(queriedBillno);
    handleSearch(queriedBillno);
  }, [queriedBillno, handleSearch]);

  // ── 创建监控任务（含去重警告）──────────────────────────

  const doCreateMonitoringTask = useCallback(() => {
    if (records.length === 0) return;
    onMonitoringTaskCreated({ billno: queriedBillno, forecastRecords: records });
  }, [records, queriedBillno, onMonitoringTaskCreated]);

  const handleCreateMonitoringTask = useCallback(() => {
    if (records.length === 0) return;
    const hasActiveDuplicate = Boolean(multiProductTaskService.findActiveDuplicate(queriedBillno));
    if (hasActiveDuplicate) {
      setShowDedupWarning(true);
    } else {
      doCreateMonitoringTask();
    }
  }, [records, queriedBillno, doCreateMonitoringTask]);

  // ── 搜索/筛选/分页 ─────────────────────────────────

  const filteredRecords = useMemo(() => {
    let result = records;
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
  }, [records, searchText, mrpFilterState, getRowState]);

  /** material_number → { prQty, poQty } */
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

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const pagedRecords = filteredRecords.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setCurrentPage(1); }, [searchText, mrpFilterState]);

  // ── 统计（四元状态）─────────────────────────────────

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

  // ── Render ────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* 标题行 */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1 hover:bg-slate-100 rounded-lg">
          <ChevronLeft size={18} className="text-slate-500" />
        </button>
        <Layers size={18} className="text-indigo-500" />
        <h2 className="text-base font-semibold text-slate-800">新建预测单任务</h2>
      </div>

      {/* 搜索行 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={billnoInput}
          onChange={e => setBillnoInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && phase !== 'loading' && handleSearch()}
          placeholder="输入预测单号（如 YCD2026031600000058）"
          disabled={phase === 'loading'}
          className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 disabled:bg-slate-50"
        />
        <button
          onClick={() => handleSearch()}
          disabled={phase === 'loading' || !billnoInput.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          {phase === 'loading'
            ? <><Loader2 size={14} className="animate-spin" />加载中...</>
            : '查询'
          }
        </button>
      </div>

      {/* 状态：idle */}
      {phase === 'idle' && (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          输入预测单号，查看产品列表和MRP投放状态，创建预测单监测任务
        </div>
      )}

      {/* 状态：loading */}
      {phase === 'loading' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500">
          <Loader2 size={28} className="animate-spin text-indigo-400" />
          <p className="text-sm">正在加载产品列表和MRP状态...</p>
        </div>
      )}

      {/* 状态：empty */}
      {phase === 'empty' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500">
          <Layers size={32} className="text-slate-300" />
          <p className="text-sm">未找到 <span className="font-mono text-slate-700">{queriedBillno}</span> 的正常状态预测记录</p>
        </div>
      )}

      {/* 状态：error */}
      {phase === 'error' && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 rounded-lg border border-red-200 text-sm">
          <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
          <span className="flex-1 text-red-700">{errorMsg}</span>
          <button onClick={handleRetry} className="flex items-center gap-1 text-red-600 hover:text-red-800 font-medium">
            <RefreshCw size={13} />重试
          </button>
        </div>
      )}

      {/* 状态：results */}
      {phase === 'results' && (
        <>
          {/* 统计文案（四元） */}
          <div className="text-xs text-slate-500">
            共 {stats.total} 条 · 已投放 {stats.droppedCount} · 已排产 {stats.computedCount} · 待排产 {stats.noMrpCount} · 已建任务 {stats.existingCount} · 可建 {stats.buildableCount}
            {filteredRecords.length < records.length && (
              <span className="ml-2 text-indigo-500">（筛选后 {filteredRecords.length} 条）</span>
            )}
          </div>

          {/* 搜索和筛选 */}
          <div className="flex gap-2 flex-shrink-0">
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

          {/* 产品表格 */}
          <div className="flex-1 overflow-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">产品编码</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">产品名称</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">预测数量</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">预测月份</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">交货截止</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">MRP状态</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">可用库存</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">MRP数量</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">投放物料数</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">PR数量</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">PO数量</th>
                  <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500 uppercase tracking-wide">任务</th>
                </tr>
              </thead>
              <tbody>
                {pagedRecords.map(r => {
                  const rowState = getRowState(r);
                  const isDimmed = rowState === 'no-mrp';
                  return (
                    <tr
                      key={getKey(r)}
                      className={`border-t border-slate-100 ${isDimmed ? 'bg-slate-50' : 'bg-white'}`}
                    >
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
                      <td className={`px-3 py-2 ${isDimmed ? 'text-slate-400' : 'text-slate-600'}`}>
                        {r.enddate}
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
                        {rowState === 'existing' && (
                          <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">已建任务</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          {filteredRecords.length > 0 && (
            <div className="flex items-center justify-between flex-shrink-0">
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

          {/* 底部操作栏 */}
          <div className="flex justify-between items-center pt-2 border-t border-slate-200">
            <span className="text-sm text-slate-500">
              创建监控任务后，可在详情中对各产品分别建小预测单任务
            </span>
            <button
              onClick={handleCreateMonitoringTask}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              创建监控任务
            </button>
          </div>
        </>
      )}

      {/* 去重警告对话框 */}
      <ConfirmDialog
        open={showDedupWarning}
        title="已存在活跃监控任务"
        description={`预测单 ${queriedBillno.slice(-8)} 已有进行中的监控任务。是否继续创建新的监控任务？`}
        confirmLabel="继续创建"
        cancelLabel="取消"
        variant="warning"
        onConfirm={() => { setShowDedupWarning(false); doCreateMonitoringTask(); }}
        onCancel={() => setShowDedupWarning(false)}
      />
    </div>
  );
};

export default LargeForecastBrowsePanel;
