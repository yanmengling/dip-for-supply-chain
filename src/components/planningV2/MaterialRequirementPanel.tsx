/**
 * 步骤② 物料需求计划(MRP) - MRP记录为主表 + PR/PO状态跟踪
 * 精确关联：预测单号 → MRP → PR → PO
 * 降级仅在预测单号匹配不到任何 MRP 时触发（回退到 BOM 物料维度）
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, AlertCircle, Check, X, Minus, Filter, Search, Layers } from 'lucide-react';
import { planningV2DataService } from '../../services/planningV2DataService';
import type { MRPPlanOrderAPI } from '../../services/planningV2DataService';
import type { Step1Data, MRPDisplayRow, PRRecord, PORecord, BOMRecord, AltPartInfo } from '../../types/planningV2';

interface MaterialRequirementPanelProps {
  active: boolean;
  step1Data: Step1Data;
  onConfirm: () => void;
  onBack: () => void;
}

type DropStatusFilter = 'all' | 'dropped' | 'not_dropped';
type MaterialTypeFilter = 'all' | '自制' | '委外' | '外购';

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
  const [dropStatusFilter, setDropStatusFilter] = useState<DropStatusFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [materialTypeFilter, setMaterialTypeFilter] = useState<MaterialTypeFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [tooltip, setTooltip] = useState<{
    type: 'pr' | 'po' | 'alt'; records: PRRecord[] | PORecord[] | AltPartInfo[]; rect: DOMRect;
  } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [mrpTotalCount, setMrpTotalCount] = useState(0);
  const [showBom, setShowBom] = useState(false);
  const [bomLoading, setBomLoading] = useState(false);
  const [bomLoaded, setBomLoaded] = useState(false);

  // ── data loading ──────────────────────────────────────────────────
  // 核心逻辑：MRP 记录为主表（含已关闭），每条 MRP 通过 srcbillnumber 关联 PR/PO
  // 降级仅在预测单号匹配不到任何 MRP 时触发
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBomLoaded(false);
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

      // Step 5: 加载物料主数据（获取标准交期）
      const allMaterialCodes = [...new Set(allMrpRecords.map(m => m.materialplanid_number).filter(Boolean))];
      let leadtimeMap = new Map<string, number>();
      try {
        const materials = await planningV2DataService.loadMaterialsByCode(allMaterialCodes);
        materials.forEach(mat => {
          const lt = parseFloat(mat.purchase_fixedleadtime) || parseFloat(mat.product_fixedleadtime) || 0;
          if (lt > 0) leadtimeMap.set(mat.material_code, lt);
        });
        console.log(`[MRP Panel] 物料主数据: ${materials.length} 条, 交期映射 ${leadtimeMap.size} 个`);
      } catch (matErr) {
        console.warn('[MRP Panel] 物料主数据加载失败，交期列将显示为空:', matErr);
      }

      // Step 6: 以全部 MRP 记录为主表构建展示行（BOM 信息延迟加载）
      const displayRows: MRPDisplayRow[] = allMrpRecords.map((m: MRPPlanOrderAPI) => {
        const code = m.materialplanid_number;
        const orderQty = planningV2DataService.getMRPDemandQty(m);
        const prs = prByMrpBillno.get(m.billno) ?? [];
        const prBillnoSet = new Set(prs.map(pr => pr.billno).filter(Boolean));
        const pos = poRecords.filter(po => prBillnoSet.has(po.srcbillnumber));
        return {
          mrpBillno: m.billno,
          materialCode: code,
          materialName: m.materialplanid_name || code,
          materialType: m.materialattr_title || '',
          orderQty,
          dropQty: m.bizdropqty || 0,
          dropStatus: m.dropstatus_title || '',
          dropTime: m.droptime || '',
          dropBillType: m.dropbilltype_name || '',
          bomLevel: null,
          bomUsage: null,
          altParts: [],
          leadtime: leadtimeMap.get(code) ?? null,
          createTime: m.createtime || '',
          availableDate: m.availabledate || '',
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

  // ── BOM 延迟加载（用户点击"显示BOM"时触发）────────────────────
  const loadBomData = useCallback(async () => {
    console.log(`[MRP Panel] loadBomData called: bomLoaded=${bomLoaded}, bomLoading=${bomLoading}, rows.length=${rows.length}`);
    if (bomLoaded || bomLoading || rows.length === 0) return;
    setBomLoading(true);
    try {
      // 1. 加载主料 BOM（alt_priority=0）
      const mainBom = await planningV2DataService.loadBOMByProduct(step1Data.productCode);
      const bomUsageMap = new Map<string, number>();
      const bomLevelMap = new Map<string, number>();
      mainBom.forEach(bom => {
        bomUsageMap.set(bom.material_code, bom.standard_usage);
        bomLevelMap.set(bom.material_code, bom.bom_level);
      });
      console.log(`[MRP Panel] BOM 主料: ${mainBom.length} 条`);

      // 2. 加载全部 BOM 记录（含替代料），构建替代关系
      const allBomWithSubs = await planningV2DataService.loadBOMSubstitutes(step1Data.productCode);
      const altPartMap = new Map<string, string[]>();
      let subsNameMap = new Map<string, string>();

      const groupMap = new Map<string, BOMRecord[]>();
      allBomWithSubs.forEach(bom => {
        if (bom.alt_method === '替代' && bom.alt_group_no) {
          const list = groupMap.get(bom.alt_group_no) ?? [];
          list.push(bom);
          groupMap.set(bom.alt_group_no, list);
        }
      });
      groupMap.forEach(members => {
        const mains = members.filter(m => (m.alt_priority ?? 0) === 0);
        const subs = members.filter(m => (m.alt_priority ?? 0) > 0);
        if (mains.length > 0 && subs.length > 0) {
          mains.forEach(main => {
            const subCodes = subs.map(s => s.material_code);
            const existing = altPartMap.get(main.material_code) ?? [];
            subCodes.forEach(sc => { if (!existing.includes(sc)) existing.push(sc); });
            altPartMap.set(main.material_code, existing);
          });
          subs.forEach(s => { subsNameMap.set(s.material_code, s.material_name); });
        }
      });
      console.log(`[MRP Panel] BOM: 用量映射 ${bomUsageMap.size}, 替代料组 ${groupMap.size}, 有替代料的主料 ${altPartMap.size} 个`);

      // 3. 加载替代料库存
      const subsCodes = [...new Set([...altPartMap.values()].flat())];
      let subsInventoryMap = new Map<string, number>();
      if (subsCodes.length > 0) {
        try {
          const [subsInventory, subsMaterials] = await Promise.all([
            planningV2DataService.loadInventoryByMaterials(subsCodes),
            planningV2DataService.loadMaterialsByCode(subsCodes),
          ]);
          subsInventory.forEach(inv => {
            subsInventoryMap.set(inv.material_code, (subsInventoryMap.get(inv.material_code) ?? 0) + inv.available_inventory_qty);
          });
          subsMaterials.forEach(mat => { subsNameMap.set(mat.material_code, mat.material_name); });
          console.log(`[MRP Panel] 替代料: ${subsCodes.length} 个编码, 库存 ${subsInventoryMap.size} 条`);
        } catch (subsErr) {
          console.warn('[MRP Panel] 替代料数据加载失败:', subsErr);
        }
      }

      // 4. 更新 rows，填充 BOM 字段
      console.log(`[MRP Panel] BOM 匹配前: bomLevelMap keys 前10:`, [...bomLevelMap.keys()].slice(0, 10));
      setRows(prev => {
        let matchCount = 0;
        const updated = prev.map(row => {
          const code = row.materialCode;
          const subCodes = altPartMap.get(code) ?? [];
          const altParts: AltPartInfo[] = subCodes.map(sc => ({
            materialCode: sc,
            materialName: subsNameMap.get(sc) || sc,
            inventoryQty: subsInventoryMap.get(sc) ?? 0,
          }));
          const level = bomLevelMap.get(code) ?? null;
          const usage = bomUsageMap.get(code) ?? null;
          if (level !== null || usage !== null || altParts.length > 0) matchCount++;
          return { ...row, bomLevel: level, bomUsage: usage, altParts };
        });
        console.log(`[MRP Panel] BOM 更新: ${prev.length} 行, 匹配 ${matchCount} 行`);
        if (matchCount === 0 && prev.length > 0) {
          console.log(`[MRP Panel] BOM 匹配为0! rows 前3个 materialCode:`, prev.slice(0, 3).map(r => r.materialCode));
        }
        return updated;
      });
      setBomLoaded(true);
    } catch (err) {
      console.error('[MRP Panel] BOM 加载失败:', err);
    } finally {
      setBomLoading(false);
    }
  }, [bomLoaded, bomLoading, rows.length, step1Data.productCode]);

  // 切换 showBom 时自动加载
  useEffect(() => {
    if (showBom && !bomLoaded && !bomLoading) loadBomData();
  }, [showBom, bomLoaded, bomLoading, loadBomData]);

  useEffect(() => {
    const h = () => setTooltip(null);
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  // ── filtering ─────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    let r = rows;
    if (dropStatusFilter === 'dropped') r = r.filter(x => x.dropStatus === '已投放');
    if (dropStatusFilter === 'not_dropped') r = r.filter(x => x.dropStatus !== '已投放');
    if (materialTypeFilter !== 'all') r = r.filter(x => x.materialType.includes(materialTypeFilter));
    if (searchText.trim()) {
      const kw = searchText.trim().toLowerCase();
      r = r.filter(x => x.materialCode.toLowerCase().includes(kw) || x.materialName.toLowerCase().includes(kw));
    }
    return r;
  }, [rows, dropStatusFilter, materialTypeFilter, searchText]);

  useEffect(() => { setCurrentPage(1); }, [dropStatusFilter, materialTypeFilter, searchText]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRows = filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const stats = useMemo(() => {
    const dropped = rows.filter(r => r.dropStatus === '已投放').length;
    const withPR = rows.filter(r => r.hasPR).length;
    const withPO = rows.filter(r => r.hasPO).length;
    return { total: rows.length, dropped, notDropped: rows.length - dropped, withPR, withPO };
  }, [rows]);

  // ── helpers ───────────────────────────────────────────────────────
  const isExternal = (t: string) => t.includes('外购') || t.includes('委外');

  const showTip = (e: React.MouseEvent<HTMLTableCellElement>, type: 'pr' | 'po' | 'alt', recs: PRRecord[] | PORecord[] | AltPartInfo[]) => {
    e.stopPropagation();
    if (recs.length === 0) return;
    setTooltip({ type, records: recs, rect: e.currentTarget.getBoundingClientRect() });
  };

  if (!active) return null;

  // ── sub-components ────────────────────────────────────────────────
  const colCount = showBom ? 15 : 12;
  const SkeletonRows = () => (
    <>{Array.from({ length: 6 }).map((_, i) => (
      <tr key={i} className="border-b border-slate-100 animate-pulse">
        {Array.from({ length: colCount }).map((__, j) => (
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

    if (type === 'alt') {
      return (
        <div className="absolute z-50 bg-white rounded-lg shadow-lg border p-3 w-80 text-xs" style={style} onClick={e => e.stopPropagation()}>
          <div className="font-semibold text-slate-700 mb-2">备料（替代料）({records.length})</div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(records as AltPartInfo[]).map((alt, i) => (
              <div key={i} className="border-b border-slate-100 pb-2 last:border-0">
                <TipRow label="物料编码" value={alt.materialCode} />
                <TipRow label="物料名称" value={alt.materialName} />
                <TipRow label="库存数量" value={alt.inventoryQty.toLocaleString()} />
              </div>
            ))}
          </div>
        </div>
      );
    }

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

      {/* No MRP records prompt */}
      {!loading && !error && rows.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">当前预测单暂无 MRP 记录</p>
            <p className="text-xs text-amber-600 mt-1">
              预测单 {step1Data.relatedForecastBillnos.join('、')} 尚未执行 MRP 运算，请先在 ERP 系统中对该预测单进行 MRP 计算后再查看。
            </p>
          </div>
        </div>
      )}

      {/* Filters + Legend */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="搜索物料编码/名称"
              className="border border-slate-300 rounded px-2 py-1 text-sm bg-white w-48"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-slate-600">物料分类:</span>
            <select
              value={materialTypeFilter}
              onChange={e => setMaterialTypeFilter(e.target.value as MaterialTypeFilter)}
              className="border border-slate-300 rounded px-2 py-1 text-sm bg-white"
            >
              <option value="all">全部</option>
              <option value="自制">自制</option>
              <option value="委外">委外</option>
              <option value="外购">外购</option>
            </select>
          </div>
          <button
            onClick={() => setShowBom(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-sm border transition-colors ${showBom ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
          >
            <Layers className="w-4 h-4" />
            BOM
            {bomLoading && <Loader2 className="w-3 h-3 animate-spin" />}
          </button>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">投放状态:</span>
            <select
              value={dropStatusFilter}
              onChange={e => setDropStatusFilter(e.target.value as DropStatusFilter)}
              className="border border-slate-300 rounded px-2 py-1 text-sm bg-white"
            >
              <option value="all">全部</option>
              <option value="dropped">已投放</option>
              <option value="not_dropped">未投放</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />已投放 ({stats.dropped})</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-400" />未投放 ({stats.notDropped})</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />已PR ({stats.withPR})</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500" />已PO ({stats.withPO})</span>
          <span className="text-slate-400">共 {filteredRows.length} / {stats.total} 条MRP</span>
        </div>
      </div>

      {/* Table */}
      <div ref={tableRef} className="bg-white border border-slate-200 rounded-lg overflow-hidden relative">
        <div className="overflow-x-auto">
          <table className={`w-full text-sm ${showBom ? 'min-w-[1500px]' : 'min-w-[1100px]'}`}>
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-left text-slate-600 whitespace-nowrap">
                {/* ── MRP 数据 ── */}
                <th className="py-3 px-3 font-medium w-44">MRP单号</th>
                <th className="py-3 px-3 font-medium">物料</th>
                <th className="py-3 px-3 font-medium text-right w-20">订单数量</th>
                <th className="py-3 px-3 font-medium text-right w-20">投放数量</th>
                <th className="py-3 px-3 font-medium text-center w-20">投放状态</th>
                <th className="py-3 px-3 font-medium text-center w-24">投放单据类型</th>
                <th className="py-3 px-3 font-medium text-center w-24">投放时间</th>
                <th className="py-3 px-3 font-medium text-right w-16">交期(天)</th>
                <th className="py-3 px-3 font-medium text-center w-24">创建时间</th>
                <th className="py-3 px-3 font-medium text-center w-24">可用日期</th>
                {/* ── PR/PO 状态 ── */}
                <th className="py-3 px-3 font-medium text-center w-16">PR</th>
                <th className="py-3 px-3 font-medium text-center w-16">PO</th>
                {/* ── BOM（可选） ── */}
                {showBom && <th className="py-3 px-3 font-medium text-center w-16">BOM层级</th>}
                {showBom && <th className="py-3 px-3 font-medium text-right w-16">BOM用量</th>}
                {showBom && <th className="py-3 px-3 font-medium text-center w-16">替代料</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? <SkeletonRows /> : filteredRows.length === 0 ? (
                <tr><td colSpan={colCount} className="py-12 text-center text-slate-400">暂无符合条件的MRP数据</td></tr>
              ) : pagedRows.map(row => {
                const isDropped = row.dropStatus === '已投放';
                const ext = isExternal(row.materialType);
                const hasAlt = row.altParts.length > 0;
                return (
                  <tr key={row.mrpBillno} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors whitespace-nowrap ${isDropped ? '' : 'bg-slate-50/50'}`}>
                    {/* ── MRP 数据 ── */}
                    <td className="py-2.5 px-3 font-mono text-xs">{row.mrpBillno}</td>
                    <td className="py-2.5 px-3">
                      <div className="text-slate-700 text-sm">{row.materialName}</div>
                      <div className="text-slate-400 text-xs font-mono">
                        {row.materialCode}
                        {row.materialType && <span className="ml-1.5">({row.materialType})</span>}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium">
                      {row.orderQty.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium">
                      {row.dropQty > 0 ? row.dropQty.toLocaleString() : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {isDropped
                        ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">{row.dropStatus}</span>
                        : <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-slate-200 text-slate-500">{row.dropStatus || '未投放'}</span>
                      }
                    </td>
                    <td className="py-2.5 px-3 text-center text-xs text-slate-600">
                      {row.dropBillType || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center text-xs text-slate-600">
                      {row.dropTime?.slice(0, 10) || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right text-xs">
                      {row.leadtime != null ? row.leadtime : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center text-xs text-slate-600">
                      {row.createTime?.slice(0, 10) || '-'}
                    </td>
                    <td className="py-2.5 px-3 text-center text-xs text-slate-600">
                      {row.availableDate?.slice(0, 10) || '-'}
                    </td>
                    {/* ── PR/PO 状态 ── */}
                    <td className="py-2.5 px-3 text-center cursor-pointer"
                      onMouseEnter={e => ext && showTip(e, 'pr', row.prRecords)} onMouseLeave={() => setTooltip(null)}>
                      <StatusIcon ext={ext} has={row.hasPR} label="PR" />
                    </td>
                    <td className="py-2.5 px-3 text-center cursor-pointer"
                      onMouseEnter={e => ext && showTip(e, 'po', row.poRecords)} onMouseLeave={() => setTooltip(null)}>
                      <StatusIcon ext={ext} has={row.hasPO} label="PO" />
                    </td>
                    {/* ── BOM（可选） ── */}
                    {showBom && (
                      <td className="py-2.5 px-3 text-center text-xs">
                        {row.bomLevel != null ? row.bomLevel : '-'}
                      </td>
                    )}
                    {showBom && (
                      <td className="py-2.5 px-3 text-right text-xs">
                        {row.bomUsage != null ? row.bomUsage : '-'}
                      </td>
                    )}
                    {showBom && (
                      <td className="py-2.5 px-3 text-center cursor-pointer"
                        onMouseEnter={e => hasAlt && showTip(e, 'alt', row.altParts)} onMouseLeave={() => setTooltip(null)}>
                        {hasAlt
                          ? <span className="inline-flex items-center gap-0.5 text-amber-600"><Check className="w-4 h-4" /><span className="text-xs">{row.altParts.length}项</span></span>
                          : <span className="text-slate-300"><Minus className="w-4 h-4 mx-auto" /></span>
                        }
                      </td>
                    )}
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
