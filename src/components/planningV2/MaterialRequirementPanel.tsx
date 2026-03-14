/**
 * 步骤② 物料需求计划(MRP) - MRP记录为主表 + PR/PO状态跟踪
 * 精确关联：预测单号 → MRP → PR → PO
 * 降级仅在预测单号匹配不到任何 MRP 时触发（回退到 BOM 物料维度）
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, AlertCircle, Check, X, Minus, Filter } from 'lucide-react';
import { planningV2DataService } from '../../services/planningV2DataService';
import type { MRPPlanOrderAPI } from '../../services/planningV2DataService';
import type { Step1Data, MRPDisplayRow, PRRecord, PORecord } from '../../types/planningV2';

interface MaterialRequirementPanelProps {
  active: boolean;
  step1Data: Step1Data;
  onConfirm: () => void;
  onBack: () => void;
}

type CloseStatusFilter = 'all' | 'normal' | 'closed';

/** Reusable key-value row inside tooltip cards */
const TipRow = ({ label, value }: { label: string; value: string | number }) => (
  <div className="flex justify-between">
    <span className="text-slate-500">{label}</span>
    <span className="text-slate-800">{value || '-'}</span>
  </div>
);

const PAGE_SIZE = 20;

const MaterialRequirementPanel = ({ active, step1Data, onConfirm, onBack }: MaterialRequirementPanelProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MRPDisplayRow[]>([]);
  const [closeStatusFilter, setCloseStatusFilter] = useState<CloseStatusFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [tooltip, setTooltip] = useState<{
    type: 'pr' | 'po'; records: PRRecord[] | PORecord[]; rect: DOMRect;
  } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [mrpTotalCount, setMrpTotalCount] = useState(0);

  // ── data loading ──────────────────────────────────────────────────
  // 核心逻辑：MRP 记录为主表（含已关闭），每条 MRP 通过 srcbillnumber 关联 PR/PO
  // 降级仅在预测单号匹配不到任何 MRP 时触发
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { productCode, relatedForecastBillnos } = step1Data;

      // Step 1: 加载 MRP（精确关联预测单号）
      const mrpResult = await planningV2DataService.loadMRPByBillnos(relatedForecastBillnos, productCode);

      // 使用 allMrpRecords（过滤前全部记录，含已关闭），步骤②需要展示全部
      const allMrpRecords = mrpResult.allMrpRecords ?? mrpResult.data;
      const allMrpBillnos = mrpResult.allMrpBillnos ?? allMrpRecords.map(r => r.billno).filter(Boolean);
      console.log(`[MRP Panel] MRP: 全部 ${allMrpRecords.length} 条, 过滤后 ${mrpResult.data.length} 条 (降级=${mrpResult.isDegraded})`);
      setMrpTotalCount(allMrpRecords.length);

      // Step 2: 批量查 PR（srcbillnumber in [全部 MRP billno]）
      let prRecords: PRRecord[] = [];
      if (allMrpBillnos.length > 0) {
        const prResult = await planningV2DataService.loadPRByMRPBillnos(allMrpBillnos, [], '');
        prRecords = prResult.data;
      }
      console.log(`[MRP Panel] PR: ${prRecords.length} 条`);

      // Step 3: 批量查 PO（srcbillnumber in [PR billno]）
      let poRecords: PORecord[] = [];
      const prBillnos = [...new Set(prRecords.map(pr => pr.billno).filter(Boolean))];
      if (prBillnos.length > 0) {
        const poResult = await planningV2DataService.loadPOByPRBillnos(prBillnos, [], '');
        poRecords = poResult.data;
      }
      console.log(`[MRP Panel] PO: ${poRecords.length} 条`);

      // Step 4: 构建 MRP billno → PR 映射（通过 PR.srcbillnumber = MRP.billno）
      const prByMrpBillno = new Map<string, PRRecord[]>();
      prRecords.forEach(pr => {
        const k = pr.srcbillnumber;
        if (k) {
          if (!prByMrpBillno.has(k)) prByMrpBillno.set(k, []);
          prByMrpBillno.get(k)!.push(pr);
        }
      });
      // PO: srcbillnumber = PR.billno
      const poByPrBillno = new Map<string, PORecord[]>();
      poRecords.forEach(po => {
        const k = po.srcbillnumber;
        if (k) {
          if (!poByPrBillno.has(k)) poByPrBillno.set(k, []);
          poByPrBillno.get(k)!.push(po);
        }
      });

      // Step 5: 以全部 MRP 记录为主表构建展示行
      const displayRows: MRPDisplayRow[] = allMrpRecords.map((m: MRPPlanOrderAPI) => {
        const code = m.materialplanid_number;
        const qty = planningV2DataService.getMRPDemandQty(m);
        const prs = prByMrpBillno.get(m.billno) ?? [];
        const prBillnoSet = new Set(prs.map(pr => pr.billno).filter(Boolean));
        const pos = poRecords.filter(po => prBillnoSet.has(po.srcbillnumber));
        return {
          mrpBillno: m.billno,
          materialCode: code,
          materialName: m.materialplanid_name || code,
          materialType: m.materialattr_title || '',
          netDemand: qty,
          closeStatus: m.closestatus_title || '',
          hasPR: prs.length > 0,
          hasPO: pos.length > 0,
          prRecords: prs,
          poRecords: pos,
        };
      });
      setRows(displayRows);
    } catch (err) {
      console.error('[MRP Panel] 加载失败:', err);
      setError('数据加载失败，请检查网络后重试');
    } finally {
      setLoading(false);
    }
  }, [step1Data]);

  useEffect(() => { if (active) loadData(); }, [active, loadData]);
  useEffect(() => {
    const h = () => setTooltip(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  // ── filtering ─────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let r = rows;
    if (closeStatusFilter === 'normal') r = r.filter(x => x.closeStatus === '正常' || x.closeStatus === 'A');
    if (closeStatusFilter === 'closed') r = r.filter(x => x.closeStatus !== '正常' && x.closeStatus !== 'A');
    return r;
  }, [rows, closeStatusFilter]);

  useEffect(() => { setCurrentPage(1); }, [closeStatusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stats = useMemo(() => {
    const normal = rows.filter(r => r.closeStatus === '正常' || r.closeStatus === 'A').length;
    const withPR = rows.filter(r => r.hasPR).length;
    const withPO = rows.filter(r => r.hasPO).length;
    return { total: rows.length, normal, closed: rows.length - normal, withPR, withPO };
  }, [rows]);

  // ── helpers ───────────────────────────────────────────────────────
  const isExternal = (t: string) => t.includes('外购') || t.includes('委外');

  const showTip = (e: React.MouseEvent<HTMLTableCellElement>, type: 'pr' | 'po', recs: PRRecord[] | PORecord[]) => {
    e.stopPropagation();
    if (recs.length === 0) return;
    setTooltip({ type, records: recs, rect: e.currentTarget.getBoundingClientRect() });
  };

  if (!active) return null;

  // ── sub-components ────────────────────────────────────────────────
  const SkeletonRows = () => (
    <>{Array.from({ length: 6 }).map((_, i) => (
      <tr key={i} className="border-b border-slate-100 animate-pulse">
        {Array.from({ length: 8 }).map((__, j) => (
          <td key={j} className="py-3 px-3"><div className="h-4 bg-slate-200 rounded w-3/4" /></td>
        ))}
      </tr>
    ))}</>
  );

  const TooltipCard = () => {
    if (!tooltip) return null;
    const { type, records, rect } = tooltip;
    const tRect = tableRef.current?.getBoundingClientRect();
    if (!tRect) return null;
    const top = rect.bottom - tRect.top + 4;
    const left = Math.max(0, Math.min(rect.left - tRect.left, tRect.width - 340));
    const style = { top, left };

    if (type === 'pr') {
      return (
        <div className="absolute z-50 bg-white rounded-lg shadow-lg border p-3 w-80 text-xs" style={style} onClick={e => e.stopPropagation()}>
          <div className="font-semibold text-slate-700 mb-2">PR 采购申请 ({records.length})</div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(records as PRRecord[]).map((pr, i) => (
              <div key={i} className="border-b border-slate-100 pb-2 last:border-0">
                <TipRow label="单号" value={pr.billno} />
                <TipRow label="数量" value={pr.qty} />
                <TipRow label="业务日期" value={pr.biztime?.slice(0, 10)} />
                <TipRow label="审核日期" value={pr.auditdate?.slice(0, 10)} />
                <TipRow label="组织" value={pr.org_name} />
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="absolute z-50 bg-white rounded-lg shadow-lg border p-3 w-80 text-xs" style={style} onClick={e => e.stopPropagation()}>
        <div className="font-semibold text-slate-700 mb-2">PO 采购订单 ({records.length})</div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {(records as PORecord[]).map((po, i) => (
            <div key={i} className="border-b border-slate-100 pb-2 last:border-0">
              <TipRow label="单号" value={po.billno} />
              <TipRow label="数量" value={po.qty} />
              <TipRow label="业务日期" value={po.biztime?.slice(0, 10)} />
              <TipRow label="交货日期" value={po.deliverdate?.slice(0, 10)} />
              <TipRow label="供应商" value={po.supplier_name} />
              <TipRow label="经办人" value={po.operatorname} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  /** PR/PO status cell content */
  const StatusIcon = ({ ext, has, label }: { ext: boolean; has: boolean; label: string }) => {
    if (!ext) return <span className="text-slate-300"><Minus className="w-4 h-4 mx-auto" /></span>;
    return has
      ? <span className="inline-flex items-center gap-0.5 text-green-600"><Check className="w-4 h-4" /><span className="text-xs">已{label}</span></span>
      : <span className="inline-flex items-center gap-0.5 text-red-500"><X className="w-4 h-4" /><span className="text-xs">未{label}</span></span>;
  };

  // ── render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800">步骤② 物料需求计划（MRP）</h2>
        <p className="text-sm text-slate-500 mt-1">
          产品: <span className="font-medium text-slate-700">{step1Data.productCode}</span>{' '}
          <span className="text-slate-700">{step1Data.productName}</span>
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={loadData} className="text-sm text-red-600 underline mt-1">点击重试</button>
          </div>
        </div>
      )}

      {/* Filters + Legend */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600">MRP状态:</span>
            <select
              value={closeStatusFilter}
              onChange={e => setCloseStatusFilter(e.target.value as CloseStatusFilter)}
              className="border border-slate-300 rounded px-2 py-1 text-sm bg-white"
            >
              <option value="all">全部</option>
              <option value="normal">正常</option>
              <option value="closed">已关闭</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />正常 ({stats.normal})</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-400" />已关闭 ({stats.closed})</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />已PR ({stats.withPR})</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500" />已PO ({stats.withPO})</span>
          <span className="text-slate-400">共 {filteredRows.length} / {stats.total} 条MRP</span>
        </div>
      </div>

      {/* Table */}
      <div ref={tableRef} className="bg-white border border-slate-200 rounded-lg overflow-hidden relative">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-slate-600">
                <th className="py-3 px-3 font-medium w-44">MRP单号</th>
                <th className="py-3 px-3 font-medium">物料编码</th>
                <th className="py-3 px-3 font-medium">物料名称</th>
                <th className="py-3 px-3 font-medium text-right w-24">需求量</th>
                <th className="py-3 px-3 font-medium text-center w-20">MRP状态</th>
                <th className="py-3 px-3 font-medium text-center w-20">PR</th>
                <th className="py-3 px-3 font-medium text-center w-20">PO</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <SkeletonRows /> : filteredRows.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-slate-400">暂无符合条件的MRP数据</td></tr>
              ) : pagedRows.map(row => {
                const isClosed = row.closeStatus !== '正常' && row.closeStatus !== 'A';
                const ext = isExternal(row.materialType);
                return (
                  <tr key={row.mrpBillno} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${isClosed ? 'bg-slate-50 text-slate-400' : ''}`}>
                    <td className="py-2.5 px-3 font-mono text-xs">{row.mrpBillno}</td>
                    <td className="py-2.5 px-3 font-mono text-xs">{row.materialCode}</td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {row.materialName}
                      {row.materialType && <span className="ml-2 text-xs text-slate-400">({row.materialType})</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium">
                      {row.netDemand.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {isClosed
                        ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-slate-200 text-slate-500">{row.closeStatus}</span>
                        : <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">{row.closeStatus}</span>
                      }
                    </td>
                    <td className="py-2.5 px-3 text-center cursor-pointer"
                      onMouseEnter={e => ext && showTip(e, 'pr', row.prRecords)} onMouseLeave={() => setTooltip(null)}>
                      <StatusIcon ext={ext} has={row.hasPR} label="PR" />
                    </td>
                    <td className="py-2.5 px-3 text-center cursor-pointer"
                      onMouseEnter={e => ext && showTip(e, 'po', row.poRecords)} onMouseLeave={() => setTooltip(null)}>
                      <StatusIcon ext={ext} has={row.hasPO} label="PO" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <TooltipCard />
        {loading && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">加载物料需求数据...</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar: back | pagination | next */}
      <div className="flex items-center justify-between pt-2 gap-4">
        {/* Left: back */}
        <button onClick={onBack}
          className="px-5 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1 flex-shrink-0">
          <ChevronLeft className="w-4 h-4" />上一步
        </button>

        {/* Center: pagination */}
        {!loading && filteredRows.length > PAGE_SIZE && (
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(1)} disabled={safePage === 1}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 text-sm text-slate-600 select-none">
              第 <span className="font-medium text-slate-800">{safePage}</span> / <span className="font-medium text-slate-800">{totalPages}</span> 页
              <span className="text-slate-400 ml-2">({filteredRows.length} 条)</span>
            </span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        )}
        {(loading || filteredRows.length <= PAGE_SIZE) && <div className="flex-1" />}

        {/* Right: next */}
        <button onClick={onConfirm} disabled={loading || !!error}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
          确认，进入下一步<ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default MaterialRequirementPanel;
