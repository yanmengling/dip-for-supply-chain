/**
 * 采购工作台 - 新建任务视图（视图 D）
 *
 * 与「PR 跟单」对齐：ModuleCard、表单行、表格列（数量 / 已转 PO / 审核日期 / 状态等）、游标分页。
 * 全选 / 取消勾选 / 添加选中 位于关键词行下方左侧；关键词搜索无条数上限，分页拉取。
 * 已加入列表分页展示。添加时按当前关键词在「单号→项目号→物料编码→物料名称」上的命中优先级
 * 记录任务依据；创建任务时写入对应 ProcurementTaskFilter 维度，与 PR 跟单 buildPrCondition 一致。
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Loader2,
  ClipboardList,
  ArrowLeft,
  Trash2,
  AlertCircle,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  isFilterEmpty,
  type CreateTaskInput,
  type ProcurementTask,
  type ProcurementTaskFilter,
} from '../../types/procurementWorkbench';
import { procurementTaskService } from '../../services/procurementTaskService';
import { searchPrRecordsPage, type PrRow } from '../../services/procurementPrService';
import ModuleCard from './modules/ModuleCard';

interface CreateTaskPanelProps {
  onCreated: (task: ProcurementTask) => void;
  onCancel: () => void;
}

const DEBOUNCE_MS = 300;
const PAGE_SIZE = 10;
const SCOPE_PAGE_SIZE = 10;

/** 与关键词命中优先级一致，决定写入任务的过滤维度 */
type PrScopeMatchKind = 'billno' | 'project' | 'materialNumber' | 'materialName';

interface ScopedPrRow {
  key: string;
  record: PrRow;
  matchKind: PrScopeMatchKind;
}

const MATCH_KIND_LABEL: Record<PrScopeMatchKind, string> = {
  billno: 'PR单号',
  project: '项目号',
  materialNumber: '物料编码',
  materialName: '物料名称',
};

/** 与搜索 OR 条件顺序对齐：先命中单号则按单号建任务过滤，否则项目号、物料编码、物料名称 */
function classifyMatchKind(record: PrRow, keyword: string): PrScopeMatchKind {
  const k = keyword.trim().toLowerCase();
  if (!k) return 'billno';
  if ((record.billno ?? '').toLowerCase().includes(k)) return 'billno';
  if ((record.huid_xmh_name ?? '').toLowerCase().includes(k)) return 'project';
  if ((record.material_number ?? '').toLowerCase().includes(k)) return 'materialNumber';
  if ((record.material_name ?? '').toLowerCase().includes(k)) return 'materialName';
  return 'billno';
}

function resultRowKey(row: PrRow, pageIndex: number, idx: number): string {
  return row.entry_id || `__r_${pageIndex}_${idx}`;
}

function stableScopeKey(r: PrRow): string {
  if (r.entry_id) return r.entry_id;
  return [r.billno, r.huid_xmh_name, r.material_number, r.material_name].join('\u0001');
}

function deriveFilterFromScopeRows(rows: ScopedPrRow[]): ProcurementTaskFilter {
  const prBillnos = new Set<string>();
  const projectIds = new Set<string>();
  const materialNumbers = new Set<string>();
  const materialNames = new Set<string>();
  for (const { record, matchKind } of rows) {
    switch (matchKind) {
      case 'billno': {
        const v = (record.billno ?? '').trim();
        if (v) prBillnos.add(v);
        break;
      }
      case 'project': {
        const v = (record.huid_xmh_name ?? '').trim();
        if (v) projectIds.add(v);
        break;
      }
      case 'materialNumber': {
        const v = (record.material_number ?? '').trim();
        if (v) materialNumbers.add(v);
        break;
      }
      case 'materialName': {
        const v = (record.material_name ?? '').trim();
        if (v) materialNames.add(v);
        break;
      }
    }
  }
  return {
    prBillnos: Array.from(prBillnos),
    projectIds: Array.from(projectIds),
    materialNumbers: Array.from(materialNumbers),
    materialNames: Array.from(materialNames),
  };
}

