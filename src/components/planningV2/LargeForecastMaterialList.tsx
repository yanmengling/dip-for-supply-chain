import React, { useEffect, useMemo, useState } from 'react';
import type { MRPPlanOrderAPI } from '../../services/planningV2DataService';
import type { PRRecord, PORecord } from '../../types/planningV2';

export interface LargeForecastMaterialListProps {
  mrpRecords: MRPPlanOrderAPI[];
  prRecords: PRRecord[];
  poRecords: PORecord[];
  materialLeadtimeMap: Map<string, { purchaseLeadtime: number; productLeadtime: number }>;
  forecastDeadline: string; // YYYY-MM-DD, min startdate of all forecast products
  isLoading: boolean;
}

type RiskLevel = 'red' | 'yellow' | null;

interface MrpRow {
  materialCode: string;
  materialName: string;
  materialType: string;
  isFirstRowForMaterial: boolean;
  mrpBillno: string;
  mrpDemandQty: number;
  mrpDropQty: number;
  mrpDropStatus: string;
  prQty: number;
  poQty: number;
  poDeliverDate: string | null;  // max po.deliverdate — 承诺交期时间
  poOrderDate: string | null;    // min po.biztime — PO交期时间
  standardLeadtime: number | null; // days — 标准交期时长
  riskLevel: RiskLevel;
  riskReason: string | null;
}

const PAGE_SIZE = 20;
const DAY = 24 * 60 * 60 * 1000;

function fmtQty(v: number | null | undefined): string {
  if (v == null || v === 0) return '—';
  return v.toLocaleString();
}

