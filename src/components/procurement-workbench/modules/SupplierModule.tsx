/**
 * 模块 6：供应商概览 (M6)
 *
 * 数据来源：复用 useTaskPoData（与 PO 跟单共享缓存，避免重复反查 PR + PO）
 * 聚合维度：supplier_name（无名称的归入「未指定供应商」）
 *
 * 展示字段：
 *   供应商 · PO 单数（去重 billno） · 行项数 · 涉及物料数（去重 material_number）
 *   总数量 · 总到货 · 到货率（actqty / qty）
 *   逾期 PO 行（status ∈ partial_overdue|pending_overdue）
 *   平均剩余天数（仅未到齐且交期非空，逾期记负值）
 *
 * 默认按「逾期行数」降序，相同则按 PO 单数降序、再按供应商名升序。
 */

import { useMemo, useState } from 'react';
import { RefreshCw, AlertCircle, Loader2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { ProcurementTask } from '../../../types/procurementWorkbench';
import type { PoRow } from '../../../services/procurementPoService';
import { useTaskPoData } from '../useTaskPoData';
import ModuleCard from './ModuleCard';

interface SupplierModuleProps {
  task: ProcurementTask;
  /** 点击供应商行时，切换到 PO 跟单 Tab 并按该供应商过滤 */
  onNavigateToPo?: (supplierName: string) => void;
}

interface SupplierAgg {
  supplierName: string;
  poCount: number;
  rowCount: number;
  materialCount: number;
  totalQty: number;
  totalActqty: number;
  fulfillRate: number; // 0-1，qty 为 0 时记 0
  overdueRows: number;
  avgRemainingDays: number | null; // 仅统计未到齐且 deliverdate 非空
}

type SortKey =
  | 'supplierName'
  | 'poCount'
  | 'rowCount'
  | 'materialCount'
  | 'totalQty'
  | 'totalActqty'
  | 'fulfillRate'
  | 'overdueRows'
  | 'avgRemainingDays';

type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 10;

export default function SupplierModule({ task, onNavigateToPo }: SupplierModuleProps) {
  const [sortKey, setSortKey] = useState<SortKey>('overdueRows');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [pageIndex, setPageIndex] = useState(0);

  const { data, loading, error, refresh } = useTaskPoData({
    taskId: task.id,
    filter: task.filter,
    includeClosed: true,
  });

  const aggregates = useMemo(() => aggregateBySupplier(data?.rows ?? []), [data]);

  const sorted = useMemo(() => sortAggregates(aggregates, sortKey, sortDir), [aggregates, sortKey, sortDir]);

  const totalSuppliers = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalSuppliers / PAGE_SIZE));
  const safePage = Math.min(pageIndex, totalPages - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const startNo = totalSuppliers === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const endNo = Math.min(totalSuppliers, safePage * PAGE_SIZE + pageRows.length);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'supplierName' ? 'asc' : 'desc');
    }
    setPageIndex(0);
  };

  const totalConditions =
    task.filter.prBillnos.length +
    task.filter.projectIds.length +
    task.filter.materialNumbers.length +
    task.filter.materialNames.length;

  const totalRows = data?.rows.length ?? 0;

  return (
    <ModuleCard
      title="供应商概览"
      subtitle={`本任务涉及供应商汇总 · 共 ${totalSuppliers} 家 / ${totalRows} 行 PO`}
      badge={`${totalSuppliers} 家`}
      badgeTone="blue"
      actions={
        <div className="flex items-center gap-1.5">
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
    >
      {totalConditions === 0 ? (
        <EmptyHint text="任务未设置过滤条件" />
      ) : error ? (
        <ErrorHint message={error} onRetry={refresh} />
      ) : loading && totalRows === 0 ? (
        <LoadingHint />
      ) : totalSuppliers === 0 ? (
        <EmptyHint text="任务范围内尚未匹配到任何 PO 行" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <SortableTh sortKey="supplierName" current={sortKey} dir={sortDir} onSort={handleSort}>
                  供应商
                </SortableTh>
                <SortableTh sortKey="poCount" current={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  PO 单数
                </SortableTh>
                <SortableTh sortKey="rowCount" current={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  行项数
                </SortableTh>
                <SortableTh sortKey="materialCount" current={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  物料数
                </SortableTh>
                <SortableTh sortKey="totalQty" current={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  总数量
                </SortableTh>
                <SortableTh sortKey="totalActqty" current={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  总到货
                </SortableTh>
                <SortableTh sortKey="fulfillRate" current={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  到货率
                </SortableTh>
                <SortableTh sortKey="overdueRows" current={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  逾期行
                </SortableTh>
                <SortableTh sortKey="avgRemainingDays" current={sortKey} dir={sortDir} onSort={handleSort} align="right">
                  平均剩余
                </SortableTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {pageRows.map((agg) => (
                <tr key={agg.supplierName} className="hover:bg-slate-50/60">
                  <Td className="truncate max-w-[200px]" title={`${agg.supplierName}（点击跳转 PO 跟单过滤）`}>
                    {onNavigateToPo ? (
                      <button
                        onClick={() => onNavigateToPo(agg.supplierName)}
                        className="font-medium text-[#2f6bff] hover:underline cursor-pointer text-left truncate max-w-full"
                      >
                        {agg.supplierName}
                      </button>
                    ) : (
                      <span className="font-medium text-slate-700">{agg.supplierName}</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{agg.poCount}</Td>
                  <Td className="text-right tabular-nums">{agg.rowCount}</Td>
                  <Td className="text-right tabular-nums">{agg.materialCount}</Td>
                  <Td className="text-right tabular-nums">{formatQty(agg.totalQty)}</Td>
                  <Td className="text-right tabular-nums">{formatQty(agg.totalActqty)}</Td>
                  <Td className="text-right tabular-nums">
                    <FulfillRate rate={agg.fulfillRate} hasQty={agg.totalQty > 0} />
                  </Td>
                  <Td className="text-right tabular-nums">
                    {agg.overdueRows === 0 ? (
                      <span className="text-slate-400">0</span>
                    ) : (
                      <span className="text-red-600 font-medium">{agg.overdueRows}</span>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    <AvgRemainingDays days={agg.avgRemainingDays} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
            <span>
              第 {startNo}–{endNo} 家 / 共 {totalSuppliers} 家
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="px-2.5 py-1 border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <span className="text-slate-400">第 {safePage + 1} / {totalPages} 页</span>
              <button
                onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage + 1 >= totalPages}
                className="px-2.5 py-1 border border-slate-200 rounded text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      )}
    </ModuleCard>
  );
}

// =====================================================================
// 聚合 / 排序
// =====================================================================

function aggregateBySupplier(rows: PoRow[]): SupplierAgg[] {
  interface Bucket {
    supplierName: string;
    billnos: Set<string>;
    materials: Set<string>;
    rowCount: number;
    totalQty: number;
    totalActqty: number;
    overdueRows: number;
    remainingDaysSum: number;
    remainingDaysCount: number;
  }

  const map = new Map<string, Bucket>();
  for (const row of rows) {
    const name = (row.supplier_name || '').trim() || '未指定供应商';
    let b = map.get(name);
    if (!b) {
      b = {
        supplierName: name,
        billnos: new Set(),
        materials: new Set(),
        rowCount: 0,
        totalQty: 0,
        totalActqty: 0,
        overdueRows: 0,
        remainingDaysSum: 0,
        remainingDaysCount: 0,
      };
      map.set(name, b);
    }
    if (row.billno) b.billnos.add(row.billno);
    if (row.material_number) b.materials.add(row.material_number);
    b.rowCount += 1;
    b.totalQty += row.qty || 0;
    b.totalActqty += row.actqty || 0;
    if (row.status === 'partial_overdue' || row.status === 'pending_overdue') {
      b.overdueRows += 1;
    }
    // 平均剩余天数：仅未到齐 + 有交期，逾期记负值
    if (row.status !== 'fulfilled' && row.status !== 'closed' && row.status !== 'terminated' && row.remainingDays != null) {
      b.remainingDaysSum += row.remainingDays;
      b.remainingDaysCount += 1;
    }
  }

  const result: SupplierAgg[] = [];
  for (const b of map.values()) {
    result.push({
      supplierName: b.supplierName,
      poCount: b.billnos.size,
      rowCount: b.rowCount,
      materialCount: b.materials.size,
      totalQty: b.totalQty,
      totalActqty: b.totalActqty,
      fulfillRate: b.totalQty > 0 ? Math.min(1, b.totalActqty / b.totalQty) : 0,
      overdueRows: b.overdueRows,
      avgRemainingDays: b.remainingDaysCount > 0 ? b.remainingDaysSum / b.remainingDaysCount : null,
    });
  }
  return result;
}

function sortAggregates(rows: SupplierAgg[], key: SortKey, dir: SortDir): SupplierAgg[] {
  const sign = dir === 'asc' ? 1 : -1;
  const arr = rows.slice();
  arr.sort((a, b) => {
    const cmp = compareKey(a, b, key);
    if (cmp !== 0) return cmp * sign;
    // 二级排序：保证稳定的次序
    if (key !== 'overdueRows' && a.overdueRows !== b.overdueRows) return b.overdueRows - a.overdueRows;
    if (key !== 'poCount' && a.poCount !== b.poCount) return b.poCount - a.poCount;
    return a.supplierName.localeCompare(b.supplierName, 'zh-CN');
  });
  return arr;
}

function compareKey(a: SupplierAgg, b: SupplierAgg, key: SortKey): number {
  switch (key) {
    case 'supplierName':
      return a.supplierName.localeCompare(b.supplierName, 'zh-CN');
    case 'avgRemainingDays': {
      // null 视作最大（排序时永远靠后），与升降序无关
      const av = a.avgRemainingDays;
      const bv = b.avgRemainingDays;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av - bv;
    }
    default:
      return (a[key] as number) - (b[key] as number);
  }
}

// =====================================================================
// UI 子件
// =====================================================================

function SortableTh({
  children,
  sortKey,
  current,
  dir,
  onSort,
  align = 'left',
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = current === sortKey;
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={`px-2 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-slate-700 ${active ? 'text-slate-700' : ''}`}
      >
        <span>{children}</span>
        <Icon className={`w-3 h-3 ${active ? 'text-blue-500' : 'text-slate-300'}`} />
      </button>
    </th>
  );
}

function Td({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <td className={`px-2 py-1.5 ${className}`} title={title}>
      {children}
    </td>
  );
}

function FulfillRate({ rate, hasQty }: { rate: number; hasQty: boolean }) {
  if (!hasQty) return <span className="text-slate-300">—</span>;
  const pct = Math.round(rate * 1000) / 10;
  const tone = rate >= 1 ? 'text-emerald-600' : rate > 0 ? 'text-orange-600' : 'text-slate-400';
  return <span className={tone}>{pct.toFixed(1)}%</span>;
}

function AvgRemainingDays({ days }: { days: number | null }) {
  if (days == null) return <span className="text-slate-300">—</span>;
  const rounded = Math.round(days * 10) / 10;
  if (rounded < 0) return <span className="text-red-600">逾期 {Math.abs(rounded).toFixed(1)} 天</span>;
  if (rounded <= 3) return <span className="text-orange-500">{rounded.toFixed(1)} 天</span>;
  return <span className="text-slate-500">{rounded.toFixed(1)} 天</span>;
}

function LoadingHint() {
  return (
    <div className="flex items-center justify-center min-h-[120px] text-xs text-slate-400 gap-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      加载中...
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center min-h-[120px] text-xs text-slate-400 bg-slate-50/50 rounded-lg border border-dashed border-slate-200 px-4 py-6">
      {text}
    </div>
  );
}

function ErrorHint({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[120px] text-xs text-red-600 gap-2">
      <AlertCircle className="w-5 h-5" />
      <span>{message}</span>
      <button onClick={onRetry} className="px-2.5 py-1 border border-red-200 rounded text-red-600 hover:bg-red-50">
        重试
      </button>
    </div>
  );
}

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
