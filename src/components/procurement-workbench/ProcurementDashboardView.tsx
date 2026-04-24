/**
 * 采购工作台 - 视图 A：任务总览 Dashboard
 *
 * 跨所有进行中任务聚合，展示：
 * ① 5 张 KPI 卡片（顶部色条）
 * ② 采购流程漏斗（6步）
 * ③ 进行中任务快捷卡列表
 *
 * Phase 1：KPI/漏斗数据仅来自 PR/PO 可算字段，
 *          付款/签约/电子签相关显示 — 占位。
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, ShoppingCart, ArrowRight, TrendingUp, RefreshCw } from 'lucide-react';
import type { ProcurementTask } from '../../types/procurementWorkbench';
import { fetchAllPoByTask } from '../../services/procurementPoService';
import type { PoRow } from '../../services/procurementPoService';
import { fetchPrCountStats } from '../../services/procurementPrService';

// ── 模块级聚合缓存（与 useTaskPoData 同款模式） ──────────────────────────────
// 缓存键 = 进行中任务的 id + filter 序列化，任务集合或过滤变化时自动失效
interface DashboardCacheEntry {
  key: string;
  data: Omit<AggData, 'loading'>;
}
let dashboardCache: DashboardCacheEntry | null = null;

function makeDashboardKey(tasks: ProcurementTask[]): string {
  return tasks
    .map((t) => `${t.id}::${JSON.stringify(t.filter)}`)
    .sort()
    .join('|');
}

/** 外部调用：强制清除 Dashboard 聚合缓存（如 PoTrackingModule 刷新后可联动）*/
export function invalidateDashboardCache(): void {
  dashboardCache = null;
}
// ─────────────────────────────────────────────────────────────────────────────

interface ProcurementDashboardViewProps {
  tasks: ProcurementTask[];
  onTaskSelect: (id: string) => void;
  onNewTask: () => void;
}

interface AggData {
  prTotal: number;           // PR 行项总数（全量含关闭/终止）
  prPending: number;         // PR 待转单行数（joinqty < qty）
  poOverdue: number;         // PO 逾期行数（未到齐 && remainingDays<0）
  poNearDeadline: number;    // 近期发货（remainingDays<=3 且未到齐）
  poPartial: number;         // 到货待处理（0<actqty<qty）
  poFulfilled: number;       // 已到齐（actqty >= qty，不依赖 status 字段）
  totalPo: number;           // PO 总行数
  loading: boolean;
}

const DEFAULT_AGG: AggData = {
  prTotal: 0,
  prPending: 0,
  poOverdue: 0,
  poNearDeadline: 0,
  poPartial: 0,
  poFulfilled: 0,
  totalPo: 0,
  loading: true,
};