const LargeForecastMaterialList: React.FC<LargeForecastMaterialListProps> = ({
  mrpRecords,
  prRecords,
  poRecords,
  materialLeadtimeMap,
  forecastDeadline,
  isLoading,
}) => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | '外购' | '委外' | '自制'>('all');
  const [filterRisk, setFilterRisk] = useState<'all' | 'risk'>('all');
  const [page, setPage] = useState(1);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMs = useMemo(() => new Date(todayStr).getTime(), [todayStr]);

  useEffect(() => {
    setPage(1);
  }, [mrpRecords]);

  const rows = useMemo<MrpRow[]>(() => {
    const deadlineMs = new Date(forecastDeadline).getTime();

    // Build lookup maps
    // prByMrpBillno: mrpBillno -> PRRecord[]
    const prByMrpBillno = new Map<string, PRRecord[]>();
    for (const pr of prRecords) {
      if (!prByMrpBillno.has(pr.srcbillnumber)) {
        prByMrpBillno.set(pr.srcbillnumber, []);
      }
      prByMrpBillno.get(pr.srcbillnumber)!.push(pr);
    }

    // poByPrBillno: prBillno -> PORecord[]
    const poByPrBillno = new Map<string, PORecord[]>();
    for (const po of poRecords) {
      if (!poByPrBillno.has(po.srcbillnumber)) {
        poByPrBillno.set(po.srcbillnumber, []);
      }
      poByPrBillno.get(po.srcbillnumber)!.push(po);
    }

    // Group MRP records by materialplanid_number preserving insertion order
    const materialGroups = new Map<string, MRPPlanOrderAPI[]>();
    for (const mrp of mrpRecords) {
      const key = mrp.materialplanid_number;
      if (!materialGroups.has(key)) {
        materialGroups.set(key, []);
      }
      materialGroups.get(key)!.push(mrp);
    }

    const result: MrpRow[] = [];

    for (const [materialCode, mrpList] of materialGroups) {
      let isFirst = true;
      for (const mrp of mrpList) {
        // PR aggregation
        const prsForMrp = prByMrpBillno.get(mrp.billno) ?? [];
        const prQty = prsForMrp.reduce((sum, pr) => sum + pr.qty, 0);

        // PO aggregation: all PRs -> all POs
        let poQty = 0;
        let poDeliverDate: string | null = null;
        let poOrderDate: string | null = null;

        for (const pr of prsForMrp) {
          const posForPr = poByPrBillno.get(pr.billno) ?? [];
          for (const po of posForPr) {
            const effectiveQty = (po.actqty != null && po.actqty > 0) ? po.actqty : po.qty;
            poQty += effectiveQty;
            // max deliverdate
            if (po.deliverdate) {
              if (poDeliverDate === null || po.deliverdate > poDeliverDate) {
                poDeliverDate = po.deliverdate;
              }
            }
            // min biztime (order date)
            if (po.biztime) {
              if (poOrderDate === null || po.biztime < poOrderDate) {
                poOrderDate = po.biztime;
              }
            }
          }
        }

        const mrpDemandQty = (mrp.bizorderqty && mrp.bizorderqty !== 0)
          ? mrp.bizorderqty
          : mrp.adviseorderqty;

        const mrpDropStatus = mrp.dropstatus_title || (mrp.bizdropqty > 0 ? '已投放' : '未投放');

        const matType = mrp.materialattr_title;
        const ltEntry = materialLeadtimeMap.get(materialCode);
        const standardLeadtime = matType === '自制'
          ? (ltEntry?.productLeadtime ?? null)
          : (ltEntry?.purchaseLeadtime ?? null);

        // Risk calculation
        let riskLevel: RiskLevel = null;
        let riskReason: string | null = null;

        if (matType === '外购' || matType === '委外') {
          const purchaseLt = ltEntry?.purchaseLeadtime ?? 0;

          // Condition A: poDeliverDate > deadline
          if (poDeliverDate && new Date(poDeliverDate).getTime() > deadlineMs) {
            riskLevel = 'red';
            riskReason = `PO交期 ${poDeliverDate} > 目标`;
          } else if (purchaseLt > 0) {
            // Condition B: orderDate + leadtime > deadline
            const orderDateMs = poOrderDate ? new Date(poOrderDate).getTime() : todayMs;
            if (orderDateMs + purchaseLt * DAY > deadlineMs) {
              riskLevel = 'red';
              const expectedArr = new Date(orderDateMs + purchaseLt * DAY).toISOString().slice(0, 10);
              riskReason = poOrderDate
                ? `下单 ${poOrderDate}，预计到 ${expectedArr}`
                : `今日起需 ${purchaseLt} 天，预计到 ${expectedArr}`;
            }
          }
        } else if (matType === '自制') {
          const productLt = ltEntry?.productLeadtime ?? 0;
          if (productLt > 0) {
            const daysToStart = Math.round((deadlineMs - productLt * DAY - todayMs) / DAY);
            if (daysToStart <= 1) {
              riskLevel = 'red';
              riskReason = `最晚开工倒计 ${daysToStart} 天（周期 ${productLt} 天）`;
            } else if (daysToStart < 3) {
              riskLevel = 'yellow';
              riskReason = `最晚开工倒计 ${daysToStart} 天（周期 ${productLt} 天）`;
            }
          }
        }

        result.push({
          materialCode,
          materialName: mrp.materialplanid_name,
          materialType: matType,
          isFirstRowForMaterial: isFirst,
          mrpBillno: mrp.billno,
          mrpDemandQty,
          mrpDropQty: mrp.bizdropqty,
          mrpDropStatus,
          prQty,
          poQty,
          poDeliverDate,
          poOrderDate,
          standardLeadtime,
          riskLevel,
          riskReason,
        });

        isFirst = false;
      }
    }

    // Sort material groups by worst risk, keeping rows within each group in original order
    const materialGroupOrder: string[] = [];
    const groupedRows = new Map<string, MrpRow[]>();
    for (const row of result) {
      if (!groupedRows.has(row.materialCode)) {
        groupedRows.set(row.materialCode, []);
        materialGroupOrder.push(row.materialCode);
      }
      groupedRows.get(row.materialCode)!.push(row);
    }

    const rankRisk = (r: RiskLevel) => r === 'red' ? 0 : r === 'yellow' ? 1 : 2;
    const groupRisk = (code: string) => {
      const rows = groupedRows.get(code)!;
      return Math.min(...rows.map(r => rankRisk(r.riskLevel)));
    };

    materialGroupOrder.sort((a, b) => groupRisk(a) - groupRisk(b));

    return materialGroupOrder.flatMap(code => groupedRows.get(code)!);
  }, [mrpRecords, prRecords, poRecords, materialLeadtimeMap, forecastDeadline, todayMs]);

  // Filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      if (q && !(
        r.materialCode.toLowerCase().includes(q) ||
        r.materialName.toLowerCase().includes(q) ||
        r.mrpBillno.toLowerCase().includes(q)
      )) return false;
      if (filterType !== 'all' && r.materialType !== filterType) return false;
      if (filterRisk === 'risk' && r.riskLevel === null) return false;
      return true;
    });
  }, [rows, search, filterType, filterRisk]);

  // Reset page when filters change
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(1, totalPages));

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  // Re-compute isFirstRowForMaterial for current page
  const pageRowsWithFirstMark = useMemo(() => {
    const seen = new Set<string>();
    return pageRows.map(r => ({
      ...r,
      isFirstRowForMaterial: seen.has(r.materialCode) ? false : (seen.add(r.materialCode), true),
    }));
  }, [pageRows]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleFilterTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterType(e.target.value as typeof filterType);
    setPage(1);
  };

  const handleFilterRiskChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterRisk(e.target.value as typeof filterRisk);
    setPage(1);
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        <div className="animate-pulse h-4 bg-slate-200 rounded w-3/4" />
        <div className="animate-pulse h-4 bg-slate-200 rounded w-1/2" />
        <div className="animate-pulse h-4 bg-slate-200 rounded w-2/3" />
      </div>
    );
  }

  if (mrpRecords.length === 0) {
    return <p className="text-xs text-slate-400 p-4">暂无 MRP 记录</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center px-1">
        <input
          type="text"
          placeholder="搜索物料编码/名称/MRP单号"
          value={search}
          onChange={handleSearchChange}
          className="border border-slate-200 rounded px-2 py-1 text-xs w-52 text-slate-600 placeholder-slate-400"
        />
        <select
          value={filterType}
          onChange={handleFilterTypeChange}
          className="border border-slate-200 rounded px-2 py-1 text-xs text-slate-600"
        >
          <option value="all">全部属性</option>
          <option value="外购">外购</option>
          <option value="委外">委外</option>
          <option value="自制">自制</option>
        </select>
        <select
          value={filterRisk}
          onChange={handleFilterRiskChange}
          className="border border-slate-200 rounded px-2 py-1 text-xs text-slate-600"
        >
          <option value="all">全部风险</option>
          <option value="risk">有风险</option>
        </select>
        <span className="text-xs text-slate-400">共 {filtered.length} 条</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">物料</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">属性</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">MRP单号</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">MRP需求量</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">投放数量</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">投放状态</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">PR数量</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">PO数量</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">PO交期</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">标准交期</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">风险状态</th>
            </tr>
          </thead>
          <tbody>
            {pageRowsWithFirstMark.map((row, idx) => (
              <tr
                key={`${row.materialCode}-${row.mrpBillno}-${idx}`}
                className={
                  row.riskLevel === 'red'
                    ? 'border-b border-slate-100 bg-red-50 border-l-2 border-red-400'
                    : row.riskLevel === 'yellow'
                    ? 'border-b border-slate-100 bg-yellow-50 border-l-2 border-yellow-400'
                    : 'border-b border-slate-100'
                }
              >
                <td className="px-3 py-2 whitespace-nowrap max-w-[180px]">
                  {row.isFirstRowForMaterial ? (
                    <div>
                      <p className="font-mono text-slate-700 text-xs">{row.materialCode}</p>
                      <p className="text-slate-500 text-xs mt-0.5 truncate" title={row.materialName}>{row.materialName}</p>
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                  {row.isFirstRowForMaterial ? row.materialType : ''}
                </td>
                <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">{row.mrpBillno}</td>
                <td className="px-3 py-2 text-right text-slate-600">{fmtQty(row.mrpDemandQty)}</td>
                <td className="px-3 py-2 text-right text-slate-600">{fmtQty(row.mrpDropQty)}</td>
                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.mrpDropStatus}</td>
                <td className="px-3 py-2 text-right text-slate-600">{fmtQty(row.prQty)}</td>
                <td className="px-3 py-2 text-right text-slate-600">{fmtQty(row.poQty)}</td>
                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.poDeliverDate ?? '—'}</td>
                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                  {row.standardLeadtime != null && row.standardLeadtime > 0 ? `${row.standardLeadtime}天` : '—'}
                </td>
                <td className="px-3 py-2 min-w-40">
                  {row.riskLevel === 'red' ? (
                    <div>
                      <span className="text-red-600 font-medium">⚠ 红色预警</span>
                      {row.riskReason && (
                        <p className="text-red-500 mt-0.5 leading-tight">{row.riskReason}</p>
                      )}
                    </div>
                  ) : row.riskLevel === 'yellow' ? (
                    <div>
                      <span className="text-yellow-600 font-medium">⚡ 黄色提醒</span>
                      {row.riskReason && (
                        <p className="text-yellow-600 mt-0.5 leading-tight">{row.riskReason}</p>
                      )}
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-end px-1 text-xs">
          <button
            disabled={safePage <= 1}
            onClick={() => setPage(p => p - 1)}
            className="px-2 py-1 border border-slate-200 rounded disabled:opacity-40 text-slate-600"
          >
            上一页
          </button>
          <span className="text-slate-500">
            {safePage} / {totalPages}
          </span>
          <button
            disabled={safePage >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-2 py-1 border border-slate-200 rounded disabled:opacity-40 text-slate-600"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
};

export default LargeForecastMaterialList;
