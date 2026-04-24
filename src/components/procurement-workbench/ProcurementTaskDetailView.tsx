/**
 * 采购工作台 - 视图 C：任务详情（6 模块 Tab 切换）
 *
 * - 头部单行：返回、状态、名称、过滤摘要、展开详情、需求日期/创建时间、刷新
 * - Tab 采用"全部挂载 + CSS 显隐"策略，切换时保留各模块已加载的数据/分页状态
 * - 点击「刷新」时更新 refreshKey，强制重挂载所有模块
 */

import { useRef, useState } from 'react';
import { ChevronLeft, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import type { ProcurementTask } from '../../types/procurementWorkbench';

import PrTrackingModule from './modules/PrTrackingModule';
import PoTrackingModule, { type PoTrackingModuleHandle } from './modules/PoTrackingModule';
import SupplierModule from './modules/SupplierModule';
import PaymentRiskModule from './modules/PaymentRiskModule';
import ExpediteModule from './modules/ExpediteModule';
import ContractRiskModule from './modules/ContractRiskModule';

type TabId = 'pr' | 'po' | 'supplier' | 'payment' | 'expedite' | 'contract';

interface TabDef {
  id: TabId;
  label: string;
  badge?: string;
  badgeTone?: 'blue' | 'orange' | 'red' | 'gray';
}

interface ProcurementTaskDetailViewProps {
  task: ProcurementTask;
  onBack: () => void;
  onTaskMutated: () => void;
}

const TABS: TabDef[] = [
  { id: 'pr',       label: 'PR 跟单'  },
  { id: 'po',       label: 'PO 跟单'  },
  { id: 'supplier', label: '供应商'    },
  { id: 'payment',  label: '付款风险', badge: '—', badgeTone: 'gray' },
  { id: 'expedite', label: '催货管理'  },
  { id: 'contract', label: '签约风险', badge: '—', badgeTone: 'gray' },
];

export default function ProcurementTaskDetailView({
  task,
  onBack,
  onTaskMutated,
}: ProcurementTaskDetailViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('pr');
  const [refreshKey, setRefreshKey] = useState(0);
  const [filterDetailOpen, setFilterDetailOpen] = useState(false);
  const poModuleRef = useRef<PoTrackingModuleHandle>(null);

  /** 供应商概览点击供应商 → 切换到 PO 跟单 Tab 并预填搜索词 */
  const handleNavigateToPoBySupplier = (supplierName: string) => {
    poModuleRef.current?.filterBySupplier(supplierName);
    setActiveTab('po');
  };

  const f = task.filter;
  const filterItems = [
    { label: 'PR单号',  values: f.prBillnos,       count: f.prBillnos.length },
    { label: '项目号',  values: f.projectIds,      count: f.projectIds.length },
    { label: '物料编码', values: f.materialNumbers, count: f.materialNumbers.length },
    { label: '物料名称', values: f.materialNames,   count: f.materialNames.length },
  ].filter((it) => it.count > 0);

  const demandDateCount = Object.keys(task.prDemandDates).length;
  const isActive = task.status === 'active';

  const createdAt = new Date(task.createdAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const filterSummaryShort =
    filterItems.length === 0
      ? '未设置'
      : filterItems.map((it) => `${it.label} ${it.count} 项`).join(' · ');

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* ── 任务头部：单行摘要 + 可展开过滤详情 ── */}
      <div className="bg-white border-b border-[#e5ebf3] px-6 py-2.5 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-0.5 text-xs text-[#6c7a90] hover:text-[#2f6bff] transition-colors flex-shrink-0"
          >
            <ChevronLeft size={14} />
            返回
          </button>

          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${
              isActive ? 'bg-[#ebfff2] text-[#2fb36d]' : 'bg-slate-100 text-[#6c7a90]'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-[#2fb36d]' : 'bg-[#6c7a90]'}`} />
            {isActive ? '进行中' : '已归档'}
          </span>

          <h2 className="text-sm font-bold text-[#1f2d3d] truncate min-w-0 max-w-[10rem] sm:max-w-[14rem] md:max-w-xs flex-shrink">
            {task.name}
          </h2>

          <span className="text-[#e5ebf3] hidden sm:inline select-none">|</span>

          <span
            className="text-[10px] text-[#6c7a90] flex items-center gap-1 min-w-0"
            title={
              filterItems.length
                ? filterItems.map((it) => `${it.label}: ${it.values.join('、')}`).join('；')
                : '未设置过滤条件时，PR/PO 等模块无法按范围拉取数据'
            }
          >
            <span className="text-[#6c7a90] shrink-0">过滤</span>
            <span className="text-[#1f2d3d] font-medium truncate max-w-[10rem] sm:max-w-[18rem] md:max-w-[28rem]">
              {filterSummaryShort}
            </span>
          </span>

          {filterItems.length > 0 ? (
            <button
              type="button"
              onClick={() => setFilterDetailOpen((v) => !v)}
              className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#2f6bff] hover:text-[#2558e0] shrink-0"
            >
              {filterDetailOpen ? (
                <>
                  收起
                  <ChevronUp size={12} strokeWidth={2.5} />
                </>
              ) : (
                <>
                  展开详情
                  <ChevronDown size={12} strokeWidth={2.5} />
                </>
              )}
            </button>
          ) : null}

          <span className="text-[#e5ebf3] select-none">|</span>

          <span className="text-[10px] text-[#6c7a90] shrink-0 whitespace-nowrap">
            需求日期 <span className="font-semibold text-[#1f2d3d]">{demandDateCount}</span> 条
          </span>
          <span className="text-[#e5ebf3] select-none">|</span>
          <span className="text-[10px] text-[#6c7a90] shrink-0 whitespace-nowrap">
            创建于 <span className="font-medium text-[#1f2d3d]">{createdAt}</span>
          </span>

          <span className="flex-1 min-w-[0.5rem]" aria-hidden />

          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="刷新所有模块数据"
            className="w-7 h-7 flex items-center justify-center text-[#6c7a90] hover:text-[#2f6bff] hover:bg-[#eef4ff] rounded-lg transition-colors flex-shrink-0"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {filterDetailOpen && filterItems.length > 0 ? (
          <div className="mt-2 pt-2 border-t border-[#f4f7fb] flex flex-wrap gap-2">
            {filterItems.map((it) => (
              <div
                key={it.label}
                title={it.values.join('、')}
                className="min-w-0 max-w-full sm:max-w-[min(100%,24rem)] rounded-lg border border-[#e5ebf3] bg-[#f4f7fb] px-2.5 py-1.5 text-left"
              >
                <div className="flex items-baseline gap-1.5 text-[10px] text-[#6c7a90] mb-0.5">
                  <span className="font-semibold text-[#1f2d3d]">{it.label}</span>
                  <span className="text-[#2f6bff] font-semibold tabular-nums">{it.count} 项</span>
                </div>
                <p className="text-[10px] font-mono text-[#374c63] leading-snug break-all">{it.values.join('、')}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* ── Tab 导航 ── */}
      <div className="bg-white border-b border-[#e5ebf3] px-6 flex gap-0 flex-shrink-0">
        {TABS.map((tab) => {
          const isActiveTab = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all duration-150 whitespace-nowrap ${
                isActiveTab
                  ? 'text-[#2f6bff] border-[#2f6bff]'
                  : 'text-[#6c7a90] border-transparent hover:text-[#2f6bff] hover:border-[#2f6bff]/30'
              }`}
            >
              {tab.label}
              {tab.badge && (
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold leading-none ${
                    tab.badgeTone === 'orange'
                      ? 'bg-[#fff6eb] text-[#ff9f43]'
                      : tab.badgeTone === 'red'
                      ? 'bg-[#fff2f1] text-[#f25f5c]'
                      : tab.badgeTone === 'blue'
                      ? 'bg-[#eef4ff] text-[#2f6bff]'
                      : 'bg-slate-100 text-[#6c7a90]'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab 内容区（全部挂载，CSS 显隐保留状态） ── */}
      <div className="flex-1 overflow-y-auto bg-[#f4f7fb]" key={refreshKey}>
        <div className={`p-6 ${activeTab === 'pr' ? '' : 'hidden'}`}>
          <PrTrackingModule task={task} onTaskMutated={onTaskMutated} />
        </div>
        <div className={`p-6 ${activeTab === 'po' ? '' : 'hidden'}`}>
          <PoTrackingModule ref={poModuleRef} task={task} />
        </div>
        <div className={`p-6 ${activeTab === 'supplier' ? '' : 'hidden'}`}>
          <SupplierModule task={task} onNavigateToPo={handleNavigateToPoBySupplier} />
        </div>
        <div className={`p-6 ${activeTab === 'payment' ? '' : 'hidden'}`}>
          <PaymentRiskModule />
        </div>
        <div className={`p-6 ${activeTab === 'expedite' ? '' : 'hidden'}`}>
          <ExpediteModule />
        </div>
        <div className={`p-6 ${activeTab === 'contract' ? '' : 'hidden'}`}>
          <ContractRiskModule />
        </div>
      </div>
    </div>
  );
}