export default function ProcurementDashboardView({
  tasks,
  onTaskSelect,
  onNewTask,
}: ProcurementDashboardViewProps) {
  const activeTasks = tasks.filter((t) => t.status === 'active');
  const cacheKey = makeDashboardKey(activeTasks);

  // 若缓存命中，直接以缓存数据作为初始状态（无需 loading）
  const [agg, setAgg] = useState<AggData>(() => {
    if (activeTasks.length === 0) return { ...DEFAULT_AGG, loading: false };
    if (dashboardCache && dashboardCache.key === cacheKey) {
      return { ...dashboardCache.data, loading: false };
    }
    return DEFAULT_AGG;
  });

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async (forceReload = false) => {
    if (activeTasks.length === 0) {
      setAgg({ ...DEFAULT_AGG, loading: false });
      return;
    }

    // 缓存命中且非强制刷新 → 直接使用缓存，跳过请求
    if (!forceReload && dashboardCache && dashboardCache.key === cacheKey) {
      setAgg({ ...dashboardCache.data, loading: false });
      return;
    }

    if (forceReload) dashboardCache = null;

    setAgg((prev) => ({ ...prev, loading: true }));
    try {
      // PR 统计与 PO 取数并行，互不阻塞
      const [prResults, poResults] = await Promise.all([
        Promise.allSettled(
          activeTasks.map((t) => fetchPrCountStats(t.filter)),
        ),
        Promise.allSettled(
          activeTasks.map((t) =>
            fetchAllPoByTask(t.filter, { includeClosed: true }).then((r) => r.rows),
          ),
        ),
      ]);

      if (!mountedRef.current) return;

      // 汇总 PR 统计
      let prTotal = 0;
      let prPending = 0;
      for (const r of prResults) {
        if (r.status !== 'fulfilled') continue;
        prTotal += r.value.totalRows;
        prPending += r.value.pendingRows;
      }

      // 汇总 PO 统计
      let poOverdue = 0;
      let poNearDeadline = 0;
      let poPartial = 0;
      let poFulfilled = 0;
      let totalPo = 0;

      for (const result of poResults) {
        if (result.status !== 'fulfilled') continue;
        const rows: PoRow[] = result.value;
        totalPo += rows.length;
        for (const row of rows) {
          // 已到齐：用 actqty >= qty（与 PoTrackingModule 口径一致，避免因 ERP 关单漏计）
          const isActuallyFulfilled = row.qty > 0 && row.actqty >= row.qty;
          if (isActuallyFulfilled) {
            poFulfilled++;
            continue;
          }
          if (row.status === 'partial' || row.status === 'partial_overdue') poPartial++;
          if (row.status === 'partial_overdue' || row.status === 'pending_overdue') poOverdue++;
          if (
            row.remainingDays !== null &&
            row.remainingDays <= 3 &&
            (row.status === 'partial' ||
             row.status === 'partial_overdue' ||
             row.status === 'pending' ||
             row.status === 'pending_overdue')
          ) {
            poNearDeadline++;
          }
        }
      }

      const newData: Omit<AggData, 'loading'> = {
        prTotal, prPending, poOverdue, poNearDeadline, poPartial, poFulfilled, totalPo,
      };

      // 写入缓存
      dashboardCache = { key: cacheKey, data: newData };

      if (mountedRef.current) setAgg({ ...newData, loading: false });
    } catch {
      if (mountedRef.current) setAgg((prev) => ({ ...prev, loading: false }));
    }
  // cacheKey 已含所有 filter 信息，作为唯一依赖
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const kpiCards: KpiCardDef[] = [
    {
      label: 'PR 待转单',
      value: agg.loading ? '…' : String(agg.prPending),
      subtext: 'joinqty < qty 的 PR 行',
      tone: 'orange',
      placeholder: false,
    },
    {
      label: 'PO 逾期',
      value: agg.loading ? '…' : String(agg.poOverdue),
      subtext: '已逾期未到货行数',
      tone: 'red',
      placeholder: false,
    },
    {
      label: '付款风险',
      value: '—',
      subtext: '本期暂无数据',
      tone: 'purple',
      placeholder: true,
    },
    {
      label: '近期发货',
      value: agg.loading ? '…' : String(agg.poNearDeadline),
      subtext: '交期 ≤ 3 天待发货',
      tone: 'blue',
      placeholder: false,
    },
    {
      label: '到货待处理',
      value: agg.loading ? '…' : String(agg.poPartial),
      subtext: '部分到货未完结',
      tone: 'teal',
      placeholder: false,
    },
  ];

  const funnelSteps: FunnelStep[] = [
    {
      label: 'PR',
      value: agg.loading ? '…' : String(agg.prTotal),
      note: '行项总数',
      color: '#6c7a90',
      placeholder: false,
    },
    {
      label: 'PO',
      value: agg.loading ? '…' : String(agg.totalPo),
      note: '跟单行项',
      color: '#2f6bff',
      placeholder: false,
    },
    {
      label: '电子签',
      value: '—',
      note: '本期暂无数据',
      color: '#6c7a90',
      placeholder: true,
    },
    {
      label: '付款',
      value: '—',
      note: '本期暂无数据',
      color: '#6c7a90',
      placeholder: true,
    },
    {
      label: '发货中',
      value: agg.loading ? '…' : String(agg.poPartial),
      note: '部分到货',
      color: '#ff9f43',
      placeholder: false,
    },
    {
      label: '已入库',
      value: agg.loading ? '…' : String(agg.poFulfilled),
      note: '到货完结',
      color: '#2fb36d',
      placeholder: false,
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#f4f7fb]">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-bold text-[#1f2d3d]">任务总览</h2>
          <p className="text-xs text-[#6c7a90] mt-0.5">
            当前共 <span className="font-semibold text-[#1f2d3d]">{activeTasks.length}</span> 个进行中任务
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(true)}
            disabled={agg.loading}
            title="刷新总览数据"
            className="w-8 h-8 flex items-center justify-center text-[#6c7a90] hover:text-[#2f6bff] hover:bg-[#eef4ff] rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={agg.loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={onNewTask}
            className="flex items-center gap-1.5 h-8 px-4 text-xs font-semibold text-white bg-[#2f6bff] hover:bg-[#2558e0] rounded-xl transition-colors shadow-sm"
          >
            <Plus size={13} />
            新建任务
          </button>
        </div>
      </div>

      {/* ① KPI 卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
        {kpiCards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>

      {/* ② 流程漏斗 */}
      <div className="bg-white rounded-2xl border border-[#e5ebf3] shadow-[0_8px_24px_rgba(26,48,92,0.07)] p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={15} className="text-[#2f6bff]" />
          <h3 className="text-sm font-bold text-[#1f2d3d]">采购全流程进度</h3>
        </div>
        <div className="flex items-stretch gap-0 overflow-x-auto">
          {funnelSteps.map((step, idx) => (
            <FunnelStepCard
              key={step.label}
              step={step}
              isLast={idx === funnelSteps.length - 1}
            />
          ))}
        </div>
      </div>

      {/* ③ 进行中任务快捷卡 */}
      {activeTasks.length === 0 ? (
        <EmptyDashboard onNewTask={onNewTask} />
      ) : (
        <div>
          <h3 className="text-xs font-semibold text-[#6c7a90] uppercase tracking-wider mb-3">
            进行中任务
          </h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {activeTasks.map((task) => (
              <TaskQuickCard
                key={task.id}
                task={task}
                onSelect={() => onTaskSelect(task.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- KPI 卡片 ---------- */
interface KpiCardDef {
  label: string;
  value: string;
  subtext: string;
  tone: 'orange' | 'red' | 'purple' | 'blue' | 'teal';
  placeholder: boolean;
}

const KPI_TONE_COLORS: Record<KpiCardDef['tone'], { bar: string; num: string; bg: string }> = {
  orange: { bar: '#ff9f43', num: '#ff9f43', bg: '#fff6eb' },
  red:    { bar: '#f25f5c', num: '#f25f5c', bg: '#fff2f1' },
  purple: { bar: '#7b61ff', num: '#7b61ff', bg: '#f3f0ff' },
  blue:   { bar: '#2f6bff', num: '#2f6bff', bg: '#eef4ff' },
  teal:   { bar: '#00a6a6', num: '#00a6a6', bg: '#e6fafa' },
};

function KpiCard({ label, value, subtext, tone, placeholder }: KpiCardDef) {
  const c = KPI_TONE_COLORS[tone];
  return (
    <div
      className="bg-white rounded-2xl border border-[#e5ebf3] shadow-[0_8px_24px_rgba(26,48,92,0.07)] overflow-hidden hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* 3px 顶部色条 */}
      <div className="h-[3px]" style={{ backgroundColor: c.bar }} />
      <div className="p-4">
        <div
          className="text-2xl font-bold mb-1 leading-none"
          style={{ color: placeholder ? '#6c7a90' : c.num }}
        >
          {value}
        </div>
        <div className="text-xs font-semibold text-[#1f2d3d] mb-0.5">{label}</div>
        <div className="text-[10px] text-[#6c7a90] leading-snug">{subtext}</div>
      </div>
    </div>
  );
}

/* ---------- 漏斗步骤 ---------- */
interface FunnelStep {
  label: string;
  value: string;
  note: string;
  color: string;
  placeholder: boolean;
}

function FunnelStepCard({
  step,
  isLast,
}: {
  step: FunnelStep;
  isLast: boolean;
}) {
  return (
    <div className="flex items-center gap-0 flex-1 min-w-0">
      <div className="flex-1 text-center px-3 py-2 min-w-0">
        <div
          className="text-xl font-bold mb-0.5 leading-none"
          style={{ color: step.placeholder ? '#6c7a90' : step.color }}
        >
          {step.value}
        </div>
        <div className="text-xs font-semibold text-[#1f2d3d] mb-0.5">{step.label}</div>
        <div className="text-[10px] text-[#6c7a90]">{step.note}</div>
        {/* 进度条 */}
        <div className="mt-2 h-1 bg-[#f4f7fb] rounded-full overflow-hidden mx-2">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              backgroundColor: step.placeholder ? '#e5ebf3' : step.color,
              width: step.placeholder ? '0%' : '100%',
              opacity: step.placeholder ? 1 : 0.4,
            }}
          />
        </div>
      </div>
      {!isLast && (
        <div className="text-[#e5ebf3] text-lg flex-shrink-0 select-none">›</div>
      )}
    </div>
  );
}

/* ---------- 任务快捷卡 ---------- */
function TaskQuickCard({
  task,
  onSelect,
}: {
  task: ProcurementTask;
  onSelect: () => void;
}) {
  const f = task.filter;
  const filterItems = [
    { label: 'PR单号', count: f.prBillnos.length },
    { label: '项目号', count: f.projectIds.length },
    { label: '物料编码', count: f.materialNumbers.length },
    { label: '物料名称', count: f.materialNames.length },
  ].filter((it) => it.count > 0);

  const demandDateCount = Object.keys(task.prDemandDates).length;

  return (
    <div className="bg-white rounded-2xl border border-[#e5ebf3] shadow-[0_8px_24px_rgba(26,48,92,0.07)] overflow-hidden hover:-translate-y-0.5 transition-all duration-200">
      <div className="h-[3px] bg-[#2f6bff]" />
      <div className="p-4">
        <h4 className="text-sm font-bold text-[#1f2d3d] mb-2 leading-snug">{task.name}</h4>

        {filterItems.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            {filterItems.map((it) => (
              <span
                key={it.label}
                className="text-[10px] text-[#6c7a90] bg-[#f4f7fb] border border-[#e5ebf3] px-2 py-0.5 rounded-lg"
              >
                {it.label} <span className="font-semibold text-[#2f6bff]">{it.count}</span>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[#6c7a90]">
            需求日期 <span className="font-semibold text-[#1f2d3d]">{demandDateCount}</span> 条
          </span>
          <button
            onClick={onSelect}
            className="flex items-center gap-1 text-xs font-semibold text-[#2f6bff] hover:text-[#2558e0] transition-colors"
          >
            进入跟单
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- 无任务空状态 ---------- */
function EmptyDashboard({ onNewTask }: { onNewTask: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[260px] text-center">
      <div className="w-14 h-14 rounded-2xl bg-[#eef4ff] text-[#2f6bff] flex items-center justify-center mb-4">
        <ShoppingCart size={24} />
      </div>
      <h3 className="text-sm font-bold text-[#1f2d3d] mb-1">尚无采购跟单任务</h3>
      <p className="text-xs text-[#6c7a90] mb-4 max-w-xs leading-relaxed">
        新建任务时勾选 PR 明细；任务过滤维度与关键词命中字段一致（单号 / 项目号 / 物料编码 / 物料名称）。
      </p>
      <button
        onClick={onNewTask}
        className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2f6bff] hover:bg-[#2558e0] rounded-xl transition-colors"
      >
        <Plus size={13} />
        新建任务
      </button>
    </div>
  );
}
