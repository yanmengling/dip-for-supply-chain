/**
 * 步骤③ 物料需求计划(MRP) - BOM级物料需求 + PR/PO状态跟踪
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, AlertCircle, Check, X, Minus, Filter } from 'lucide-react';
import { planningV2DataService } from '../../services/planningV2DataService';
import type { Step1Data, MRPDisplayRow, PRRecord, PORecord } from '../../types/planningV2';

interface MaterialRequirementPanelProps {
  active: boolean;
  step1Data: Step1Data;
  onConfirm: () => void;
  onBack: () => void;
}

type BomLevelFilter = 'all' | 1 | 2 | 3;

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
  const [bomLevelFilter, setBomLevelFilter] = useState<BomLevelFilter>('all');
  const [shortageOnly, setShortageOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [tooltip, setTooltip] = useState<{
    type: 'pr' | 'po'; records: PRRecord[] | PORecord[]; rect: DOMRect;
  } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // ── data loading ──────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { productCode } = step1Data;
      const [mrpData, bomData] = await Promise.all([
        planningV2DataService.getMRPByProduct(productCode),
        planningV2DataService.loadBOMByProduct(productCode),
      ]);

      const codeSet = new Set<string>();
      mrpData.forEach(m => codeSet.add(m.main_material));
      bomData.forEach(b => codeSet.add(b.material_code));
      const codes = Array.from(codeSet);
      console.log(`[MRP Panel] 产品 ${productCode}: MRP ${mrpData.length} 条, BOM ${bomData.length} 条, 去重物料 ${codes.length} 个`);

      const [materials, prRecords, poRecords] = await Promise.all([
        planningV2DataService.loadMaterialsByCode(codes),
        planningV2DataService.loadPRByMaterials(codes),
        planningV2DataService.loadPOByMaterials(codes),
      ]);

      const materialMap = new Map(materials.map(m => [m.material_code, m]));
      const group = <T extends { material_number: string }>(arr: T[]) => {
        const map = new Map<string, T[]>();
        arr.forEach(r => { const k = r.material_number; if (!map.has(k)) map.set(k, []); map.get(k)!.push(r); });
        return map;
      };
      const prByMat = group(prRecords);
      const poByMat = group(poRecords);

      const mrpMap = new Map<string, { demand: number; name: string }>();
      mrpData.forEach(m => mrpMap.set(m.main_material, { demand: m.material_demand_quantity, name: m.component_name }));

      const bomLevelMap = new Map<string, number>();
      bomData.forEach(b => bomLevelMap.set(b.material_code, b.bom_level));

      const displayRows: MRPDisplayRow[] = codes.map(code => {
        const mat = materialMap.get(code);
        const mrp = mrpMap.get(code);
        const prs = prByMat.get(code) ?? [];
        const pos = poByMat.get(code) ?? [];
        return {
          materialCode: code,
          materialName: mrp?.name || mat?.material_name || code,
          bomLevel: bomLevelMap.get(code) ?? 0,
          materialType: mat?.materialattr ?? '',
          netDemand: mrp?.demand ?? 0,
          hasPR: prs.length > 0, hasPO: pos.length > 0,
          prRecords: prs, poRecords: pos,
        };
      });

      displayRows.sort((a, b) => {
        if ((a.netDemand < 0) !== (b.netDemand < 0)) return a.netDemand < 0 ? -1 : 1;
        return a.bomLevel - b.bomLevel;
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
    if (bomLevelFilter !== 'all') r = r.filter(x => x.bomLevel === bomLevelFilter);
    if (shortageOnly) r = r.filter(x => x.netDemand < 0);
    return r;
  }, [rows, bomLevelFilter, shortageOnly]);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [bomLevelFilter, shortageOnly]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stats = useMemo(() => {
    const s = rows.filter(r => r.netDemand < 0).length;
    return { total: rows.length, shortage: s, sufficient: rows.length - s };
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
        {Array.from({ length: 6 }).map((__, j) => (
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
        <h2 className="text-lg font-semibold text-slate-800">步骤③ 物料需求计划（MRP）</h2>
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
            <span className="text-slate-600">BOM层级:</span>
            <select
              value={bomLevelFilter}
              onChange={e => setBomLevelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value) as 1 | 2 | 3)}
              className="border border-slate-300 rounded px-2 py-1 text-sm bg-white"
            >
              <option value="all">全部层级</option>
              <option value={1}>L1</option>
              <option value={2}>L2</option>
              <option value={3}>L3</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={shortageOnly} onChange={e => setShortageOnly(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            仅显示缺口
          </label>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />满足 ({stats.sufficient})</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />缺口 ({stats.shortage})</span>
          <span className="text-slate-400">共 {filteredRows.length} / {stats.total} 条</span>
        </div>
      </div>

      {/* Table */}
      <div ref={tableRef} className="bg-white border border-slate-200 rounded-lg overflow-hidden relative">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-slate-600">
                <th className="py-3 px-3 font-medium w-16">层级</th>
                <th className="py-3 px-3 font-medium">物料编码</th>
                <th className="py-3 px-3 font-medium">物料名称</th>
                <th className="py-3 px-3 font-medium text-right w-28">净需求</th>
                <th className="py-3 px-3 font-medium text-center w-20">PR</th>
                <th className="py-3 px-3 font-medium text-center w-20">PO</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <SkeletonRows /> : filteredRows.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-slate-400">暂无符合条件的物料数据</td></tr>
              ) : pagedRows.map(row => {
                const short = row.netDemand < 0;
                const ext = isExternal(row.materialType);
                return (
                  <tr key={row.materialCode} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${short ? 'bg-red-50' : ''}`}>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex items-center justify-center w-7 h-5 rounded bg-slate-100 text-xs font-medium text-slate-600">L{row.bomLevel}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-800 text-xs">{row.materialCode}</td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {row.materialName}
                      {row.materialType && <span className="ml-2 text-xs text-slate-400">({row.materialType})</span>}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-medium ${short ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                      <span className="inline-flex items-center gap-1 justify-end">
                        {short ? <AlertCircle className="w-3.5 h-3.5 text-red-500" /> : <Check className="w-3.5 h-3.5 text-green-500" />}
                        {row.netDemand.toLocaleString()}
                      </span>
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
        {/* Spacer when pagination not shown, to keep next button on the right */}
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
