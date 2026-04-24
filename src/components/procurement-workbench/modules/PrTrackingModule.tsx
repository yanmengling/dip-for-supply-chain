/**
 * 模块 1：PR 跟单 (M1)
 *
 * 分页：cursor (search_after) 服务端翻页，每页 10 条
 * 总数：缓存首次有效 total_count，避免游标翻页后 total 归零
 * 搜索：物料名称/编码关键词（作为额外 AND 条件发往服务端）
 * 状态过滤：全部 / 进行中 / 已关闭 / 已终止
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, AlertCircle, Loader2, Search, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ProcurementTask } from '../../../types/procurementWorkbench';
import type { QueryCondition } from '../../../api/ontologyApiTypes';
import { queryPrPage, type PrRow } from '../../../services/procurementPrService';
import ModuleCard from './ModuleCard';
import DemandDateCell from './DemandDateCell';
import BulkDemandDateDialog from './BulkDemandDateDialog';
import ImportDemandDateDialog from './ImportDemandDateDialog';

interface PrTrackingModuleProps {
  task: ProcurementTask;
  onTaskMutated?: () => void;
}

type StatusFilter = 'all' | 'active' | 'closed' | 'terminated';

const PAGE_SIZE = 10;

const STATUS_OPTS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all',        label: '全部' },
  { id: 'active',     label: '进行中' },
  { id: 'closed',     label: '已关闭' },
  { id: 'terminated', label: '已终止' },
];

export default function PrTrackingModule({ task, onTaskMutated }: PrTrackingModuleProps) {
  const f = task.filter;
  const totalConditions =
    f.prBillnos.length + f.projectIds.length + f.materialNumbers.length + f.materialNames.length;

  /* ---------- 搜索/筛选 ---------- */
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  /* ---------- 分页数据 ---------- */
  const [rows, setRows] = useState<PrRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 缓存服务端返回的真实总数（游标非首页可能返回 0） */
  const knownTotalRef = useRef(0);

  /** 游标栈：cursorStack[i] 是第 i 页的起始游标 */
  const cursorStackRef = useRef<Array<any[] | undefined>>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);

  /* ---------- 选择/对话框 ---------- */
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  /* ---------- 额外查询条件（搜索/状态过滤） ---------- */
  const extraAndConditions = useMemo<QueryCondition[]>(() => {
    const conds: QueryCondition[] = [];
    const kw = searchText.trim();
    if (kw) {
      conds.push({
        operation: 'or',
        sub_conditions: [
          { field: 'material_name',   operation: 'like', value: `%${kw}%` },
          { field: 'material_number', operation: 'like', value: `%${kw}%` },
        ],
      });
    }
    if (statusFilter === 'active') {
      conds.push({ field: 'rowclosestatus_title',     operation: '!=', value: '已关闭' });
      conds.push({ field: 'rowterminatestatus_title', operation: '!=', value: '已终止' });
    } else if (statusFilter === 'closed') {
      conds.push({ field: 'rowclosestatus_title',     operation: '==', value: '已关闭' });
    } else if (statusFilter === 'terminated') {
      conds.push({ field: 'rowterminatestatus_title', operation: '==', value: '已终止' });
    }
    return conds;
  }, [searchText, statusFilter]);

  /** 保持 ref 与最新 memo 同步（loadPage 通过 ref 读取，避免闭包捕获旧值） */
  const extraConditionsRef = useRef<QueryCondition[]>([]);
  extraConditionsRef.current = extraAndConditions;

  /* ---------- 任务/过滤/搜索/状态变化 → 重置 ---------- */
  const taskKey = useMemo(
    () => `${task.id}::${JSON.stringify(f)}::${searchText.trim()}::${statusFilter}`,
    [task.id, f, searchText, statusFilter],
  );

  useEffect(() => {
    knownTotalRef.current = 0;
    cursorStackRef.current = [undefined];
    setPageIndex(0);
    void loadPage(0, [undefined]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskKey]);

  /* ---------- 加载函数 ---------- */
  async function loadPage(targetIndex: number, stack: Array<any[] | undefined>) {
    setLoading(true);
    setError(null);
    setSelectedKeys(new Set());
    try {
      const cursor = stack[targetIndex];
      const result = await queryPrPage(f, {
        pageSize: PAGE_SIZE,
        cursor,
        includeClosed: true,
        extraAndConditions: extraConditionsRef.current,
      });
      setRows(result.rows);
      setTotal(result.total);
      // 只要服务端返回的 total 大于 PAGE_SIZE 或是首页，就更新缓存总数
      if (targetIndex === 0 || result.total > PAGE_SIZE) {
        knownTotalRef.current = result.total;
      }
      if (result.nextCursor && stack.length === targetIndex + 1) {
        cursorStackRef.current = [...stack, result.nextCursor];
      } else {
        cursorStackRef.current = stack;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '查询失败');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  /* ---------- 分页辅助 ---------- */
  /** 显示用的总数：优先用缓存的真实总数 */
  const displayTotal = knownTotalRef.current > 0 ? knownTotalRef.current : total;
  const hasNext = pageIndex + 1 < cursorStackRef.current.length;
  const hasPrev = pageIndex > 0;
  const startNo = displayTotal === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const endNo   = Math.min(displayTotal, pageIndex * PAGE_SIZE + rows.length);

  const goFirst = () => {
    if (!hasPrev || loading) return;
    setPageIndex(0);
    void loadPage(0, cursorStackRef.current);
  };
  const goPrev = () => {
    if (!hasPrev || loading) return;
    const idx = pageIndex - 1;
    setPageIndex(idx);
    void loadPage(idx, cursorStackRef.current);
  };
  const goNext = () => {
    if (!hasNext || loading) return;
    const idx = pageIndex + 1;
    setPageIndex(idx);
    void loadPage(idx, cursorStackRef.current);
  };
  const refresh = () => {
    knownTotalRef.current = 0;
    cursorStackRef.current = [undefined];
    setPageIndex(0);
    void loadPage(0, [undefined]);
  };

  /* ---------- 选择 ---------- */
  const toggleRow = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const toggleAll = () => {
    if (selectedKeys.size === rows.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(rows.map((r) => r.entry_id || `${r.billno}-${r.material_number}`)));
    }
  };
  const selectedPrBillnos = useMemo(() => {
    const bns = new Set<string>();
    for (const r of rows) {
      const key = r.entry_id || `${r.billno}-${r.material_number}`;
      if (selectedKeys.has(key) && r.billno) bns.add(r.billno);
    }
    return Array.from(bns);
  }, [rows, selectedKeys]);

  const handleBulkApplied = (count: number) => {
    setBulkOpen(false);
    setSelectedKeys(new Set());
    onTaskMutated?.();
    console.log(`[PrTrackingModule] 批量赋值 ${count} 条需求日期`);
  };

  /* ---------- 渲染 ---------- */
  return (
    <ModuleCard
      title="PR 跟单"
      subtitle={`${totalConditions} 项过滤条件 · 共 ${displayTotal} 行`}
      badgeTone="blue"
      actions={
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setBulkOpen(true)}
            disabled={selectedPrBillnos.length === 0}
            className="px-2.5 py-1 text-xs font-medium text-white bg-[#2f6bff] rounded-lg hover:bg-[#2558e0] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
            title={selectedPrBillnos.length === 0 ? '请先勾选行' : `批量赋值 ${selectedPrBillnos.length} 个 PR`}
          >
            批量赋值需求日期{selectedPrBillnos.length > 0 ? ` (${selectedPrBillnos.length})` : ''}
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="px-2.5 py-1 text-xs font-medium text-[#2fb36d] bg-[#ebfff2] border border-[#2fb36d]/20 rounded-lg hover:bg-[#d4f7e4] transition-colors"
          >
            导入 CSV
          </button>
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
        {/* 物料搜索 */}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6c7a90] pointer-events-none" />
          <input
            type="text"
            placeholder="物料名称 / 编码搜索"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="h-7 pl-7 pr-3 text-xs rounded-xl border border-[#e5ebf3] bg-[#f4f7fb] text-slate-700 placeholder-[#6c7a90] focus:outline-none focus:ring-2 focus:ring-[#2f6bff]/30 focus:border-[#2f6bff] transition-colors w-44"
          />
        </div>

        {/* 状态筛选 */}
        <div className="flex items-center gap-0.5 bg-[#f4f7fb] border border-[#e5ebf3] rounded-xl p-0.5">
          {STATUS_OPTS.map((opt) => (
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
      ) : loading && rows.length === 0 ? (
        <LoadingHint />
      ) : rows.length === 0 ? (
        <EmptyHint text="未匹配到任何 PR" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-[#f4f7fb] text-[#6c7a90]">
              <tr>
                <Th className="w-8">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && selectedKeys.size === rows.length}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedKeys.size > 0 && selectedKeys.size < rows.length;
                    }}
                    onChange={toggleAll}
                    className="rounded"
                    title="全选当前页"
                  />
                </Th>
                <Th className="w-32">单号</Th>
                <Th className="w-28">项目号</Th>
                <Th className="w-32">物料编码</Th>
                <Th>物料名称</Th>
                <Th className="w-20 text-right">数量</Th>
                <Th className="w-20 text-right">已转 PO</Th>
                <Th className="w-28">需求日期</Th>
                <Th className="w-24">审核日期</Th>
                <Th className="w-20">状态</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f4f7fb] text-slate-700">
              {rows.map((row) => {
                const demand = task.prDemandDates[row.billno];
                const closed     = row.rowclosestatus_title === '已关闭';
                const terminated = row.rowterminatestatus_title === '已终止';
                const rowKey = row.entry_id || `${row.billno}-${row.material_number}`;
                const checked = selectedKeys.has(rowKey);
                return (
                  <tr key={rowKey} className={`hover:bg-[#f4f7fb]/70 ${checked ? 'bg-[#eef4ff]' : ''}`}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRow(rowKey)}
                        className="rounded"
                      />
                    </Td>
                    <Td><span className="font-mono text-[#2f6bff]">{row.billno}</span></Td>
                    <Td>{row.huid_xmh_name || '—'}</Td>
                    <Td><span className="font-mono">{row.material_number}</span></Td>
                    <Td className="truncate max-w-[200px]" title={row.material_name}>
                      {row.material_name}
                    </Td>
                    <Td className="text-right tabular-nums">{formatQty(row.qty)}</Td>
                    <Td className="text-right tabular-nums">
                      <span className={row.joinqty < row.qty ? 'text-[#ff9f43]' : 'text-[#2fb36d]'}>
                        {formatQty(row.joinqty)}
                      </span>
                    </Td>
                    <Td>
                      <DemandDateCell
                        taskId={task.id}
                        prBillno={row.billno}
                        current={demand}
                        onChange={() => onTaskMutated?.()}
                      />
                    </Td>
                    <Td className="text-[#6c7a90]">{formatDate(row.auditdate)}</Td>
                    <Td>
                      {closed ? (
                        <Tag tone="gray">已关闭</Tag>
                      ) : terminated ? (
                        <Tag tone="orange">已终止</Tag>
                      ) : (
                        <Tag tone="green">进行中</Tag>
                      )}
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
              {' '}/ 共 <span className="font-semibold text-[#1f2d3d]">{displayTotal}</span> 条
            </span>
            <div className="flex items-center gap-1">
              {/* 首页 */}
              <PageBtn
                onClick={goFirst}
                disabled={!hasPrev || loading}
                title="首页"
              >
                <ChevronsLeft size={13} />
              </PageBtn>
              {/* 上一页 */}
              <PageBtn onClick={goPrev} disabled={!hasPrev || loading} title="上一页">
                <ChevronLeft size={13} />
              </PageBtn>
              <span className="px-2 text-[#6c7a90] min-w-[60px] text-center">
                第 <span className="font-semibold text-[#1f2d3d]">{pageIndex + 1}</span> 页
              </span>
              {/* 下一页 */}
              <PageBtn onClick={goNext} disabled={!hasNext || loading} title="下一页">
                <ChevronRight size={13} />
              </PageBtn>
              {/* 末页（游标分页不支持随机跳转，始终禁用） */}
              <PageBtn disabled title="末页（游标分页不支持直接跳末页）">
                <ChevronsRight size={13} />
              </PageBtn>
            </div>
          </div>
        </div>
      )}

      <BulkDemandDateDialog
        open={bulkOpen}
        taskId={task.id}
        prBillnos={selectedPrBillnos}
        onClose={() => setBulkOpen(false)}
        onApplied={handleBulkApplied}
      />

      <ImportDemandDateDialog
        open={importOpen}
        taskId={task.id}
        onClose={() => setImportOpen(false)}
        onApplied={(count) => {
          setImportOpen(false);
          onTaskMutated?.();
          console.log(`[PrTrackingModule] 导入 ${count} 条需求日期`);
        }}
      />
    </ModuleCard>
  );
}

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

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-2 py-2 text-left font-medium text-[11px] ${className}`}>{children}</th>;
}

function Td({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <td className={`px-2 py-1.5 ${className}`} title={title}>{children}</td>;
}

function Tag({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'gray' | 'orange' | 'green';
}) {
  const cls = {
    gray:   'bg-slate-100 text-[#6c7a90]',
    orange: 'bg-[#fff6eb] text-[#ff9f43] border border-[#ff9f43]/20',
    green:  'bg-[#ebfff2] text-[#2fb36d] border border-[#2fb36d]/20',
  }[tone];
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>
      {children}
    </span>
  );
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

function formatDate(s?: string): string {
  if (!s) return '—';
  const date = s.includes('T') ? s.split('T')[0] : s.split(' ')[0];
  return date || '—';
}
