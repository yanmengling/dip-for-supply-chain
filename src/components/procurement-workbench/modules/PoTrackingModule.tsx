/**
 * 模块 2：PO 跟单 (M2)
 *
 * 全量取回（分块并发）→ 前端搜索/状态过滤 → 分页。
 * 搜索：PO单号 / 来源PR / 供应商 / 物料编码 / 物料名称（模糊匹配）
 * 状态过滤：全部 / 逾期 / 进行中 / 已到齐 / 已关闭
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
  RefreshCw, AlertCircle, Loader2, Search,
  ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { ProcurementTask } from '../../../types/procurementWorkbench';
import { paginatePoRows, type PoRow, type PoStatus } from '../../../services/procurementPoService';
import { useTaskPoData } from '../useTaskPoData';
import ModuleCard, { PlaceholderActionButton } from './ModuleCard';

interface PoTrackingModuleProps {
  task: ProcurementTask;
}

/** 供父组件通过 ref 调用，实现跨 Tab 联动 */
export interface PoTrackingModuleHandle {
  /** 切换到 PO 跟单时按供应商名过滤 */
  filterBySupplier: (supplierName: string) => void;
}

type PoStatusFilter = 'all' | 'overdue' | 'active' | 'fulfilled' | 'closed';

const PAGE_SIZE = 10;

const STATUS_META: Record<
  PoStatus,
  { label: string; tone: 'gray' | 'green' | 'orange' | 'red' | 'blue' }
> = {
  closed:          { label: '已关闭',       tone: 'gray' },
  terminated:      { label: '已终止',       tone: 'gray' },
  fulfilled:       { label: '已到齐',       tone: 'green' },
  partial_overdue: { label: '部分到货·逾期', tone: 'red' },
  partial:         { label: '部分到货',     tone: 'orange' },
  pending_overdue: { label: '未到货·逾期',  tone: 'red' },
  pending:         { label: '未到货',       tone: 'blue' },
};

const TAG_TONE_CLS: Record<'gray' | 'green' | 'orange' | 'red' | 'blue', string> = {
  gray:   'bg-slate-100 text-[#6c7a90]',
  green:  'bg-[#ebfff2] text-[#2fb36d] border border-[#2fb36d]/20',
  orange: 'bg-[#fff6eb] text-[#ff9f43] border border-[#ff9f43]/20',
  red:    'bg-[#fff2f1] text-[#f25f5c] border border-[#f25f5c]/20',
  blue:   'bg-[#eef4ff] text-[#2f6bff] border border-[#2f6bff]/20',
};

const STATUS_FILTER_OPTS: Array<{ id: PoStatusFilter; label: string }> = [
  { id: 'all',       label: '全部' },
  { id: 'overdue',   label: '逾期' },
  { id: 'active',    label: '进行中' },
  { id: 'fulfilled', label: '已到齐' },
  { id: 'closed',    label: '已关闭' },
];

/**
 * 判断一行 PO 是否匹配状态过滤器。
 *
 * 注意："已到齐"直接用 actqty >= qty 判断，不依赖 status 字段。
 * 原因：ERP 中完全收货的 PO 通常会被关单（status = 'closed'），
 *      此时 status 字段不再是 'fulfilled'，但业务上确实已到齐。
 * 与 RemainingDays 列的显示逻辑保持同一口径。
 */
function matchStatusFilter(row: PoRow, filter: PoStatusFilter): boolean {
  const isActuallyFulfilled = row.qty > 0 && row.actqty >= row.qty;

  switch (filter) {
    case 'all':
      return true;
    case 'fulfilled':
      // 不管关闭状态，只要数量到齐就算"已到齐"
      return isActuallyFulfilled;
    case 'overdue':
      // 未到齐 + 逾期
      return !isActuallyFulfilled && (
        row.status === 'pending_overdue' || row.status === 'partial_overdue'
      );
    case 'active':
      // 未到齐 + 正常进行中
      return !isActuallyFulfilled && (
        row.status === 'pending' || row.status === 'partial'
      );
    case 'closed':
      // 显式关闭/终止（不含已到齐关单）
      return !isActuallyFulfilled && (
        row.status === 'closed' || row.status === 'terminated'
      );
  }
}

function filterRows(rows: PoRow[], search: string, statusFilter: PoStatusFilter): PoRow[] {
  const kw = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (!matchStatusFilter(row, statusFilter)) return false;
    if (!kw) return true;
    return (
      row.billno?.toLowerCase().includes(kw) ||
      row.srcbillnumber?.toLowerCase().includes(kw) ||
      row.supplier_name?.toLowerCase().includes(kw) ||
      row.material_number?.toLowerCase().includes(kw) ||
      row.material_name?.toLowerCase().includes(kw)
    );
  });
}