export default function CreateTaskPanel({ onCreated, onCancel }: CreateTaskPanelProps) {
  const [name, setName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [searchKey, setSearchKey] = useState('');
  const [isDebouncing, setIsDebouncing] = useState(false);

  const [results, setResults] = useState<PrRow[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const [scopeRows, setScopeRows] = useState<ScopedPrRow[]>([]);
  const [scopePageIndex, setScopePageIndex] = useState(0);

  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const searchKeyRef = useRef('');
  const cursorStackRef = useRef<Array<unknown[] | undefined>>([undefined]);
  const knownTotalRef = useRef(0);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    searchKeyRef.current = searchKey;
  }, [searchKey]);

  const reset = useCallback(() => {
    setName('');
    setKeyword('');
    setSearchKey('');
    setIsDebouncing(false);
    setResults([]);
    setSearchTotal(0);
    setSearchLoading(false);
    setSearchError(null);
    setSelectedKeys(new Set());
    setPageIndex(0);
    cursorStackRef.current = [undefined];
    knownTotalRef.current = 0;
    setScopeRows([]);
    setScopePageIndex(0);
    setError(null);
  }, []);

  useEffect(() => {
    const kw = keyword.trim();
    if (!kw) {
      setSearchKey('');
      setIsDebouncing(false);
      return;
    }
    setIsDebouncing(true);
    const t = setTimeout(() => {
      setSearchKey(kw);
      setIsDebouncing(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [keyword]);

  const loadSearchPage = useCallback(async (targetIndex: number, stack: Array<unknown[] | undefined>) => {
    const sk = searchKeyRef.current;
    if (!sk) return;
    setSearchLoading(true);
    setSearchError(null);
    setSelectedKeys(new Set());
    try {
      const cursor = stack[targetIndex];
      const result = await searchPrRecordsPage(sk, { pageSize: PAGE_SIZE, cursor });
      setResults(result.rows);
      setSearchTotal(result.total);
      if (targetIndex === 0 || result.total > PAGE_SIZE) {
        knownTotalRef.current = result.total;
      }
      if (result.nextCursor && stack.length === targetIndex + 1) {
        cursorStackRef.current = [...stack, result.nextCursor];
      } else {
        cursorStackRef.current = stack;
      }
      setPageIndex(targetIndex);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : '查询失败');
      setResults([]);
      setSearchTotal(0);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!searchKey) {
      setResults([]);
      setSearchTotal(0);
      setSearchError(null);
      setSearchLoading(false);
      cursorStackRef.current = [undefined];
      setPageIndex(0);
      knownTotalRef.current = 0;
      return;
    }
    setResults([]);
    setSearchTotal(0);
    knownTotalRef.current = 0;
    cursorStackRef.current = [undefined];
    setPageIndex(0);
    void loadSearchPage(0, [undefined]);
  }, [searchKey, loadSearchPage]);

  useEffect(() => {
    const maxP = Math.max(0, Math.ceil(scopeRows.length / SCOPE_PAGE_SIZE) - 1);
    setScopePageIndex((p) => Math.min(p, maxP));
  }, [scopeRows.length]);

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllResults = () => {
    if (results.length === 0) return;
    if (selectedKeys.size === results.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(results.map((row, idx) => resultRowKey(row, pageIndex, idx))));
    }
  };

  const clearSelection = () => setSelectedKeys(new Set());

  const addSelectedToScope = () => {
    if (selectedKeys.size === 0 || !searchKey.trim()) return;
    const kw = searchKey;
    setScopeRows((prev) => {
      const existing = new Set(prev.map((r) => r.key));
      const next = [...prev];
      results.forEach((row, idx) => {
        if (!selectedKeys.has(resultRowKey(row, pageIndex, idx))) return;
        const key = stableScopeKey(row);
        if (existing.has(key)) return;
        existing.add(key);
        const matchKind = classifyMatchKind(row, kw);
        next.push({ key, record: { ...row }, matchKind });
      });
      return next;
    });
    setSelectedKeys(new Set());
  };

  const removeScopeRow = (key: string) => {
    setScopeRows((prev) => prev.filter((r) => r.key !== key));
  };

  const displayTotal = knownTotalRef.current > 0 ? knownTotalRef.current : searchTotal;
  const hasNext = pageIndex + 1 < cursorStackRef.current.length;
  const hasPrev = pageIndex > 0;
  const startNo = displayTotal === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const endNo = Math.min(displayTotal, pageIndex * PAGE_SIZE + results.length);

  const goFirst = () => {
    if (!hasPrev || searchLoading) return;
    setPageIndex(0);
    void loadSearchPage(0, cursorStackRef.current);
  };
  const goPrev = () => {
    if (!hasPrev || searchLoading) return;
    const idx = pageIndex - 1;
    void loadSearchPage(idx, cursorStackRef.current);
  };
  const goNext = () => {
    if (!hasNext || searchLoading) return;
    const idx = pageIndex + 1;
    void loadSearchPage(idx, cursorStackRef.current);
  };

  const retrySearch = () => {
    if (!searchKey) return;
    void loadSearchPage(pageIndex, cursorStackRef.current);
  };

  const selectedCount = selectedKeys.size;
  const scopeCount = scopeRows.length;
  const scopeOffset = scopePageIndex * SCOPE_PAGE_SIZE;
  const scopePageRows = scopeRows.slice(scopeOffset, scopeOffset + SCOPE_PAGE_SIZE);
  const scopeDisplayTotal = scopeRows.length;
  const scopeHasPrev = scopePageIndex > 0;
  const scopeHasNext = scopeOffset + SCOPE_PAGE_SIZE < scopeRows.length;
  const scopeStartNo = scopeDisplayTotal === 0 ? 0 : scopeOffset + 1;
  const scopeEndNo = Math.min(scopeDisplayTotal, scopeOffset + scopePageRows.length);

  const handleSubmit = () => {
    setError(null);
    const invalidField = scopeRows.filter(({ record, matchKind }) => {
      switch (matchKind) {
        case 'billno':
          return !(record.billno ?? '').trim();
        case 'project':
          return !(record.huid_xmh_name ?? '').trim();
        case 'materialNumber':
          return !(record.material_number ?? '').trim();
        case 'materialName':
          return !(record.material_name ?? '').trim();
        default:
          return true;
      }
    });
    if (invalidField.length > 0) {
      setError(
        `有 ${invalidField.length} 条明细缺少与任务依据（${MATCH_KIND_LABEL[invalidField[0].matchKind]}）对应的字段，请从列表中移除后重试。`,
      );
      return;
    }
    const filter = deriveFilterFromScopeRows(scopeRows);
    if (isFilterEmpty(filter)) {
      setError('请至少添加一条 PR 明细（勾选搜索结果后点击「添加选中到列表」）');
      return;
    }
    const input: CreateTaskInput = {
      name: name.trim() || `采购跟单任务-${new Date().toLocaleString('zh-CN')}`,
      filter,
    };
    const task = procurementTaskService.create(input);
    procurementTaskService.setActiveTaskId(task.id);
    reset();
    onCreated(task);
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const kwTrim = keyword.trim();
  const showSearchTable = Boolean(searchKey) && !searchError && !(searchLoading && results.length === 0);
  const showSearchLoading = Boolean(searchKey) && searchLoading && results.length === 0;
  const showSearchEmpty =
    Boolean(searchKey) && !searchLoading && !searchError && results.length === 0;

  return (
    <div className="flex-1 overflow-y-auto bg-[#f4f7fb]">
      <div className="w-full max-w-6xl mx-auto px-6 sm:px-8 py-8 space-y-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCancel}
            className="flex items-center gap-1 text-xs text-[#6c7a90] hover:text-[#2f6bff] transition-colors"
          >
            <ArrowLeft size={14} />
            返回
          </button>

          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#eef4ff] text-[#2f6bff] flex items-center justify-center flex-shrink-0">
              <ClipboardList size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-[#1f2d3d]">新建采购跟单任务</h2>
              <p className="text-xs text-[#6c7a90] mt-0.5">
                添加至列表时，按当前关键词命中字段（单号→项目号→物料编码→物料名称）决定任务过滤维度，与 PR 跟单一致；关键词 OR 匹配，支持分页
              </p>
            </div>
          </div>
        </div>

        <ModuleCard
          title="搜索 PR 记录"
          subtitle="关键词 OR 匹配单号 / 项目号 / 物料编码 / 物料名称 · 服务端分页"
          badgeTone="blue"
        >
          <div className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-2 items-center mb-3">
            <label htmlFor="create-task-pr-keyword" className="text-xs text-[#6c7a90] text-right shrink-0">
              关键词
            </label>
            <div className="relative min-w-0 max-w-xl">
              <Search
                size={12}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6c7a90] pointer-events-none"
              />
              {(searchLoading || isDebouncing) && kwTrim && (
                <Loader2
                  size={12}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#2f6bff] animate-spin pointer-events-none"
                />
              )}
              <input
                id="create-task-pr-keyword"
                ref={inputRef}
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="PR 单号 / 项目号 / 物料编码 / 物料名称"
                className="w-full h-7 pl-7 pr-8 text-xs rounded-xl border border-[#e5ebf3] bg-[#f4f7fb] text-slate-700 placeholder-[#6c7a90] focus:outline-none focus:ring-2 focus:ring-[#2f6bff]/30 focus:border-[#2f6bff] transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button
              type="button"
              onClick={toggleAllResults}
              disabled={results.length === 0 || searchLoading}
              className="px-2.5 py-1 text-xs font-medium text-[#6c7a90] bg-white border border-[#e5ebf3] rounded-lg hover:bg-[#f4f7fb] hover:text-[#2f6bff] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {results.length > 0 && selectedKeys.size === results.length ? '取消全选' : '全选当前页'}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedCount === 0}
              className="px-2.5 py-1 text-xs font-medium text-[#6c7a90] bg-white border border-[#e5ebf3] rounded-lg hover:bg-[#f4f7fb] hover:text-[#2f6bff] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              取消勾选
            </button>
            <button
              type="button"
              onClick={addSelectedToScope}
              disabled={selectedCount === 0 || !searchKey.trim()}
              title={!searchKey.trim() ? '请先输入并稳定关键词后再添加' : undefined}
              className="px-2.5 py-1 text-xs font-medium text-white bg-[#2f6bff] rounded-lg hover:bg-[#2558e0] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
            >
              添加选中到列表{selectedCount > 0 ? ` (${selectedCount})` : ''}
            </button>
          </div>
          {searchKey.trim() ? (
            <p className="mb-3 text-[10px] text-[#6c7a90] leading-relaxed">
              说明：命中 <span className="font-semibold text-[#1f2d3d]">PR 单号</span> 则任务过滤用单号；命中{' '}
              <span className="font-semibold text-[#1f2d3d]">项目号</span> 则用项目号；命中{' '}
              <span className="font-semibold text-[#1f2d3d]">物料编码</span> 或{' '}
              <span className="font-semibold text-[#1f2d3d]">物料名称</span> 则分别写入对应维度（与跟单任务 OR / IN 逻辑一致）。
            </p>
          ) : null}

          {!kwTrim ? (
            <EmptyBlock text="请输入关键词，系统将分页展示匹配的 PR 明细" />
          ) : isDebouncing && !searchKey ? (
            <LoadingBlock text="等待输入稳定…" />
          ) : searchError ? (
            <SearchErrorBlock message={searchError} onRetry={retrySearch} />
          ) : showSearchLoading ? (
            <LoadingBlock text="搜索中…" />
          ) : showSearchEmpty ? (
            <EmptyBlock text="未找到匹配的 PR 记录" />
          ) : showSearchTable ? (
            <>
              <div className="overflow-x-auto -mx-1">
                <table className="min-w-[1000px] w-full text-xs">
                  <thead className="bg-[#f4f7fb] text-[#6c7a90]">
                    <tr>
                      <Th className="w-8">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={results.length > 0 && selectedKeys.size === results.length}
                          ref={(el) => {
                            if (el) {
                              el.indeterminate =
                                selectedKeys.size > 0 && selectedKeys.size < results.length;
                            }
                          }}
                          onChange={toggleAllResults}
                          title="全选当前页"
                          disabled={searchLoading}
                        />
                      </Th>
                      <Th className="w-32">单号</Th>
                      <Th className="min-w-[10rem] whitespace-nowrap" title="生产项目号（huid_xmh_name）">
                        项目号
                      </Th>
                      <Th className="w-32">物料编码</Th>
                      <Th className="min-w-[120px]">物料名称</Th>
                      <Th className="w-20 text-right">数量</Th>
                      <Th className="w-20 text-right">已转 PO</Th>
                      <Th className="w-24">审核日期</Th>
                      <Th className="w-20">状态</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f4f7fb] text-slate-700">
                    {results.map((row, idx) => {
                      const rk = resultRowKey(row, pageIndex, idx);
                      const checked = selectedKeys.has(rk);
                      const closed = row.rowclosestatus_title === '已关闭';
                      const terminated = row.rowterminatestatus_title === '已终止';
                      return (
                        <tr
                          key={rk}
                          className={`hover:bg-[#f4f7fb]/70 ${checked ? 'bg-[#eef4ff]' : ''}`}
                        >
                          <Td>
                            <input
                              type="checkbox"
                              className="rounded"
                              checked={checked}
                              onChange={() => toggleKey(rk)}
                              disabled={searchLoading}
                            />
                          </Td>
                          <Td>
                            <span className="font-mono text-[#2f6bff]">{row.billno || '—'}</span>
                          </Td>
                          <ProjectNoCell value={row.huid_xmh_name} />
                          <Td>
                            <span className="font-mono">{row.material_number || '—'}</span>
                          </Td>
                          <Td className="truncate max-w-[200px]" title={row.material_name}>
                            {row.material_name || '—'}
                          </Td>
                          <Td className="text-right tabular-nums">{formatQty(row.qty)}</Td>
                          <Td className="text-right tabular-nums">
                            <span className={row.joinqty < row.qty ? 'text-[#ff9f43]' : 'text-[#2fb36d]'}>
                              {formatQty(row.joinqty)}
                            </span>
                          </Td>
                          <Td className="text-[#6c7a90]">{formatDate(row.auditdate)}</Td>
                          <Td>
                            {closed ? (
                              <StatusTag tone="gray">已关闭</StatusTag>
                            ) : terminated ? (
                              <StatusTag tone="orange">已终止</StatusTag>
                            ) : (
                              <StatusTag tone="green">进行中</StatusTag>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#f4f7fb] text-xs text-[#6c7a90]">
                <span>
                  第 <span className="font-semibold text-[#1f2d3d]">{startNo}–{endNo}</span> 条 / 共{' '}
                  <span className="font-semibold text-[#1f2d3d]">{displayTotal}</span> 条
                  {searchLoading && results.length > 0 ? (
                    <Loader2 className="inline w-3 h-3 ml-1 animate-spin text-[#2f6bff]" />
                  ) : null}
                </span>
                <div className="flex items-center gap-1">
                  <PageBtn onClick={goFirst} disabled={!hasPrev || searchLoading} title="首页">
                    <ChevronsLeft size={13} />
                  </PageBtn>
                  <PageBtn onClick={goPrev} disabled={!hasPrev || searchLoading} title="上一页">
                    <ChevronLeft size={13} />
                  </PageBtn>
                  <span className="px-2 text-[#6c7a90] min-w-[60px] text-center">
                    第 <span className="font-semibold text-[#1f2d3d]">{pageIndex + 1}</span> 页
                  </span>
                  <PageBtn onClick={goNext} disabled={!hasNext || searchLoading} title="下一页">
                    <ChevronRight size={13} />
                  </PageBtn>
                  <PageBtn disabled title="末页（游标分页不支持直接跳末页）">
                    <ChevronsRight size={13} />
                  </PageBtn>
                </div>
              </div>
            </>
          ) : null}
        </ModuleCard>

        <ModuleCard
          title="已加入任务的 PR 明细"
          subtitle={
            scopeCount > 0
              ? `${scopeCount} 条 · 保存时按「任务依据」列合并为过滤条件（与 PR 跟单）· 本地分页`
              : '创建任务前至少添加一条'
          }
          badge={scopeCount > 0 ? String(scopeCount) : undefined}
          badgeTone="blue"
        >
          {scopeCount === 0 ? (
            <EmptyBlock text="尚未添加：在上方搜索结果中勾选行，点击「添加选中到列表」" />
          ) : (
            <>
              <div className="overflow-x-auto -mx-1">
                <table className="min-w-[1120px] w-full text-xs">
                  <thead className="bg-[#f4f7fb] text-[#6c7a90]">
                    <tr>
                      <Th className="w-10">#</Th>
                      <Th className="w-[5.5rem] whitespace-nowrap" title="由当前关键词在本行上的命中字段决定，与任务过滤维度一致">
                        任务依据
                      </Th>
                      <Th className="w-32">单号</Th>
                      <Th className="min-w-[10rem] whitespace-nowrap" title="生产项目号（huid_xmh_name）">
                        项目号
                      </Th>
                      <Th className="w-32">物料编码</Th>
                      <Th className="min-w-[120px]">物料名称</Th>
                      <Th className="w-20 text-right">数量</Th>
                      <Th className="w-20 text-right">已转 PO</Th>
                      <Th className="w-24">审核日期</Th>
                      <Th className="w-20">状态</Th>
                      <Th className="w-16 text-center">操作</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f4f7fb] text-slate-700">
                    {scopePageRows.map((row, i) => {
                      const globalIdx = scopeOffset + i;
                      const r = row.record;
                      const closed = r.rowclosestatus_title === '已关闭';
                      const terminated = r.rowterminatestatus_title === '已终止';
                      return (
                        <tr key={row.key} className="hover:bg-[#f4f7fb]/70">
                          <Td className="tabular-nums text-[#6c7a90]">{globalIdx + 1}</Td>
                          <Td>
                            <span className="inline-flex px-1.5 py-0.5 rounded-md bg-[#eef4ff] text-[#2f6bff] text-[10px] font-semibold whitespace-nowrap">
                              {MATCH_KIND_LABEL[row.matchKind]}
                            </span>
                          </Td>
                          <Td>
                            <span className="font-mono text-[#2f6bff]">{r.billno || '—'}</span>
                          </Td>
                          <ProjectNoCell value={r.huid_xmh_name} />
                          <Td>
                            <span className="font-mono">{r.material_number || '—'}</span>
                          </Td>
                          <Td className="truncate max-w-[200px]" title={r.material_name}>
                            {r.material_name || '—'}
                          </Td>
                          <Td className="text-right tabular-nums">{formatQty(r.qty)}</Td>
                          <Td className="text-right tabular-nums">
                            <span className={r.joinqty < r.qty ? 'text-[#ff9f43]' : 'text-[#2fb36d]'}>
                              {formatQty(r.joinqty)}
                            </span>
                          </Td>
                          <Td className="text-[#6c7a90]">{formatDate(r.auditdate)}</Td>
                          <Td>
                            {closed ? (
                              <StatusTag tone="gray">已关闭</StatusTag>
                            ) : terminated ? (
                              <StatusTag tone="orange">已终止</StatusTag>
                            ) : (
                              <StatusTag tone="green">进行中</StatusTag>
                            )}
                          </Td>
                          <Td className="text-center">
                            <button
                              type="button"
                              onClick={() => removeScopeRow(row.key)}
                              className="inline-flex items-center justify-center p-1 rounded-lg text-[#6c7a90] hover:text-[#f25f5c] hover:bg-[#fff2f1] transition-colors"
                              title="从列表移除"
                            >
                              <Trash2 size={13} strokeWidth={2} />
                            </button>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {scopeDisplayTotal > SCOPE_PAGE_SIZE && (
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#f4f7fb] text-xs text-[#6c7a90]">
                  <span>
                    第 <span className="font-semibold text-[#1f2d3d]">{scopeStartNo}–{scopeEndNo}</span> 条 / 共{' '}
                    <span className="font-semibold text-[#1f2d3d]">{scopeDisplayTotal}</span> 条
                  </span>
                  <div className="flex items-center gap-1">
                    <PageBtn
                      onClick={() => setScopePageIndex(0)}
                      disabled={!scopeHasPrev}
                      title="首页"
                    >
                      <ChevronsLeft size={13} />
                    </PageBtn>
                    <PageBtn
                      onClick={() => setScopePageIndex((p) => Math.max(0, p - 1))}
                      disabled={!scopeHasPrev}
                      title="上一页"
                    >
                      <ChevronLeft size={13} />
                    </PageBtn>
                    <span className="px-2 min-w-[72px] text-center">
                      第 <span className="font-semibold text-[#1f2d3d]">{scopePageIndex + 1}</span> /{' '}
                      {Math.ceil(scopeDisplayTotal / SCOPE_PAGE_SIZE)} 页
                    </span>
                    <PageBtn
                      onClick={() =>
                        setScopePageIndex((p) =>
                          Math.min(Math.ceil(scopeDisplayTotal / SCOPE_PAGE_SIZE) - 1, p + 1),
                        )
                      }
                      disabled={!scopeHasNext}
                      title="下一页"
                    >
                      <ChevronRight size={13} />
                    </PageBtn>
                    <PageBtn
                      onClick={() =>
                        setScopePageIndex(Math.max(0, Math.ceil(scopeDisplayTotal / SCOPE_PAGE_SIZE) - 1))
                      }
                      disabled={!scopeHasNext}
                      title="末页"
                    >
                      <ChevronsRight size={13} />
                    </PageBtn>
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="mt-3 rounded-xl bg-[#fff2f1] border border-[#f25f5c]/20 px-3 py-2 text-xs text-[#f25f5c]">
              {error}
            </div>
          )}
        </ModuleCard>

        <div className="bg-white rounded-2xl border border-[#e5ebf3] shadow-[0_8px_24px_rgba(26,48,92,0.07)] px-5 py-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1 min-w-0 space-y-1.5 max-w-xl">
            <label className="block text-xs font-semibold text-[#1f2d3d]">
              任务名称
              <span className="ml-1.5 font-normal text-[#6c7a90]">选填，留空将自动生成</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：华为 Q2 期 PR 跟单"
              className="w-full h-7 px-3 text-xs rounded-xl border border-[#e5ebf3] bg-[#f4f7fb] text-slate-700 placeholder-[#6c7a90] focus:outline-none focus:ring-2 focus:ring-[#2f6bff]/30 focus:border-[#2f6bff] transition-colors"
            />
          </div>
          <div className="flex items-center justify-end gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleCancel}
              className="h-8 px-5 text-sm font-medium text-[#6c7a90] bg-white border border-[#e5ebf3] rounded-xl hover:border-[#2f6bff]/30 hover:text-[#2f6bff] transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={scopeCount === 0}
              className="h-8 px-5 text-sm font-semibold text-white bg-[#2f6bff] hover:bg-[#2558e0] rounded-xl transition-colors disabled:bg-[#6c7a90] disabled:cursor-not-allowed shadow-sm"
            >
              创建任务
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-7 h-7 flex items-center justify-center border border-[#e5ebf3] rounded-lg text-[#6c7a90] hover:bg-[#eef4ff] hover:text-[#2f6bff] hover:border-[#2f6bff]/30 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

function Th({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return <th className={`px-2 py-2 text-left font-medium text-[11px] ${className}`} title={title}>{children}</th>;
}

function Td({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <td className={`px-2 py-1.5 ${className}`} title={title}>
      {children}
    </td>
  );
}

/** 生产项目号列：与 PR 跟单同源，保证列表中项目号可读（含空值提示） */
function ProjectNoCell({ value }: { value?: string }) {
  const v = (value ?? '').trim();
  return (
    <Td
      className={`align-middle ${v ? 'text-[#1f2d3d]' : 'text-[#6c7a90]'}`}
      title={v ? `项目号：${v}` : '未填写生产项目号（huid_xmh_name）'}
    >
      {v ? (
        <span className="font-mono text-[11px] whitespace-nowrap">{v}</span>
      ) : (
        <span className="text-[11px]">—</span>
      )}
    </Td>
  );
}

function StatusTag({ children, tone }: { children: React.ReactNode; tone: 'gray' | 'orange' | 'green' }) {
  const cls = {
    gray: 'bg-slate-100 text-[#6c7a90]',
    orange: 'bg-[#fff6eb] text-[#ff9f43] border border-[#ff9f43]/20',
    green: 'bg-[#ebfff2] text-[#2fb36d] border border-[#2fb36d]/20',
  }[tone];
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{children}</span>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center min-h-[100px] text-xs text-[#6c7a90] bg-[#f4f7fb] rounded-xl border border-dashed border-[#e5ebf3] px-4 py-6 text-center leading-relaxed">
      {text}
    </div>
  );
}

function LoadingBlock({ text = '搜索中…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[100px] text-xs text-[#6c7a90] gap-2">
      <Loader2 className="w-4 h-4 animate-spin text-[#2f6bff]" />
      {text}
    </div>
  );
}

function SearchErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[100px] text-xs text-[#f25f5c] gap-2">
      <AlertCircle className="w-5 h-5" />
      <span>{message}</span>
      <button
        type="button"
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