const PoTrackingModule = forwardRef<PoTrackingModuleHandle, PoTrackingModuleProps>(
function PoTrackingModule({ task }, ref) {
  const [pageIndex, setPageIndex] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<PoStatusFilter>('all');

  useImperativeHandle(ref, () => ({
    filterBySupplier(supplierName: string) {
      setSearchText(supplierName);
      setStatusFilter('all');
      setPageIndex(0);
    },
  }));

  const { data, loading, error, refresh } = useTaskPoData({
    taskId: task.id,
    filter: task.filter,
    includeClosed: true,
  });

  const allRows = data?.rows ?? [];
  const prCount = data?.prBillnoCount ?? 0;

  // 搜索/状态/任务变化 → 重置分页
  useEffect(() => {
    setPageIndex(0);
  }, [task.id, task.filter, searchText, statusFilter]);

  // 前端过滤
  const filteredRows = useMemo(
    () => filterRows(allRows, searchText, statusFilter),
    [allRows, searchText, statusFilter],
  );

  const totalAll      = allRows.length;
  const totalFiltered = filteredRows.length;
  const isFiltering   = searchText.trim() !== '' || statusFilter !== 'all';

  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const safePage   = Math.min(pageIndex, totalPages - 1);
  const pageRows   = useMemo(
    () => paginatePoRows(filteredRows, safePage, PAGE_SIZE),
    [filteredRows, safePage],
  );
  const hasPrev = safePage > 0;
  const hasNext = safePage + 1 < totalPages;
  const startNo = totalFiltered === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const endNo   = Math.min(totalFiltered, safePage * PAGE_SIZE + pageRows.length);

  const totalConditions =
    task.filter.prBillnos.length +
    task.filter.projectIds.length +
    task.filter.materialNumbers.length +
    task.filter.materialNames.length;

  const subtitleText = isFiltering
    ? `找到 ${totalFiltered} 行 / 共 ${totalAll} 行 · 反查自 ${prCount} 个 PR`
    : `共 ${totalAll} 行 · 反查自 ${prCount} 个 PR`;

  return (
    <ModuleCard
      title="PO 跟单"
      subtitle={subtitleText}
      badgeTone="blue"
      actions={
        <div className="flex items-center gap-1.5">
          <PlaceholderActionButton label="催货" />
          <PlaceholderActionButton label="改期申请" />
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 rounded-lg text-[#6c7a90] hover:bg-[#f4f7fb] disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
    >
      {/* ── 搜索/状态筛选条 ── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6c7a90] pointer-events-none" />
          <input
            type="text"
            placeholder="PO单号 / 来源PR / 供应商 / 物料名称 / 编码"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-7 pl-7 pr-3 text-xs rounded-xl border border-[#e5ebf3] bg-[#f4f7fb] text-slate-700 placeholder-[#6c7a90] focus:outline-none focus:ring-2 focus:ring-[#2f6bff]/30 focus:border-[#2f6bff] transition-colors w-56"
          />
        </div>

        <div className="flex items-center gap-0.5 bg-[#f4f7fb] border border-[#e5ebf3] rounded-xl p-0.5">
          {STATUS_FILTER_OPTS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setStatusFilter(opt.id)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-all ${
                statusFilter === opt.id
                  ? 'bg-[#2f6bff] text-white shadow-sm'
                  : 'text-[#6c7a90] hover:text-[#2f6bff]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 内容区 ── */}
      {totalConditions === 0 ? (
        <EmptyHint text="任务未设置过滤条件" />
      ) : error ? (
        <ErrorHint message={error} onRetry={refresh} />
      ) : loading && allRows.length === 0 ? (
        <LoadingHint />
      ) : totalAll === 0 ? (
        <EmptyHint text={prCount === 0 ? '任务范围内未匹配到 PR' : '匹配的 PR 尚未下推任何 PO'} />
      ) : totalFiltered === 0 ? (
        <EmptyHint text="当前搜索/筛选条件下无匹配 PO" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-[#f4f7fb] text-[#6c7a90]">
              <tr>
                <Th className="w-32">PO 单号</Th>
                <Th className="w-32">来源 PR</Th>
                <Th>供应商</Th>
                <Th className="w-32">物料编码</Th>
                <Th>物料名称</Th>
                <Th className="w-16 text-right">数量</Th>
                <Th className="w-16 text-right">已入库</Th>
                <Th className="w-24">交期</Th>
                <Th className="w-20 text-right">剩余天数</Th>
                <Th className="w-28">状态</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f4f7fb] text-slate-700">
              {pageRows.map((row) => {
                const meta = STATUS_META[row.status];
                return (
                  <tr
                    key={row.entry_id || `${row.billno}-${row.material_number}`}
                    className="hover:bg-[#f4f7fb]/70"
                  >
                    <Td><span className="font-mono text-[#2f6bff]">{row.billno}</span></Td>
                    <Td><span className="font-mono text-[#6c7a90]">{row.srcbillnumber}</span></Td>
                    <Td className="truncate max-w-[160px]" title={row.supplier_name}>
                      {row.supplier_name || '—'}
                    </Td>
                    <Td><span className="font-mono">{row.material_number}</span></Td>
                    <Td className="truncate max-w-[200px]" title={row.material_name}>
                      {row.material_name}
                    </Td>
                    <Td className="text-right tabular-nums">{formatQty(row.qty)}</Td>
                    <Td className="text-right tabular-nums">
                      <span
                        className={
                          row.qty > 0 && row.actqty >= row.qty
                            ? 'text-[#2fb36d]'
                            : row.actqty > 0
                              ? 'text-[#ff9f43]'
                              : 'text-slate-300'
                        }
                      >
                        {formatQty(row.actqty)}
                      </span>
                    </Td>
                    <Td>{row.deliverdate || '—'}</Td>
                    <Td className="text-right tabular-nums">
                      <RemainingDays days={row.remainingDays} actqty={row.actqty} qty={row.qty} />
                    </Td>
                    <Td>
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${TAG_TONE_CLS[meta.tone]}`}
                      >
                        {meta.label}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* 分页条 */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#f4f7fb] text-xs text-[#6c7a90]">
            <span>
              第 <span className="font-semibold text-[#1f2d3d]">{startNo}–{endNo}</span> 条
              {' '}/ 共 <span className="font-semibold text-[#1f2d3d]">{totalFiltered}</span> 条
              {isFiltering && (
                <span className="ml-1 text-[#6c7a90]">（全量 {totalAll} 条）</span>
              )}
            </span>
            <div className="flex items-center gap-1">
              <PageBtn onClick={() => setPageIndex(0)} disabled={!hasPrev} title="首页">
                <ChevronsLeft size={13} />
              </PageBtn>
              <PageBtn
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                disabled={!hasPrev}
                title="上一页"
              >
                <ChevronLeft size={13} />
              </PageBtn>
              <span className="px-2 text-[#6c7a90] min-w-[80px] text-center">
                第 <span className="font-semibold text-[#1f2d3d]">{safePage + 1}</span>
                {' '}/ <span className="font-semibold text-[#1f2d3d]">{totalPages}</span> 页
              </span>
              <PageBtn
                onClick={() => setPageIndex((p) => Math.min(totalPages - 1, p + 1))}
                disabled={!hasNext}
                title="下一页"
              >
                <ChevronRight size={13} />
              </PageBtn>
              <PageBtn
                onClick={() => setPageIndex(totalPages - 1)}
                disabled={!hasNext}
                title="末页"
              >
                <ChevronsRight size={13} />
              </PageBtn>
            </div>
          </div>
        </div>
      )}
    </ModuleCard>
  );
});

export default PoTrackingModule;

/* ── 辅助组件 ── */

function PageBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-7 h-7 flex items-center justify-center border border-[#e5ebf3] rounded-lg text-[#6c7a90] hover:bg-[#eef4ff] hover:text-[#2f6bff] hover:border-[#2f6bff]/30 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

function RemainingDays({
  days,
  actqty,
  qty,
}: {
  days: number | null;
  actqty: number;
  qty: number;
}) {
  // 1. 入库数量 >= 计划数量 → 已到齐，不展示剩余天数
  if (qty > 0 && actqty >= qty) {
    return <span className="text-[#2fb36d] font-medium">已到齐</span>;
  }
  // 2. 未到齐 → 按交期与今天的差值展示
  if (days == null) return <span className="text-slate-300">—</span>;
  if (days < 0)     return <span className="text-[#f25f5c] font-medium">逾期 {-days} 天</span>;
  if (days === 0)   return <span className="text-[#ff9f43] font-medium">今日</span>;
  if (days <= 3)    return <span className="text-[#ff9f43]">{days} 天</span>;
  return <span className="text-[#6c7a90]">{days} 天</span>;
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-2 py-2 text-left font-medium text-[11px] ${className}`}>{children}</th>;
}

function Td({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <td className={`px-2 py-1.5 ${className}`} title={title}>{children}</td>;
}

function LoadingHint() {
  return (
    <div className="flex items-center justify-center min-h-[120px] text-xs text-[#6c7a90] gap-2">
      <Loader2 className="w-4 h-4 animate-spin text-[#2f6bff]" />
      加载中...
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center min-h-[120px] text-xs text-[#6c7a90] bg-[#f4f7fb] rounded-xl border border-dashed border-[#e5ebf3] px-4 py-6">
      {text}
    </div>
  );
}

function ErrorHint({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[120px] text-xs text-[#f25f5c] gap-2">
      <AlertCircle className="w-5 h-5" />
      <span>{message}</span>
      <button
        onClick={onRetry}
        className="px-2.5 py-1 border border-[#f25f5c]/30 rounded-lg text-[#f25f5c] hover:bg-[#fff2f1]"
      >
        重试
      </button>
    </div>
  );
}

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
